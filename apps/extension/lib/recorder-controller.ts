import { browser } from 'wxt/browser';
import {
  createGuide,
  sanitizeSourceUrl,
  validateGuide,
  MAX_IMAGE_BYTES,
  type GuideAsset,
  type GuideDocument,
  type GuideStep,
} from '@interactive-learning/protocol';
import { applyStepDraft } from '@interactive-learning/editor/draft';
import { GuideStore } from './guide-store';
import {
  CHANNEL,
  SESSION_KEY,
  idleState,
  sameSite,
  sameView,
  siteOf,
  type CaptureContext,
  type Command,
  type RecorderState,
} from './messages';

const CAPTURE_INTERVAL_MS = 600;
const NO_TAB_ACCESS =
  'Chrome did not allow access to this tab. Click the Interactive Learning icon while the tab is open, then try again.';
const ACCESS_LOST =
  'Chrome no longer lets the extension see this tab. Click the Interactive Learning icon in the toolbar to continue recording.';
const MAX_SESSION_BYTES = 80 * 1024 * 1024;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class RecorderController {
  private readonly store = new GuideStore();
  private tail: Promise<unknown> = Promise.resolve();
  private pendingCapture?: ReturnType<typeof setTimeout>;

  private serial<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task);
    this.tail = result.catch(() => {});
    return result;
  }

  private async state(): Promise<RecorderState> {
    const values = await browser.storage.local.get(SESSION_KEY);
    return (values[SESSION_KEY] as RecorderState | undefined) ?? idleState();
  }

  private async save(state: RecorderState): Promise<RecorderState> {
    await browser.storage.local.set({ [SESSION_KEY]: state });
    await browser.action.setBadgeText({
      text:
        state.status === 'recording'
          ? String(state.stepCount)
          : state.status === 'paused'
            ? 'Ⅱ'
            : '',
    });
    await browser.action.setBadgeBackgroundColor({
      color: state.status === 'recording' ? '#176b53' : '#9e6e35',
    });
    return state;
  }

  private diagnostic(state: RecorderState, message: string): void {
    if (state.diagnostics[0]?.message === message) return;
    state.diagnostics.unshift({ id: crypto.randomUUID(), message, at: new Date().toISOString() });
    state.diagnostics = state.diagnostics.slice(0, 8);
  }

  private async context(tabId: number): Promise<CaptureContext> {
    return browser.tabs.sendMessage(tabId, { channel: CHANNEL, type: 'context' });
  }

  private async inject(tabId: number, active = true): Promise<CaptureContext> {
    await browser.scripting.executeScript({
      target: { tabId },
      files: ['/content-scripts/observer.js'],
    });
    return browser.tabs.sendMessage(tabId, { channel: CHANNEL, type: 'observe', active });
  }

  private async guide(state: RecorderState): Promise<GuideDocument> {
    const guide = state.guideId ? await this.store.read(state.guideId) : undefined;
    if (!guide) throw new Error('The local guide was not found. Start a new recording.');
    return guide;
  }

  private scheduleCapture(reason: string): void {
    clearTimeout(this.pendingCapture);
    this.pendingCapture = setTimeout(() => {
      this.pendingCapture = undefined;
      void this.serial(() => this.capture(reason)).catch(() => {});
    }, 400);
  }

  /** Stops the observer of the previous session and forgets its guide, unless it is kept. */
  private async release(state: RecorderState, keep?: string): Promise<void> {
    clearTimeout(this.pendingCapture);
    if (state.tabId !== undefined) {
      await browser.tabs
        .sendMessage(state.tabId, { channel: CHANNEL, type: 'observe', active: false })
        .catch(() => {});
    }
    if (state.guideId && state.guideId !== keep) await this.store.delete(state.guideId);
  }

  command(command: Exclude<Command, { type: 'observation' }>): Promise<RecorderState> {
    return this.serial(async () => {
      const state = await this.state();
      if (command.type === 'state') return state;
      if (command.type === 'start') {
        // The panel names its own tab, so another window or tab is never recorded by mistake.
        const tab = await browser.tabs.get(command.tabId).catch(() => undefined);
        if (tab?.id === undefined) throw new Error('This tab is closed.');
        if (!tab.url) throw new Error(NO_TAB_ACCESS);
        if (!/^https?:\/\//.test(tab.url)) {
          throw new Error('Only websites can be recorded. Open an HTTP or HTTPS page.');
        }
        // Chrome grants access to a tab when its toolbar icon is clicked there (activeTab).
        await this.inject(tab.id).catch(() => {
          throw new Error(NO_TAB_ACCESS);
        });
        await this.release(state);
        const guide = createGuide(
          typeof command.title === 'string' ? command.title.slice(0, 200) : 'My guide',
        );
        await this.store.write(guide);
        await this.save({
          ...idleState(),
          status: 'recording',
          guideId: guide.id,
          title: guide.title,
          tabId: tab.id,
          windowId: tab.windowId,
          origin: new URL(tab.url).origin,
          lastCaptureAt: state.lastCaptureAt,
        });
        return this.capture('initial');
      }
      if (command.type === 'discard') {
        await this.release(state);
        return this.save({ ...idleState(), lastCaptureAt: state.lastCaptureAt });
      }
      if (command.type === 'import') return this.import(state, command.guideId);
      if (command.type === 'edit-step') return this.editStep(state, command);
      if (command.type === 'delete-step') return this.deleteStep(state, command.stepId);
      if (!state.guideId || state.tabId === undefined)
        throw new Error('Start a guide to continue.');
      if (command.type === 'retake') return this.retake(state, command.stepId);
      if (command.type === 'capture') {
        if (!['recording', 'paused'].includes(state.status))
          throw new Error('This guide is finished. Start a new guide.');
        return this.capture('manual', true);
      }
      if (command.type === 'resume') return this.resume(state);
      clearTimeout(this.pendingCapture);
      state.status = command.type === 'pause' ? 'paused' : 'stopped';
      if (command.type === 'pause') state.pausedFor = 'user';
      else delete state.pausedFor;
      await browser.tabs
        .sendMessage(state.tabId, { channel: CHANNEL, type: 'observe', active: false })
        .catch(() => {});
      return this.save(state);
    });
  }

  /** Continues a paused recording once the tab shows the same site and Chrome gives access to it. */
  private async resume(state: RecorderState): Promise<RecorderState> {
    const tab = await browser.tabs.get(state.tabId!).catch(() => undefined);
    if (!tab) throw new Error('The recorded tab is closed. Finish the guide to keep its steps.');
    // Without access, Chrome hides the address of the tab: the page itself may be right.
    if (!tab.url) throw new Error(ACCESS_LOST);
    if (!sameSite(tab.url, state.origin!)) {
      throw new Error(
        `This tab shows another site. Go back to ${siteOf(state.origin!)} in it to resume.`,
      );
    }
    await this.inject(state.tabId!).catch(() => {
      throw new Error(ACCESS_LOST);
    });
    state.status = 'recording';
    delete state.pausedFor;
    await this.save(state);
    return this.capture('resume');
  }

  /**
   * A click on the toolbar icon gives the tab back to the extension. A recording that stopped
   * because the tab changed site or lost access then continues by itself; a pause chosen in the
   * panel stays a pause.
   */
  accessGranted(tabId: number): Promise<RecorderState> {
    return this.serial(async () => {
      const state = await this.state();
      if (state.status !== 'paused' || state.tabId !== tabId) return state;
      if (!state.pausedFor || state.pausedFor === 'user') return state;
      try {
        return await this.resume(state);
      } catch (error) {
        this.diagnostic(state, error instanceof Error ? error.message : ACCESS_LOST);
        return this.save(state);
      }
    });
  }

  /** Markers, click point and texts edited in the panel. Validation rejects invalid positions. */
  private async editStep(
    state: RecorderState,
    command: Extract<Command, { type: 'edit-step' }>,
  ): Promise<RecorderState> {
    const guide = await this.guide(state);
    if (!guide.steps.some((step) => step.id === command.stepId)) {
      throw new Error('This step no longer exists.');
    }
    const edited = validateGuide({
      ...guide,
      updatedAt: new Date().toISOString(),
      steps: guide.steps.map((step) =>
        step.id === command.stepId ? applyStepDraft(step, command) : step,
      ),
    });
    await this.store.write(edited);
    return this.save(state);
  }

  /** A guide the panel imported and stored. It opens finished, ready to edit and export. */
  private async import(state: RecorderState, guideId: string): Promise<RecorderState> {
    const guide = await this.store.read(guideId);
    if (!guide) throw new Error('The imported guide was not found.');
    const imageBytes = guide.assets.reduce(
      (total, asset) => total + Math.ceil(asset.src.length * 0.75),
      0,
    );
    if (imageBytes > MAX_SESSION_BYTES) {
      await this.store.delete(guideId);
      throw new Error('This guide is larger than the 80 MB the extension keeps.');
    }
    await this.release(state, guideId);
    const url = guide.steps.find((step) => step.source?.url)?.source?.url;
    return this.save({
      ...idleState(),
      status: 'stopped',
      guideId,
      title: guide.title,
      stepCount: guide.steps.length,
      imageBytes,
      ...(url ? { origin: new URL(url).origin } : {}),
      lastCaptureAt: state.lastCaptureAt,
    });
  }

  private async deleteStep(state: RecorderState, stepId: string): Promise<RecorderState> {
    const guide = await this.guide(state);
    const step = guide.steps.find((entry) => entry.id === stepId);
    if (!step) throw new Error('This step no longer exists.');
    guide.steps = guide.steps.filter((entry) => entry !== step);
    this.dropUnusedAssets(guide, state);
    guide.updatedAt = new Date().toISOString();
    await this.store.write(guide);
    state.stepCount = guide.steps.length;
    if (state.lastCapture?.stepId === stepId) state.lastCapture = undefined;
    return this.save(state);
  }

  /** Replaces the screenshot of one step with the current view of the recorded tab. */
  private async retake(state: RecorderState, stepId: string): Promise<RecorderState> {
    const guide = await this.guide(state);
    const step = guide.steps.find((entry) => entry.id === stepId);
    if (!step) throw new Error('This step no longer exists.');
    try {
      // After a navigation, a finished or paused session has no observer in the page yet.
      await this.inject(state.tabId!, state.status === 'recording');
      const { src, context } = await this.shoot(state);
      const asset = await this.asset(src, state);
      guide.assets.push(asset);
      step.assetId = asset.id;
      step.source = { ...this.source(context), reason: step.source?.reason ?? 'manual' };
      this.dropUnusedAssets(guide, state);
      guide.updatedAt = new Date().toISOString();
      await this.store.write(guide);
      if (state.lastCapture?.stepId === stepId) state.lastCapture = { stepId, context };
    } catch (error) {
      await this.save(state);
      throw error instanceof Error && /permission|cannot access/i.test(error.message)
        ? new Error(NO_TAB_ACCESS)
        : error;
    }
    return this.save(state);
  }

  private dropUnusedAssets(guide: GuideDocument, state: RecorderState): void {
    const used = new Set(guide.steps.map((step) => step.assetId));
    for (const asset of guide.assets.filter((entry) => !used.has(entry.id))) {
      state.imageBytes = Math.max(0, state.imageBytes - Math.ceil(asset.src.length * 0.75));
    }
    guide.assets = guide.assets.filter((asset) => used.has(asset.id));
  }

  observe(
    command: Extract<Command, { type: 'observation' }>,
    tabId?: number,
    frameId?: number,
  ): Promise<RecorderState> {
    return this.serial(async () => {
      const state = await this.state();
      if (state.status !== 'recording' || tabId !== state.tabId || frameId !== 0) return state;
      if (command.point && state.lastCapture) {
        if (sameView(state.lastCapture.context, command.context)) {
          const guide = await this.guide(state);
          let step = guide.steps.find((entry) => entry.id === state.lastCapture?.stepId);
          if (step && command.context.viewport.width > 0 && command.context.viewport.height > 0) {
            if (step.cursor) {
              if (guide.steps.length >= 500) {
                state.status = 'paused';
                this.diagnostic(
                  state,
                  'This guide reached 500 steps. Export it, then start another guide.',
                );
                return this.save(state);
              }
              step = { ...step, id: crypto.randomUUID(), annotations: [...step.annotations] };
              guide.steps.push(step);
              state.lastCapture.stepId = step.id;
            }
            step.cursor = {
              x: Math.max(0, Math.min(1, command.point.x / command.context.viewport.width)),
              y: Math.max(0, Math.min(1, command.point.y / command.context.viewport.height)),
              action: 'click',
            };
            guide.updatedAt = new Date().toISOString();
            await this.store.write(guide);
            state.stepCount = guide.steps.length;
          }
        } else {
          this.diagnostic(
            state,
            'A click happened after the view changed. Its pointer was left out to avoid a wrong position.',
          );
        }
      }
      if (command.reason === 'submit') {
        this.diagnostic(
          state,
          'A form was submitted. The automatic capture may show the result. To keep the filled form, use "Capture step" before you submit.',
        );
      }
      await this.save(state);
      this.scheduleCapture(command.reason);
      return state;
    });
  }

  navigation(tabId: number, url: string): Promise<void> {
    return this.serial(async () => {
      const state = await this.state();
      if (state.status !== 'recording' || tabId !== state.tabId) return;
      if (!/^https?:\/\//.test(url) || !sameSite(url, state.origin!)) {
        clearTimeout(this.pendingCapture);
        state.status = 'paused';
        state.pausedFor = 'site';
        const site = siteOf(state.origin!);
        this.diagnostic(
          state,
          `The tab left ${site}. Go back to ${site}, then click the Interactive Learning icon in the toolbar to continue.`,
        );
        await this.save(state);
        return;
      }
      try {
        await this.inject(tabId);
        this.scheduleCapture('navigation');
      } catch {
        // Chrome withdraws its access when the address changes origin, even on the same site.
        clearTimeout(this.pendingCapture);
        state.status = 'paused';
        state.pausedFor = 'access';
        this.diagnostic(state, ACCESS_LOST);
        await this.save(state);
      }
    });
  }

  tabClosed(tabId: number): Promise<void> {
    return this.serial(async () => {
      const state = await this.state();
      if (tabId !== state.tabId) return;
      clearTimeout(this.pendingCapture);
      state.status = 'stopped';
      this.diagnostic(
        state,
        'The tab was closed. The steps already recorded can still be exported.',
      );
      await this.save(state);
    });
  }

  /** Screenshots the recorded tab, provided it stays active and unchanged during the capture. */
  private async shoot(state: RecorderState): Promise<{ src: string; context: CaptureContext }> {
    await sleep(Math.max(0, state.lastCaptureAt + CAPTURE_INTERVAL_MS - Date.now()));
    const [active] = await browser.tabs.query({ active: true, windowId: state.windowId });
    if (active?.id !== state.tabId)
      throw new Error('The recorded tab must be active to be captured.');
    const before = await this.context(state.tabId!);
    if (!sameSite(before.url, state.origin!))
      throw new Error(`This page is outside ${siteOf(state.origin!)}.`);
    state.lastCaptureAt = Date.now();
    const src = await browser.tabs.captureVisibleTab(state.windowId!, { format: 'png' });
    const after = await this.context(state.tabId!);
    const [stillActive] = await browser.tabs.query({ active: true, windowId: state.windowId });
    if (stillActive?.id !== state.tabId || !sameView(before, after)) {
      throw new Error(
        'The view changed during the capture, so it was discarded. Capture again once the page is stable.',
      );
    }
    return { src, context: after };
  }

  /** Checks the size limits, then counts the image in the session. */
  private async asset(src: string, state: RecorderState): Promise<GuideAsset> {
    const bytes = Math.ceil(src.length * 0.75);
    if (bytes > MAX_IMAGE_BYTES)
      throw new Error('This image exceeds 12 MB. Make the window smaller, then capture again.');
    if (state.imageBytes + bytes > MAX_SESSION_BYTES) {
      state.status = 'paused';
      throw new Error(
        'This guide reached the 80 MB local limit. Export it, then start another guide.',
      );
    }
    const bitmap = await createImageBitmap(await (await fetch(src)).blob());
    const asset = {
      id: crypto.randomUUID(),
      src,
      mimeType: 'image/png' as const,
      width: bitmap.width,
      height: bitmap.height,
    };
    bitmap.close();
    state.imageBytes += bytes;
    return asset;
  }

  private source(context: CaptureContext): Omit<NonNullable<GuideStep['source']>, 'reason'> {
    return {
      url: sanitizeSourceUrl(context.url),
      capturedAt: new Date().toISOString(),
      viewport: context.viewport,
      scroll: context.scroll,
      dpr: context.dpr,
    };
  }

  private async capture(reason: string, manual = false): Promise<RecorderState> {
    const state = await this.state();
    if (state.tabId === undefined || state.windowId === undefined || !state.guideId) return state;
    if (state.status !== 'recording' && !(manual && state.status === 'paused')) return state;
    try {
      const { src, context: after } = await this.shoot(state);
      const guide = await this.guide(state);
      if (guide.steps.length >= 500) {
        state.status = 'paused';
        throw new Error('This guide reached 500 steps. Export it, then start another guide.');
      }
      const previousAsset = guide.assets.find((asset) => asset.id === guide.steps.at(-1)?.assetId);
      if (
        !manual &&
        previousAsset?.src === src &&
        state.lastCapture &&
        sameView(state.lastCapture.context, after)
      ) {
        return this.save(state);
      }
      const asset = await this.asset(src, state);
      const titles: Record<string, string> = {
        initial: 'Starting point',
        navigation: 'New page',
        click: 'After the click',
        'form-input': 'Form filled in',
        'form-change': 'Form filled in',
        submit: 'After submitting',
        manual: 'Captured step',
        resume: 'Walkthrough resumed',
        scroll: 'Further down the page',
        resize: 'New view',
      };
      const step = {
        id: crypto.randomUUID(),
        title: titles[reason] ?? after.title ?? 'Walkthrough step',
        description: '',
        durationMs: 2500,
        assetId: asset.id,
        annotations: [],
        source: { ...this.source(after), reason },
      };
      guide.assets.push(asset);
      guide.steps.push(step);
      guide.updatedAt = step.source.capturedAt;
      await this.store.write(guide);
      state.lastCapture = { stepId: step.id, context: after };
      state.stepCount = guide.steps.length;
    } catch (error) {
      if (error instanceof Error && /permission|cannot access/i.test(error.message)) {
        // Without access every next capture fails too: wait for a click on the toolbar icon.
        clearTimeout(this.pendingCapture);
        state.status = 'paused';
        state.pausedFor = 'access';
        this.diagnostic(state, ACCESS_LOST);
      } else {
        this.diagnostic(
          state,
          error instanceof Error ? error.message : 'The capture failed. Try again from the panel.',
        );
      }
    }
    return this.save(state);
  }
}
