import '@interactive-learning/player/auto';
import '@interactive-learning/editor/style.css';
import { browser } from 'wxt/browser';
import { GuideStore } from '../../lib/guide-store';
import { SESSION_KEY } from '../../lib/messages';
import './style.css';

// Plays the guide stored by the extension, as the site will show it after the export.
const guideId = new URLSearchParams(location.search).get('guide') ?? '';
const store = new GuideStore();
const player = document.querySelector('interactive-learning')!;
const title = document.querySelector('#guide-title')!;
const meta = document.querySelector('#guide-meta')!;
const status = document.querySelector('#preview-status')!;
let shownVersion = '';
let stepIndex = 0;

player.addEventListener('step-change', (event) => {
  stepIndex = event.detail.index;
});
// A reload after an edit keeps the step the viewer was looking at.
player.addEventListener('guide-load', (event) => {
  if (stepIndex > 0) player.seekToStep(Math.min(stepIndex, event.detail.guide.steps.length - 1));
});

async function show(): Promise<void> {
  const guide = guideId ? await store.read(guideId) : undefined;
  if (!guide) {
    player.hidden = true;
    status.textContent = 'This guide no longer exists in the extension. Close this window.';
    return;
  }
  const version = `${guide.updatedAt}:${guide.steps.length}`;
  if (version === shownVersion) return;
  shownVersion = version;
  document.title = `${guide.title} · Preview`;
  title.textContent = guide.title;
  meta.textContent = guide.steps.length === 1 ? '1 step' : `${guide.steps.length} steps`;
  player.guide = guide;
}

// Every capture or saved edit updates the session, then the stored guide.
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[SESSION_KEY]) void show();
});
void show();
