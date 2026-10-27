// Runs in every page of the site view and reports what the person does to the studio through a
// DevTools binding. It only listens: it never blocks, changes or replays anything in the page.
(() => {
  if (window.top !== window || window.__interactiveLearningObserver) return;
  window.__interactiveLearningObserver = true;
  const binding = '__interactiveLearning';
  let revision = 0;
  let settleTimer = 0;
  let firstChange = 0;
  let scrollTimer = 0;

  const state = () => {
    const root = document.documentElement;
    const body = document.body;
    return {
      url: location.href,
      title: document.title,
      revision,
      scroll: { x: scrollX, y: scrollY },
      viewport: { width: innerWidth, height: innerHeight },
      page: {
        width: Math.max(root ? root.scrollWidth : 0, innerWidth),
        height: Math.max(root ? root.scrollHeight : 0, body ? body.scrollHeight : 0, innerHeight),
      },
    };
  };

  // The studio silences the observer while it scrolls the page for a capture.
  const quiet = () => performance.now() < (window.__interactiveLearningQuiet || 0);
  // Changes that follow an action of the person are worth a capture; a page that keeps changing
  // on its own, such as a carousel, is not captured over and over.
  let lastAction = performance.now();
  const acted = () => {
    lastAction = performance.now();
  };

  const send = (type, extra) => {
    const report = window[binding];
    if (typeof report !== 'function') return;
    try {
      report(JSON.stringify({ type, ...state(), ...extra }));
    } catch {
      // The studio closed the binding; the page goes on.
    }
  };

  // The page is settled after 500 ms without change, or after 2 s of constant change, so an
  // animated page still gets its screenshots.
  const changed = () => {
    if (quiet()) return;
    revision += 1;
    const now = Date.now();
    if (!firstChange) firstChange = now;
    clearTimeout(settleTimer);
    const wait = Math.max(0, Math.min(500, 2000 - (now - firstChange)));
    settleTimer = setTimeout(() => {
      firstChange = 0;
      send('settled', { sinceAction: Math.round(performance.now() - lastAction) });
    }, wait);
  };

  // Words a viewer would use for the clicked element. Field values are never read.
  const label = (element) => {
    if (!(element instanceof Element)) return '';
    const target =
      element.closest(
        'a, button, summary, label, select, textarea, input, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="option"], [role="checkbox"]',
      ) ?? element;
    const field =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement;
    const text =
      target.getAttribute('aria-label') ||
      (field
        ? (target.labels && target.labels[0] && target.labels[0].innerText) ||
          target.getAttribute('placeholder') ||
          target.getAttribute('name')
        : target.innerText || target.textContent) ||
      target.getAttribute('title') ||
      target.getAttribute('alt') ||
      '';
    return text.replace(/\s+/g, ' ').trim().slice(0, 80);
  };

  new MutationObserver(changed).observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
  for (const type of ['input', 'change']) {
    addEventListener(
      type,
      () => {
        acted();
        changed();
      },
      true,
    );
  }
  addEventListener('keydown', acted, true);
  addEventListener('load', () => {
    acted();
    changed();
  });
  addEventListener(
    'pointerdown',
    (event) => {
      acted();
      if (event.button !== 0 || !event.isPrimary) return;
      send('click', { point: { x: event.clientX, y: event.clientY }, label: label(event.target) });
    },
    true,
  );
  addEventListener(
    'scroll',
    () => {
      if (quiet()) return;
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => send('scroll'), 250);
    },
    { capture: true, passive: true },
  );
  changed();
})();
