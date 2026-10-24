import { browser } from 'wxt/browser';
import { CHANNEL, type CaptureContext } from '../lib/messages';

export default defineContentScript({
  // Injected explicitly after the user grants activeTab; no persistent host grants.
  matches: [],
  registration: 'runtime',
  main(ctx) {
    const scope = globalThis as typeof globalThis & { __interactiveLearningObserver?: boolean };
    if (scope.__interactiveLearningObserver) return;
    scope.__interactiveLearningObserver = true;
    let active = false;
    let revision = 0;
    let timer: number | undefined;
    const documentToken = crypto.randomUUID();

    const context = (): CaptureContext => ({
      url: location.href,
      title: document.title,
      documentToken,
      revision,
      viewport: { width: innerWidth, height: innerHeight },
      scroll: { x: scrollX, y: scrollY },
      dpr: devicePixelRatio,
    });

    const observe = (reason: string, point?: { x: number; y: number }) => {
      if (!active || !ctx.isValid) return;
      void browser.runtime
        .sendMessage({ channel: CHANNEL, type: 'observation', reason, context: context(), point })
        .catch(() => {});
    };

    const schedule = (reason: string) => {
      if (!active) return;
      clearTimeout(timer);
      timer = ctx.setTimeout(() => observe(reason), 700);
    };

    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.channel !== CHANNEL) return;
      if (message.type === 'context') sendResponse(context());
      if (message.type === 'observe') {
        active = Boolean(message.active);
        if (!active) clearTimeout(timer);
        sendResponse(context());
      }
    });

    const mutations = new MutationObserver(() => {
      revision += 1;
    });
    mutations.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });
    ctx.onInvalidated(() => {
      mutations.disconnect();
      clearTimeout(timer);
      scope.__interactiveLearningObserver = false;
    });

    // pointerdown records the view before the application handles its click.
    ctx.addEventListener(
      document,
      'pointerdown',
      (event) => {
        if (event.button !== 0) return;
        observe('click', { x: event.clientX, y: event.clientY });
      },
      { capture: true, passive: true },
    );
    ctx.addEventListener(
      document,
      'input',
      () => {
        revision += 1;
        schedule('form-input');
      },
      { capture: true, passive: true },
    );
    ctx.addEventListener(
      document,
      'change',
      () => {
        revision += 1;
        schedule('form-change');
      },
      { capture: true, passive: true },
    );
    ctx.addEventListener(
      document,
      'submit',
      () => {
        clearTimeout(timer);
        observe('submit');
      },
      { capture: true, passive: true },
    );
    ctx.addEventListener(window, 'scroll', () => schedule('scroll'), { passive: true });
    ctx.addEventListener(window, 'resize', () => schedule('resize'), { passive: true });
    ctx.addEventListener(window, 'pageshow', () => schedule('page-restored'), { passive: true });
  },
});
