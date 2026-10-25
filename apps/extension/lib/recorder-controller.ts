import { browser } from 'wxt/browser';
import {
  createGuide,
  sanitizeSourceUrl,
  MAX_IMAGE_BYTES,
  type GuideDocument,
} from '@interactive-learning/protocol';
import { GuideStore } from './guide-store';
import {
  CHANNEL,
  SESSION_KEY,
  idleState,
  sameView,
  type CaptureContext,
  type Command,
  type RecorderState,
} from './messages';

const CAPTURE_INTERVAL_MS = 600;
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

  private async inject(tabId: number): Promise<CaptureContext> {
    await browser.scripting.executeScript({
      target: { tabId },
      files: ['/content-scripts/observer.js'],
    });
    return browser.tabs.sendMessage(tabId, { channel: CHANNEL, type: 'observe', active: true });
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

  command(command: Exclude<Command, { type: 'observation' }>): Promise<RecorderState> {
    return this.serial(async () => {
      const state = await this.state();
      if (command.type === 'state') return state;
      if (command.type === 'start') {
        clearTimeout(this.pendingCapture);
        if (state.tabId !== undefined) {
          await browser.tabs
            .sendMessage(state.tabId, { channel: CHANNEL, type: 'observe', active: false })
            .catch(() => {});
        }
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        if (tab?.id === undefined || !tab.url || !/^https?:\/\//.test(tab.url)) {
          throw new Error('Open an HTTP or HTTPS site, then start recording from that tab.');
        }
        const guide = createGuide(
          typeof command.title === 'string' ? command.title.slice(0, 200) : 'My guide',
        );
        await this.inject(tab.id);
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
      if (!state.guideId || state.tabId === undefined)
        throw new Error('Start a guide to continue.');
      if (command.type === 'capture') {
        if (!['recording', 'paused'].includes(state.status))
          throw new Error('This guide is finished. Start a new guide.');
        return this.capture('manual', true);
      }
      if (command.type === 'resume') {
        const tab = await browser.tabs.get(state.tabId);
        if (!tab.url || new URL(tab.url).origin !== state.origin) {
          throw new Error('Go back to the original site to resume this guide.');
        }
        await this.inject(state.tabId);
        state.status = 'recording';
        await this.save(state);
        return this.capture('resume');
      }
      clearTimeout(this.pendingCapture);
      state.status = command.type === 'pause' ? 'paused' : 'stopped';
      await browser.tabs
        .sendMessage(state.tabId, { channel: CHANNEL, type: 'observe', active: false })
        .catch(() => {});
      return this.save(state);
    });
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
          'A form was submitted. The automatic capture may show the result. To keep the filled form, use "Capture this step" before you submit.',
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
      if (!/^https?:\/\//.test(url) || new URL(url).origin !== state.origin) {
        state.status = 'paused';
        this.diagnostic(
          state,
          'The walkthrough left the allowed site. Go back to the original site to resume, or start another guide.',
        );
        await this.save(state);
        return;
      }
      try {
        await this.inject(tabId);
        this.scheduleCapture('navigation');
      } catch {
        this.diagnostic(state, 'This page cannot be captured. Open the popup to try again.');
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

  private async capture(reason: string, manual = false): Promise<RecorderState> {
    const state = await this.state();
    if (state.tabId === undefined || state.windowId === undefined || !state.guideId) return state;
    if (state.status !== 'recording' && !(manual && state.status === 'paused')) return state;
    try {
      await sleep(Math.max(0, state.lastCaptureAt + CAPTURE_INTERVAL_MS - Date.now()));
      const [active] = await browser.tabs.query({ active: true, windowId: state.windowId });
      if (active?.id !== state.tabId)
        throw new Error('The recorded tab must be active to be captured.');
      const before = await this.context(state.tabId);
      if (new URL(before.url).origin !== state.origin)
        throw new Error('This page is outside the allowed site.');
      state.lastCaptureAt = Date.now();
      const src = await browser.tabs.captureVisibleTab(state.windowId, { format: 'png' });
      const after = await this.context(state.tabId);
      const [stillActive] = await browser.tabs.query({ active: true, windowId: state.windowId });
      if (stillActive?.id !== state.tabId || !sameView(before, after)) {
        throw new Error(
          'The view changed during the capture, so it was discarded. Use "Capture this step" once the page is stable.',
        );
      }
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
      const capturedAt = new Date().toISOString();
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
        source: {
          url: sanitizeSourceUrl(after.url),
          capturedAt,
          viewport: after.viewport,
          scroll: after.scroll,
          dpr: after.dpr,
          reason,
        },
      };
      guide.assets.push(asset);
      guide.steps.push(step);
      guide.updatedAt = capturedAt;
      await this.store.write(guide);
      state.lastCapture = { stepId: step.id, context: after };
      state.stepCount = guide.steps.length;
      state.imageBytes += bytes;
    } catch (error) {
      this.diagnostic(
        state,
        error instanceof Error ? error.message : 'The capture failed. Try again from the popup.',
      );
    }
    return this.save(state);
  }
}
