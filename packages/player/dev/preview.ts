// Development preview of <interactive-learning>, served by `pnpm dev`. Not part of the package.
import '../src/auto';
import type { GuideTheme } from '../src/theme';

const player = document.querySelector('interactive-learning')!;
const form = document.querySelector<HTMLFormElement>('#settings')!;
const events = document.querySelector<HTMLOListElement>('#events')!;

function field<T extends Element>(name: string): T {
  return form.elements.namedItem(name) as unknown as T;
}

function apply(): void {
  const data = new FormData(form);
  player.src = String(data.get('src'));
  player.theme = data.get('theme') as GuideTheme;
  player.lang = String(data.get('lang'));
  player.showInformation = data.has('information');
  player.style.setProperty('--il-accent', String(data.get('accent')));
  player.style.setProperty('--il-radius', `${data.get('radius')}px`);
  field<HTMLOutputElement>('radiusValue').value = `${data.get('radius')}px`;
  document.documentElement.dataset.page = String(data.get('page'));
}

function record(type: string, detail: Record<string, unknown>): void {
  const item = document.createElement('li');
  // Steps and guides are large objects; show their index or title only.
  const { step, guide, ...rest } = detail;
  const summary = step ? rest : guide ? { title: (guide as { title: string }).title } : rest;
  item.textContent = `${new Date().toLocaleTimeString()} ${type} ${JSON.stringify(summary)}`;
  events.prepend(item);
  while (events.children.length > 30) events.lastElementChild?.remove();
}

form.addEventListener('input', apply);
for (const type of ['step-change', 'theme-change', 'guide-load', 'guide-error'] as const) {
  player.addEventListener(type, (event) => record(type, event.detail));
}
// The bulb button changes the theme from inside the player; keep the form in sync.
player.addEventListener('theme-change', (event) => {
  field<HTMLSelectElement>('theme').value = event.detail.theme;
});
apply();
