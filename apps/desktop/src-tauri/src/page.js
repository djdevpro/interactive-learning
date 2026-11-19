// Runs in the page of the site view when an AI agent drives the studio: it lists the elements the
// agent can act on, each with a ref, and acts on them. The observer still reports every click, so
// a click of the agent records like a click of the creator. Field values are never read: a field
// only says whether it holds something.
(() => {
  if (window.__interactiveLearningAgent) return;

  const SELECTOR = [
    'a[href]',
    'button',
    'input:not([type="hidden"])',
    'select',
    'textarea',
    'summary',
    'label[for]',
    '[contenteditable=""]',
    '[contenteditable="true"]',
    '[onclick]',
    '[tabindex]:not([tabindex="-1"])',
    ...[
      'button',
      'link',
      'tab',
      'menuitem',
      'menuitemcheckbox',
      'menuitemradio',
      'option',
      'checkbox',
      'radio',
      'switch',
      'combobox',
      'textbox',
      'searchbox',
      'slider',
      'treeitem',
      'gridcell',
    ].map((role) => `[role="${role}"]`),
  ].join(', ');
  const LIMIT = 150;

  const refs = new Map();
  const known = new WeakMap();
  let count = 0;

  const refOf = (element) => {
    let ref = known.get(element);
    if (!ref) {
      ref = `e${++count}`;
      known.set(element, ref);
    }
    refs.set(ref, new WeakRef(element));
    return ref;
  };
  const elementOf = (ref) => {
    const element = refs.get(String(ref))?.deref();
    return element && element.isConnected ? element : null;
  };

  const text = (value) =>
    String(value ?? '')
      .replace(/\s+/g, ' ')
      .trim();

  function* walk(root) {
    for (const element of root.querySelectorAll('*')) {
      yield element;
      if (element.shadowRoot) yield* walk(element.shadowRoot);
    }
  }

  const shown = (element, box) => {
    if (box.width < 1 || box.height < 1) return false;
    const style = getComputedStyle(element);
    return (
      style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.05
    );
  };

  const isField = (element) =>
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement;

  /** Words a person would use for the element, as the observer names a click. */
  const nameOf = (element) => {
    const labelled = element.getAttribute('aria-labelledby');
    const byIds = labelled
      ? labelled
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.innerText ?? '')
          .join(' ')
      : '';
    const button =
      element instanceof HTMLInputElement && ['submit', 'button', 'reset'].includes(element.type);
    const name =
      element.getAttribute('aria-label') ||
      byIds ||
      (button
        ? element.value
        : isField(element)
          ? (element.labels && element.labels[0] && element.labels[0].innerText) ||
            element.getAttribute('placeholder') ||
            element.getAttribute('name')
          : element.innerText || element.textContent) ||
      element.getAttribute('title') ||
      element.getAttribute('alt') ||
      element.querySelector?.('img[alt]')?.getAttribute('alt') ||
      '';
    return text(name).slice(0, 80);
  };

  const roleOf = (element) => {
    const role = element.getAttribute('role');
    if (role) return role;
    const tag = element.tagName.toLowerCase();
    if (tag === 'a') return 'link';
    if (tag === 'button' || tag === 'summary') return 'button';
    if (tag === 'select') return 'combobox';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'label') return 'label';
    if (tag === 'input') {
      const type = element.type;
      if (['submit', 'button', 'reset', 'image'].includes(type)) return 'button';
      if (type === 'checkbox' || type === 'radio' || type === 'range') {
        return type === 'range' ? 'slider' : type;
      }
      return type === 'search' ? 'searchbox' : 'textbox';
    }
    if (element.isContentEditable) return 'textbox';
    return 'clickable';
  };

  const box = (rect) => ({
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  });

  const describe = (element, rect, onScreen) => {
    const entry = {
      ref: refOf(element),
      role: roleOf(element),
      name: nameOf(element),
      box: box(rect),
      on_screen: onScreen,
    };
    if (element.disabled || element.getAttribute('aria-disabled') === 'true') entry.disabled = true;
    if (element instanceof HTMLInputElement) {
      if (element.type === 'checkbox' || element.type === 'radio') entry.checked = element.checked;
      else if (!['submit', 'button', 'reset', 'image'].includes(element.type)) {
        entry.type = element.type;
        entry.filled = element.value !== '';
      }
    }
    if (element instanceof HTMLTextAreaElement) entry.filled = element.value !== '';
    if (element instanceof HTMLSelectElement) {
      entry.options = [...element.options].slice(0, 20).map((option) => text(option.text));
    }
    const placeholder = element.getAttribute('placeholder');
    if (placeholder) entry.placeholder = text(placeholder).slice(0, 80);
    const expanded = element.getAttribute('aria-expanded');
    if (expanded) entry.expanded = expanded === 'true';
    if (element instanceof HTMLAnchorElement) {
      const href = element.getAttribute('href') ?? '';
      if (href && !href.startsWith('javascript:')) entry.href = href.slice(0, 160);
    }
    return entry;
  };

  const pageSize = () => {
    const root = document.documentElement;
    const body = document.body;
    return {
      width: Math.max(root ? root.scrollWidth : 0, innerWidth),
      height: Math.max(root ? root.scrollHeight : 0, body ? body.scrollHeight : 0, innerHeight),
    };
  };

  const where = () => ({
    url: location.href,
    title: document.title,
    scroll: { x: Math.round(scrollX), y: Math.round(scrollY) },
    viewport: { width: innerWidth, height: innerHeight },
    page: pageSize(),
  });

  const look = () => {
    const found = [];
    for (const element of walk(document)) {
      if (!element.matches(SELECTOR)) continue;
      const rect = element.getBoundingClientRect();
      if (!shown(element, rect)) continue;
      const onScreen =
        rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
      found.push({ element, rect, onScreen });
    }
    const chosen = [
      ...found.filter((item) => item.onScreen),
      ...found.filter((item) => !item.onScreen),
    ].slice(0, LIMIT);
    return {
      ...where(),
      headings: [...document.querySelectorAll('h1, h2, h3')]
        .map((heading) => text(heading.innerText).slice(0, 100))
        .filter(Boolean)
        .slice(0, 12),
      elements: chosen.map(({ element, rect, onScreen }) => describe(element, rect, onScreen)),
      ...(found.length > chosen.length ? { more_elements: found.length - chosen.length } : {}),
    };
  };

  const MISSING = {
    error: 'This ref is not on the page any more. Call look again and use a ref it gives.',
  };

  /** Brings the element into the window and gives the point to click, in CSS pixels. */
  const target = (ref) => {
    const element = elementOf(ref);
    if (!element) return MISSING;
    let rect = element.getBoundingClientRect();
    const inside =
      rect.top >= 0 && rect.left >= 0 && rect.bottom <= innerHeight && rect.right <= innerWidth;
    if (!inside) {
      element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
      rect = element.getBoundingClientRect();
    }
    const x = Math.min(innerWidth - 1, Math.max(0, rect.left + rect.width / 2));
    const y = Math.min(innerHeight - 1, Math.max(0, rect.top + rect.height / 2));
    const hit = document.elementFromPoint(x, y);
    const covered =
      hit && hit !== element && !element.contains(hit) && !hit.contains(element)
        ? nameOf(hit) || hit.tagName.toLowerCase()
        : null;
    return {
      x,
      y,
      name: nameOf(element),
      role: roleOf(element),
      ...(covered ? { covered_by: covered } : {}),
    };
  };

  const fire = (element, type, init = {}) =>
    element.dispatchEvent(
      type === 'input'
        ? new InputEvent('input', { bubbles: true, composed: true, ...init })
        : new Event(type, { bubbles: true, composed: true }),
    );

  const submitFrom = (element) => {
    const form = element.form || element.closest('form');
    if (!form) return false;
    if (typeof form.requestSubmit === 'function') form.requestSubmit();
    else form.submit();
    return true;
  };

  /** Types into a field the way a framework hears typing, through the native value setter. */
  const type = (ref, value, submit) => {
    let element = elementOf(ref);
    if (!element) return MISSING;
    // The label of a field stands for its field.
    if (element instanceof HTMLLabelElement && element.control) element = element.control;
    const wanted = String(value);
    element.focus();
    if (element instanceof HTMLSelectElement) {
      const search = text(wanted).toLowerCase();
      const options = [...element.options];
      const option =
        options.find(
          (candidate) =>
            text(candidate.text).toLowerCase() === search ||
            candidate.value.toLowerCase() === search,
        ) ?? options.find((candidate) => text(candidate.text).toLowerCase().includes(search));
      if (!option) {
        return {
          error: `This list has no option “${wanted}”.`,
          options: options.map((candidate) => text(candidate.text)),
        };
      }
      element.value = option.value;
      fire(element, 'input');
      fire(element, 'change');
      return { picked: text(option.text) };
    }
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      const prototype =
        element instanceof HTMLInputElement
          ? HTMLInputElement.prototype
          : HTMLTextAreaElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, wanted);
      fire(element, 'input', { inputType: 'insertText', data: wanted });
      fire(element, 'change');
    } else if (element.isContentEditable) {
      element.textContent = wanted;
      fire(element, 'input', { inputType: 'insertText', data: wanted });
    } else {
      return { error: 'This element takes no text. Click it, or look for a field.' };
    }
    return { typed: true, submitted: submit ? submitFrom(element) : false };
  };

  const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  /** A key as a script can press it, where the engine gives no keyboard of its own. */
  const key = (name) => {
    const element = document.activeElement || document.body;
    const keyName = name === 'Space' ? ' ' : name;
    const init = { key: keyName, bubbles: true, cancelable: true, composed: true };
    const allowed = element.dispatchEvent(new KeyboardEvent('keydown', init));
    if (allowed) {
      if (name === 'Enter' && element instanceof HTMLInputElement) submitFrom(element);
      else if (name === 'Enter' || name === 'Space') {
        if (element instanceof HTMLElement && element.matches('button, a[href], [role="button"]'))
          element.click();
      } else if (name === 'Tab') {
        const all = [...document.querySelectorAll(FOCUSABLE)];
        all[(all.indexOf(element) + 1) % Math.max(1, all.length)]?.focus();
      }
    }
    element.dispatchEvent(new KeyboardEvent('keyup', init));
    return { pressed: name };
  };

  const scroll = (ref, to, by) => {
    if (ref) {
      const element = elementOf(ref);
      if (!element) return MISSING;
      element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    } else if (to === 'top') scrollTo({ top: 0, behavior: 'instant' });
    else if (to === 'bottom') scrollTo({ top: pageSize().height, behavior: 'instant' });
    else scrollBy({ top: Number(by) || 0, behavior: 'instant' });
    return where();
  };

  window.__interactiveLearningAgent = { look, target, type, key, scroll, where };
})();
