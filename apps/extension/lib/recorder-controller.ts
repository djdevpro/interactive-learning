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
    if (!guide)
      throw new Error('Le guide local est introuvable. Commencez un nouvel enregistrement.');
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
          throw new Error(
            'Ouvrez un site HTTP ou HTTPS puis démarrez la capture depuis cet onglet.',
          );
        }
        const guide = createGuide(
          typeof command.title === 'string' ? command.title.slice(0, 200) : 'Mon guide',
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
        throw new Error('Démarrez un guide pour continuer.');
      if (command.type === 'capture') {
        if (!['recording', 'paused'].includes(state.status))
          throw new Error('Le guide est arrêté. Démarrez un nouveau guide.');
        return this.capture('manual', true);
      }
      if (command.type === 'resume') {
        const tab = await browser.tabs.get(state.tabId);
        if (!tab.url || new URL(tab.url).origin !== state.origin) {
          throw new Error('Revenez sur le site initial pour reprendre ce guide.');
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
                  'Ce guide atteint 500 étapes. Exportez-le puis commencez un autre guide.',
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
            'Un clic a été observé après un changement de vue. Son pointeur a été omis pour éviter une mauvaise position.',
          );
        }
      }
      if (command.reason === 'submit') {
        this.diagnostic(
          state,
          'Soumission observée : la capture automatique peut montrer le résultat. Pour garder le formulaire rempli, utilisez « Capturer » avant de valider.',
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
          'Le parcours a quitté le site autorisé. Revenez sur le site initial pour reprendre, ou démarrez un autre guide.',
        );
        await this.save(state);
        return;
      }
      try {
        await this.inject(tabId);
        this.scheduleCapture('navigation');
      } catch {
        this.diagnostic(
          state,
          'La nouvelle page ne permet pas la capture. Ouvrez le popup pour réessayer.',
        );
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
        'L’onglet a été fermé. Les étapes déjà enregistrées restent disponibles à l’export.',
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
        throw new Error('L’onglet enregistré doit être actif pour le photographier.');
      const before = await this.context(state.tabId);
      if (new URL(before.url).origin !== state.origin)
        throw new Error('Cette page est hors du site autorisé.');
      state.lastCaptureAt = Date.now();
      const src = await browser.tabs.captureVisibleTab(state.windowId, { format: 'png' });
      const after = await this.context(state.tabId);
      const [stillActive] = await browser.tabs.query({ active: true, windowId: state.windowId });
      if (stillActive?.id !== state.tabId || !sameView(before, after)) {
        throw new Error(
          'La vue a changé pendant la capture. Capture écartée ; utilisez « Capturer » lorsque la page est stable.',
        );
      }
      const guide = await this.guide(state);
      if (guide.steps.length >= 500) {
        state.status = 'paused';
        throw new Error('Ce guide atteint 500 étapes. Exportez-le puis commencez un autre guide.');
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
        throw new Error(
          'Cette image dépasse 12 Mo. Réduisez la taille de la fenêtre puis capturez à nouveau.',
        );
      if (state.imageBytes + bytes > MAX_SESSION_BYTES) {
        state.status = 'paused';
        throw new Error(
          'Ce guide atteint la limite locale de 80 Mo. Exportez-le puis commencez un autre guide.',
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
        initial: 'Point de départ',
        navigation: 'Nouvelle page',
        click: 'Après le clic',
        'form-input': 'Formulaire complété',
        'form-change': 'Formulaire complété',
        submit: 'Après validation',
        manual: 'Capture de l’étape',
        resume: 'Reprise du parcours',
        scroll: 'Suite de la page',
        resize: 'Nouvelle vue',
      };
      const step = {
        id: crypto.randomUUID(),
        title: titles[reason] ?? after.title ?? 'Étape du parcours',
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
        error instanceof Error ? error.message : 'La capture a échoué. Réessayez depuis le popup.',
      );
    }
    return this.save(state);
  }
}
