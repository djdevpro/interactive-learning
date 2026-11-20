<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { save } from '@tauri-apps/plugin-dialog';
import type { InteractiveLearningElement } from '@interactive-learning/player';
import {
  sanitizeSourceUrl,
  type GuideDocument,
  type GuideStep,
  type Point,
} from '@interactive-learning/protocol';
import { markerNumber } from '@interactive-learning/editor/draft';
import Icon from './Icon.vue';
import Inspector from './Inspector.vue';
import Logo from './Logo.vue';
import MediaPanel from './MediaPanel.vue';
import StepCanvas from './StepCanvas.vue';
import Timeline from './Timeline.vue';
import { presence } from '../agent/bridge';
import type { EditorAgent } from '../agent/types';
import { createDiskGuard } from '../disk';
import { createHistory } from '../history';
import { isMessageKey, t, type MessageKey } from '../i18n';
import { buttonMenu, contextMenu, type MenuEntry } from '../menus';
import { canRecord, noRecording, revealLabel } from '../platform';
import { createRecorder } from '../recorder';
import {
  baselineOf,
  visiblePart,
  withAsset,
  type Baseline,
  type Capture,
  type Observation,
} from '../recording';
import {
  addMarker,
  duplicateStep,
  moveMarker,
  moveStep,
  removeMarker,
  removeStep,
  scrollTo,
  setDuration,
  stepIndexAt,
  stepStarts,
  updateStep,
} from '../editing';
import {
  library,
  partsOf,
  timecode,
  tutorialUrl,
  type SiteEntry,
  type ThemeEntry,
} from '../library';
import { notify, warn } from '../ui';

/** What the viewer shows: the step to edit, the player, or the browser that records. */
export type Stage = 'canvas' | 'player' | 'recorder';

const props = defineProps<{ path: string; startIn: 'record' | 'edit' }>();
const emit = defineEmits<{ close: []; ready: []; settings: [] }>();

const disk = createDiskGuard(
  () => library.readTutorial(props.path),
  (next) => library.writeTutorial(props.path, next),
);
const history = createHistory(async (next) => {
  const elsewhere = await disk.write(next);
  if (elsewhere) adopt(elsewhere);
});
const guide = history.guide;
const site = shallowRef<SiteEntry | null>(null);
const theme = shallowRef<ThemeEntry | null>(null);
const publishedAt = ref<string | null>(null);
const stage = ref<Stage>(props.startIn === 'record' ? 'recorder' : 'canvas');
/** The site or the step: what the viewer comes back to when the player stops. */
const lastView = ref<'canvas' | 'recorder'>(stage.value === 'recorder' ? 'recorder' : 'canvas');
/** The view the switch shows as current, the one under the player while it plays. */
const view = computed(() => (stage.value === 'player' ? lastView.value : stage.value));
const selectedId = ref<string | null>(null);
const selectedMarker = ref<string | null>(null);
const playhead = ref(0);
const playing = ref(false);
const address = ref('');
const page = ref<{ url: string; loading: boolean } | null>(null);
const still = ref('');
const steppedAway = ref(false);
const busy = ref(false);
const siteSlot = ref<HTMLElement | null>(null);
const stillImage = ref<HTMLImageElement | null>(null);
const player = ref<InteractiveLearningElement | null>(null);
const canvas = ref<InstanceType<typeof StepCanvas> | null>(null);
const unlisten: UnlistenFn[] = [];
let resizeObserver: ResizeObserver | undefined;
let frame = 0;

const steps = computed(() => guide.value?.steps ?? []);
const selectedIndex = computed(() => steps.value.findIndex((step) => step.id === selectedId.value));
const selectedStep = computed(() => steps.value[selectedIndex.value]);
const hasPage = computed(() => Boolean(page.value && /^https?:\/\//.test(page.value.url)));
const label = computed(() => theme.value?.color ?? 'blue');

function assetOf(step: GuideStep | undefined) {
  return guide.value?.assets.find((asset) => asset.id === step?.assetId);
}

function imageOf(step: GuideStep | undefined): string {
  const src = assetOf(step)?.src ?? '';
  return src.startsWith('data:') ? src : tutorialUrl(props.path, src);
}

function change(next: GuideDocument, label: MessageKey): void {
  history.change(next, label);
}

function changeStep(stepId: string, edit: (step: GuideStep) => GuideStep, label: MessageKey): void {
  if (guide.value) change(updateStep(guide.value, stepId, edit), label);
}

// Opening and leaving.

onMounted(async () => {
  try {
    history.open(await disk.read());
  } catch (cause) {
    warn(cause, t('editor.openFailed'));
    emit('close');
    return;
  }
  await readPlace();
  selectedId.value = steps.value[0]?.id ?? null;
  unlisten.push(
    await listen<{ url: string; loading: boolean }>('site-page', ({ payload }) => {
      if (!/^https?:\/\//.test(payload.url)) return;
      page.value = payload;
      if (document.activeElement?.id !== 'address') address.value = payload.url;
    }),
    await listen<Observation>('site-observation', ({ payload }) => recorder.observe(payload)),
  );
  if (!steps.value.length) show('recorder');
  // The browser opens on the page of the last step, or the site, ready to record or retake.
  const startPage = steps.value.at(-1)?.source?.url || site.value?.address;
  if (startPage && !hasPage.value) await go(startPage);
  resizeObserver = new ResizeObserver(() => void placeSite());
  window.addEventListener('keydown', onKey);
  window.addEventListener('resize', placeSite);
  await nextTick();
  if (siteSlot.value) resizeObserver.observe(siteSlot.value);
  void placeSite();
  emit('ready');
});

/** The site and theme of the tutorial, and when it was published, as the library holds them. */
async function readPlace(): Promise<void> {
  const parts = partsOf(props.path);
  const sites = await library.scan().catch(() => []);
  site.value = sites.find((entry) => entry.id === parts.site) ?? null;
  theme.value = site.value?.themes.find((entry) => entry.id === parts.theme) ?? null;
  publishedAt.value =
    theme.value?.tutorials.find((entry) => entry.path === props.path)?.publishedAt ?? null;
}

onBeforeUnmount(() => {
  for (const stop of unlisten) stop();
  resizeObserver?.disconnect();
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('resize', placeSite);
  cancelAnimationFrame(frame);
  void invoke('site_bounds', { x: 0, y: 0, width: 1, height: 1, visible: false }).catch(() => {});
});

/**
 * Takes the version of the tutorial that was written outside the studio, by an agent or a script,
 * in place of the copy kept here: saving the copy would have lost it.
 */
function adopt(next: GuideDocument): void {
  history.open(next);
  if (!steps.value.some((step) => step.id === selectedId.value)) select(steps.value[0]?.id ?? null);
  notify(t('editor.reloaded'));
}

/** Reads the tutorial again when it was rewritten outside the studio since it was opened. */
async function reload(): Promise<void> {
  await history.flush();
  const elsewhere = await disk.changed();
  if (elsewhere) adopt(elsewhere);
}

/**
 * Removes the screenshots no step uses any more, once the guide that uses the others is saved.
 * The images of the guide in memory are kept too, whatever the disk holds, and so are those of a
 * version written on the disk meanwhile.
 */
async function prune(): Promise<void> {
  await history.flush();
  const onDisk = await library.readTutorial(props.path).catch(() => null);
  const keep = [...(guide.value?.assets ?? []), ...(onDisk?.assets ?? [])].map(
    (asset) => asset.src,
  );
  await library.prune(props.path, keep).catch(() => 0);
}

async function close(): Promise<void> {
  if (recorder.active.value) await recorder.stop();
  await history.flush();
  await prune();
  emit('close');
}

// The site view, a webview that always draws above the interface, sits on its slot.

async function placeSite(): Promise<void> {
  const box = siteSlot.value?.getBoundingClientRect();
  const visible = stage.value === 'recorder' && hasPage.value && !steppedAway.value && Boolean(box);
  await invoke('site_bounds', {
    x: box?.left ?? 0,
    y: box?.top ?? 0,
    width: box?.width ?? 1,
    height: box?.height ?? 1,
    visible,
  }).catch(() => {});
}

watch([stage, hasPage], async () => {
  await nextTick();
  if (siteSlot.value) resizeObserver?.observe(siteSlot.value);
  void placeSite();
});

/** Opens an address in the browser, or says why it cannot. */
async function navigate(target: string): Promise<string> {
  const url = await invoke<string>('site_navigate', { url: target });
  address.value = url;
  page.value = { url, loading: true };
  (document.getElementById('address') as HTMLInputElement | null)?.blur();
  return url;
}

async function go(target = address.value): Promise<void> {
  if (!target.trim()) return;
  try {
    await navigate(target);
  } catch (cause) {
    warn(cause, t('editor.addressFailed'));
  }
}

function browse(action: 'back' | 'forward' | 'reload'): void {
  void invoke('site_history', { action }).catch((cause) => warn(cause, t('editor.pageSilent')));
}

// Captures. The engine draws a full page from its top, which would flash in the window: a still
// picture of the window covers the site view meanwhile. One capture runs at a time.

const nextPaint = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
let captureQueue: Promise<unknown> = Promise.resolve();

function captureSite(): Promise<Capture> {
  const run = async (): Promise<Capture> => {
    const shown = stage.value === 'recorder' && hasPage.value;
    if (shown) {
      still.value = (
        await invoke<Capture>('site_capture', { fullPage: false, tutorial: null })
      ).src;
      await nextTick();
      await stillImage.value?.decode().catch(() => undefined);
      await nextPaint();
      steppedAway.value = true;
      await placeSite();
    }
    try {
      return await invoke<Capture>('site_capture', { fullPage: true, tutorial: props.path });
    } finally {
      if (shown) {
        steppedAway.value = false;
        await placeSite();
        await nextPaint();
        still.value = '';
      }
    }
  };
  const result = captureQueue.then(run, run);
  captureQueue = result.catch(() => undefined);
  return result;
}

async function captureBaseline(): Promise<Baseline> {
  const shot = await captureSite();
  return baselineOf(shot, shot.image ?? { width: shot.page.width, height: shot.page.height });
}

const recorder = createRecorder({
  capture: captureBaseline,
  read: () => guide.value!,
  write: async (next) => {
    change(next, 'history.recordStep');
    const last = next.steps.at(-1);
    if (last) select(last.id);
  },
  announce: (number, title) => notify(t('editor.stepAnnounce', { number, title })),
  fail: (cause) => warn(cause, t('editor.recordFailed')),
});
const recording = recorder.active;

async function toggleRecording(): Promise<void> {
  if (recording.value) {
    await recorder.stop();
    await prune();
    notify(t('editor.recordingStopped'));
  } else {
    if (!hasPage.value) await go(address.value || site.value?.address || '');
    await recorder.start();
    notify(t('editor.recordingStarted'));
  }
}

/** Starts recording in the browser, from any view, or stops it. */
async function recordNow(): Promise<void> {
  if (!canRecord) return;
  if (!recording.value) show('recorder');
  await toggleRecording();
}

async function captureNow(): Promise<void> {
  if (!hasPage.value || busy.value) return;
  busy.value = true;
  try {
    await recorder.captureNow();
  } catch (cause) {
    warn(cause, t('editor.captureFailed'));
  } finally {
    busy.value = false;
  }
}

/** Takes the screenshot of the selected step again, from the page open in the Site view. */
async function retake(): Promise<void> {
  const step = selectedStep.value;
  if (!step || !guide.value) return;
  if (!hasPage.value) {
    show('recorder');
    notify(t('editor.openPageToRetake'));
    return;
  }
  busy.value = true;
  try {
    const shot = await captureSite();
    const base = baselineOf(shot, shot.image ?? shot.page);
    const { guide: withImage, assetId } = withAsset(guide.value, base.asset);
    const url = sanitizeSourceUrl(shot.url);
    change(
      updateStep(withImage, step.id, (current) => ({
        ...current,
        assetId,
        viewport: visiblePart(shot.page, shot.view, shot.view),
        source: {
          ...current.source,
          capturedAt: new Date().toISOString(),
          ...(url ? { url } : {}),
        },
      })),
      'history.retake',
    );
    notify(t('editor.screenshotReplaced'));
  } catch (cause) {
    warn(cause, t('editor.captureFailed'));
  } finally {
    busy.value = false;
  }
}

// Selection, timeline and playback.

function select(stepId: string | null): void {
  selectedId.value = stepId;
  selectedMarker.value = null;
  if (!guide.value || stepId === null) return;
  const index = steps.value.findIndex((step) => step.id === stepId);
  const start = stepStarts(guide.value).starts[index] ?? 0;
  if (stage.value === 'player') player.value?.seek(start);
  else playhead.value = start;
}

function selectBy(offset: number): void {
  const next =
    steps.value[Math.min(steps.value.length - 1, Math.max(0, selectedIndex.value + offset))];
  if (next) select(next.id);
}

function seek(ms: number): void {
  if (!guide.value) return;
  playhead.value = ms;
  if (stage.value === 'player') {
    player.value?.seek(ms);
    return;
  }
  const step = steps.value[stepIndexAt(guide.value, ms)];
  if (step && step.id !== selectedId.value) {
    selectedId.value = step.id;
    selectedMarker.value = null;
  }
}

/** Plays from the playhead in the viewer; a pause returns to the step under the playhead. */
function play(): void {
  hold = null;
  if (!steps.value.length) return;
  if (stage.value !== 'player') {
    if (playhead.value >= stepStarts(guide.value!).total - 50) playhead.value = 0;
    lastView.value = stage.value === 'recorder' ? 'recorder' : 'canvas';
    stage.value = 'player';
    return;
  }
  player.value?.play();
}

/** Stops the player and comes back to the site or the step that was shown before it. */
function pause(): void {
  player.value?.pause();
  stage.value = lastView.value;
}

/** While the player plays, the timeline and the selection follow it. */
function follow(): void {
  const element = player.value;
  if (element && stage.value === 'player') {
    playhead.value = element.currentTime;
    playing.value = !element.paused;
    if (guide.value) {
      const step = steps.value[stepIndexAt(guide.value, element.currentTime)];
      if (step) selectedId.value = step.id;
    }
  }
  frame = requestAnimationFrame(follow);
}

/** A moment to show paused, set by the self-test to look at one frame of the tutorial. */
let hold: number | null = null;

watch(player, (element) => {
  if (!element || !guide.value) return;
  element.assetBaseUrl = tutorialUrl(props.path, '');
  element.guide = guide.value;
  const start = playhead.value;
  element.addEventListener(
    'guide-load',
    () => {
      if (hold !== null) {
        element.pause();
        element.seek(hold);
        return;
      }
      element.seek(start >= stepStarts(guide.value!).total ? 0 : start);
      element.play();
    },
    { once: true },
  );
});

/** Shows the tutorial paused at a moment, in the player. */
async function previewAt(ms: number): Promise<void> {
  hold = ms;
  if (stage.value === 'player' && player.value) {
    player.value.pause();
    player.value.seek(ms);
    return;
  }
  stage.value = 'player';
  await nextTick();
}

watch(stage, async (next, previous) => {
  if (previous === 'player') {
    cancelAnimationFrame(frame);
    playing.value = false;
  }
  if (next === 'player') frame = requestAnimationFrame(follow);
  if (next !== 'recorder' && recording.value) {
    await recorder.stop();
    await prune();
    notify(t('editor.recordingStopped'));
  }
});

/** At the end of the tutorial, the viewer comes back to what it showed before playing. */
watch(playing, (now, before) => {
  if (before && !now && stage.value === 'player' && player.value?.paused) {
    stage.value = lastView.value;
  }
});

/** Shows the site or the step in the viewer. */
function show(next: 'canvas' | 'recorder'): void {
  if (stage.value === 'player') player.value?.pause();
  lastView.value = next;
  stage.value = next;
  if (next === 'recorder' && !hasPage.value && site.value?.address) void go(site.value.address);
}

function openRecorder(): void {
  show('recorder');
}

/** An address typed above the viewer opens in the browser, which comes into view. */
function openAddress(): void {
  show('recorder');
  void go();
}

// Changes from the timeline, the canvas and the inspector.

function onMove(from: number, to: number): void {
  if (guide.value) change(moveStep(guide.value, from, to), 'history.moveStep');
}

function onDuration(stepId: string, ms: number): void {
  if (guide.value) change(setDuration(guide.value, stepId, ms), 'history.duration');
}

function onTransition(stepId: string): void {
  changeStep(
    stepId,
    (step) => ({ ...step, transition: step.transition === 'cut' ? 'fade' : 'cut' }),
    'history.transition',
  );
}

function onAddMarker(point: { x: number; y: number }): void {
  const step = selectedStep.value;
  if (!step) return;
  const added = addMarker(step, point);
  changeStep(step.id, () => added.step, 'history.addMarker');
  selectedMarker.value = added.id;
}

function onMoveMarker(id: string, point: { x: number; y: number }): void {
  const step = selectedStep.value;
  if (step) changeStep(step.id, (current) => moveMarker(current, id, point), 'history.moveMarker');
}

function onRemoveMarker(id: string): void {
  const step = selectedStep.value;
  if (!step) return;
  changeStep(step.id, (current) => removeMarker(current, id), 'history.deleteMarker');
  if (selectedMarker.value === id) selectedMarker.value = null;
}

function onRemoveStep(): void {
  const step = selectedStep.value;
  if (!step || !guide.value) return;
  const index = selectedIndex.value;
  change(removeStep(guide.value, step.id), 'history.deleteStep');
  select(steps.value[Math.min(index, steps.value.length - 1)]?.id ?? null);
  notify(t('editor.stepDeleted'), { label: t('common.undo'), run: undo });
}

function onDuplicateStep(): void {
  const step = selectedStep.value;
  if (!step || !guide.value) return;
  change(duplicateStep(guide.value, step.id), 'history.duplicateStep');
  selectBy(1);
}

function undo(): void {
  const label = history.undo();
  if (label) notify(t('editor.undone', { action: actionName(label) }));
  if (!steps.value.some((step) => step.id === selectedId.value)) select(steps.value[0]?.id ?? null);
}

function redo(): void {
  const label = history.redo();
  if (label) notify(t('editor.redone', { action: actionName(label) }));
}

// Publishing and export.

/** Publishes into the project folder of the site and gives that folder back. */
async function publishNow(): Promise<string> {
  if (!site.value?.publishTo) {
    throw new Error(t('editor.noPublishFolder'));
  }
  busy.value = true;
  try {
    await history.flush();
    const destination = await library.publish(props.path);
    publishedAt.value = new Date().toISOString();
    notify(t('editor.published'), {
      label: t('common.show'),
      run: () => void library.reveal(destination, true),
    });
    return destination;
  } finally {
    busy.value = false;
  }
}

async function publish(): Promise<void> {
  if (!site.value?.publishTo) return;
  try {
    await publishNow();
  } catch (cause) {
    warn(cause, t('editor.publishFailed'));
  }
}

async function exportZip(): Promise<void> {
  const name = partsOf(props.path).tutorial || 'tutorial';
  const target = await save({
    defaultPath: `${name}.zip`,
    filters: [{ name: t('editor.archiveFilter'), extensions: ['zip'] }],
  }).catch(() => null);
  if (target) await exportTo(target);
}

/** `guide.json` and its screenshots in one archive, the one the extension and the CLI open. */
async function exportNow(target: string): Promise<void> {
  await history.flush();
  await library.exportZip(props.path, target);
  notify(t('editor.zipSaved'), {
    label: t('common.show'),
    run: () => void library.reveal(target, true),
  });
}

async function exportTo(target: string): Promise<void> {
  try {
    await exportNow(target);
  } catch (cause) {
    warn(cause, t('editor.exportFailed'));
  }
}

/** The name of an action of the undo history, in the language of the studio. */
function actionName(label: string): string {
  return isMessageKey(label) ? t(label) : label;
}

// Menus: the More button, and the right click on a step, a marker or the screenshot.

function moreEntries(): MenuEntry[] {
  return [
    {
      label: t('editor.exportZip'),
      icon: 'archive',
      disabled: !steps.value.length,
      run: () => void exportZip(),
    },
    { label: revealLabel(), icon: 'folder', run: () => void library.reveal(props.path) },
    { separator: true },
    { label: t('common.settings'), icon: 'settings', run: () => emit('settings') },
  ];
}

function stepEntries(stepId: string): MenuEntry[] {
  const index = steps.value.findIndex((step) => step.id === stepId);
  const step = steps.value[index];
  if (!step || !guide.value) return [];
  const start = stepStarts(guide.value).starts[index] ?? 0;
  return [
    { label: t('menu.showStep'), icon: 'edit', run: () => pickStep(stepId) },
    {
      label: t('menu.playFromHere'),
      icon: 'play',
      run: () => {
        select(stepId);
        playFrom(start);
      },
    },
    { separator: true },
    {
      label: t('library.duplicate'),
      icon: 'copy',
      keys: 'Ctrl+D',
      run: () => {
        select(stepId);
        onDuplicateStep();
      },
    },
    {
      label: t('menu.moveUp'),
      icon: 'up',
      keys: 'Alt+↑',
      disabled: index === 0,
      run: () => onMove(index, index - 1),
    },
    {
      label: t('menu.moveDown'),
      icon: 'down',
      keys: 'Alt+↓',
      disabled: index === steps.value.length - 1,
      run: () => onMove(index, index + 1),
    },
    ...(index > 0
      ? [
          {
            label: step.transition === 'cut' ? t('menu.fadeIn') : t('menu.cutIn'),
            icon: step.transition === 'cut' ? ('fade' as const) : ('cut' as const),
            run: () => onTransition(stepId),
          },
        ]
      : []),
    { separator: true },
    {
      label: t('inspector.deleteStep'),
      icon: 'trash',
      danger: true,
      keys: t('keys.delete'),
      run: () => {
        select(stepId);
        onRemoveStep();
      },
    },
  ];
}

function markerEntries(stepId: string, markerId: string): MenuEntry[] {
  return [
    { label: t('menu.nameMarker'), icon: 'text', run: () => pickMarker(stepId, markerId) },
    { separator: true },
    {
      label: t('menu.deleteMarker'),
      icon: 'trash',
      danger: true,
      keys: t('keys.delete'),
      run: () => {
        select(stepId);
        onRemoveMarker(markerId);
      },
    },
  ];
}

/** The screenshot of the selected step, at the point under the pointer. */
function screenEntries(point: Point): MenuEntry[] {
  const step = selectedStep.value;
  if (!step) return [];
  const partial = Boolean(step.viewport && step.viewport.height < 0.999);
  return [
    { label: t('menu.addMarkerHere'), icon: 'marker', run: () => onAddMarker(point) },
    {
      label: t('inspector.retake'),
      icon: 'retake',
      disabled: !(canRecord && hasPage.value),
      run: () => void retake(),
    },
    ...(partial
      ? [{ label: t('inspector.wholePage'), icon: 'fit' as const, run: onWholePage }]
      : []),
    { label: t('canvas.fit'), icon: 'frame', run: () => canvas.value?.fit() },
    { separator: true },
    { label: t('library.duplicate'), icon: 'copy', keys: 'Ctrl+D', run: onDuplicateStep },
    { label: t('inspector.deleteStep'), icon: 'trash', danger: true, run: onRemoveStep },
  ];
}

function onStepMenu(event: MouseEvent, stepId: string): void {
  const number = steps.value.findIndex((step) => step.id === stepId) + 1;
  contextMenu(event, stepEntries(stepId), t('menu.ofStep', { number }));
}

function onMarkerMenu(event: MouseEvent, stepId: string, markerId: string): void {
  const index = steps.value.findIndex((step) => step.id === stepId);
  const position = steps.value[index]?.annotations.findIndex((marker) => marker.id === markerId);
  const first = guide.value ? markerNumber(guide.value.steps, Math.max(0, index)) : 1;
  const number = first + Math.max(0, position ?? 0);
  contextMenu(event, markerEntries(stepId, markerId), t('menu.ofMarker', { number }));
}

function onScreenMenu(event: MouseEvent, point: Point): void {
  contextMenu(event, screenEntries(point), t('menu.ofScreen'));
}

// Keyboard. Text fields keep their own keys; the rest drives the editor.

function onKey(event: KeyboardEvent): void {
  const typing = (event.target as HTMLElement | null)?.closest(
    'input, textarea, select, [contenteditable]',
  );
  const control = (event.target as HTMLElement | null)?.closest(
    'button, a[href], [role="slider"], .pin',
  );
  const mod = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  if (mod && !typing && key === 'z') {
    event.preventDefault();
    if (event.shiftKey) redo();
    else undo();
  } else if (mod && !typing && key === 'y') {
    event.preventDefault();
    redo();
  } else if (mod && key === 'r') {
    event.preventDefault();
    void recordNow();
  } else if (mod && key === 'd' && !typing) {
    event.preventDefault();
    onDuplicateStep();
  } else if (typing) {
    if (event.key === 'Escape') (typing as HTMLElement).blur();
  } else if (control && (event.key === ' ' || event.key.startsWith('Arrow'))) {
    // A focused button, slider or marker keeps its own keys.
  } else if (event.key === ' ') {
    event.preventDefault();
    if (playing.value) pause();
    else play();
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault();
    selectBy(-1);
  } else if (event.key === 'ArrowRight') {
    event.preventDefault();
    selectBy(1);
  } else if (
    (event.key === 'Delete' || event.key === 'Backspace') &&
    stage.value === 'canvas' &&
    !control
  ) {
    event.preventDefault();
    if (selectedMarker.value) onRemoveMarker(selectedMarker.value);
    else onRemoveStep();
  } else if (event.key === 'Escape') {
    if (selectedMarker.value) selectedMarker.value = null;
    else if (stage.value === 'player') pause();
    else if (stage.value === 'recorder' && steps.value.length) show('canvas');
  }
}

/** Plays from a moment, in the player of the viewer. */
function playFrom(ms: number): void {
  if (stage.value === 'player' && player.value) {
    player.value.seek(ms);
    player.value.play();
    return;
  }
  playhead.value = ms;
  play();
}

/** What an AI agent does in this editor goes through the same changes as the creator's. */
const agent: EditorAgent = {
  path: props.path,
  guide: () => guide.value,
  site: () => site.value,
  theme: () => theme.value,
  change,
  select,
  show,
  stage: () => stage.value,
  navigate,
  page: () => page.value,
  recording: () => recording.value,
  async record(on) {
    if (on !== recording.value) await recordNow();
  },
  renew: () => recorder.renew(),
  idle: () => recorder.idle(),
  capture: () => captureSite(),
  undo() {
    const label = history.undo();
    if (!steps.value.some((step) => step.id === selectedId.value))
      select(steps.value[0]?.id ?? null);
    return label;
  },
  flush: () => history.flush(),
  publish: publishNow,
  exportTo: exportNow,
  play: playFrom,
  refresh: readPlace,
};

defineExpose({
  reload,
  stage,
  toggleRecording,
  go,
  select,
  play,
  pause,
  previewAt,
  publish,
  exportTo,
  guide,
  close,
  captureNow,
  openRecorder,
  agent,
});
const total = computed(() => (guide.value ? stepStarts(guide.value).total : 0));

/** A step picked in the list or on the timeline comes into view, unless a recording runs. */
function pickStep(stepId: string): void {
  if (!recording.value) show('canvas');
  select(stepId);
}

function pickMarker(stepId: string, markerId: string): void {
  if (!recording.value) show('canvas');
  select(stepId);
  selectedMarker.value = markerId;
}

function onInspectorStep(edit: (step: GuideStep) => GuideStep, label: MessageKey): void {
  const step = selectedStep.value;
  if (step) changeStep(step.id, edit, label);
}

function onInspectorGuide(edit: (guide: GuideDocument) => GuideDocument, label: MessageKey): void {
  if (guide.value) change(edit(guide.value), label);
}

function onWholePage(): void {
  const step = selectedStep.value;
  if (step) changeStep(step.id, (current) => scrollTo(current, null), 'history.wholePage');
}
</script>

<template>
  <div class="editor" :data-label="label">
    <header class="editor-bar">
      <button type="button" class="button quiet" :title="t('editor.backToLibrary')" @click="close">
        <Logo :size="20" />{{ t('common.library') }}
      </button>
      <button
        type="button"
        class="button record-toggle"
        :class="{ live: recording }"
        :aria-pressed="recording"
        :disabled="!canRecord"
        :title="
          !canRecord
            ? noRecording()
            : recording
              ? t('editor.stopRecording')
              : t('editor.recordSite')
        "
        @click="recordNow"
      >
        <span class="record-dot" aria-hidden="true"></span>
        {{ recording ? t('editor.recordingCount', { count: steps.length }) : t('editor.record') }}
      </button>
      <span class="bar-rule" aria-hidden="true"></span>
      <nav class="crumbs" :aria-label="t('editor.place')">
        <span class="crumb">{{ site?.name ?? '…' }}</span>
        <Icon name="right" :size="13" />
        <span class="crumb"
          ><span class="label-dot" aria-hidden="true"></span>{{ theme?.name ?? '…' }}</span
        >
        <Icon name="right" :size="13" />
        <label class="visually-hidden" for="tutorial-name">{{ t('editor.tutorialTitle') }}</label>
        <input
          v-if="guide"
          id="tutorial-name"
          class="crumb-title"
          :value="guide.title"
          :size="Math.max(14, guide.title.length + 1)"
          @input="
            change(
              { ...guide, title: ($event.target as HTMLInputElement).value },
              'history.renameTutorial',
            )
          "
        />
      </nav>
      <span class="bar-spacer"></span>
      <span
        v-if="presence"
        class="agent-badge"
        role="status"
        :title="t('common.agentDriving', { agent: presence.agent })"
      >
        <Icon name="spark" :size="13" />{{ presence.agent }}
      </span>
      <span class="save-state" :data-state="history.saving.value" role="status">
        <Icon v-if="history.saving.value === 'saved'" name="check" :size="14" />
        {{
          history.saving.value === 'saved'
            ? t('editor.saved')
            : history.saving.value === 'pending'
              ? t('editor.saving')
              : t('editor.notSaved')
        }}
      </span>
      <button
        type="button"
        class="button icon quiet"
        :disabled="!history.canUndo.value"
        :title="
          history.canUndo.value
            ? t('editor.undoAction', { action: actionName(history.undoLabel.value) })
            : t('editor.nothingToUndo')
        "
        @click="undo"
      >
        <Icon name="undo" />
      </button>
      <button
        type="button"
        class="button icon quiet"
        :disabled="!history.canRedo.value"
        :title="
          history.canRedo.value
            ? t('editor.redoAction', { action: actionName(history.redoLabel.value) })
            : t('editor.nothingToRedo')
        "
        @click="redo"
      >
        <Icon name="redo" />
      </button>
      <button
        v-if="site?.publishTo"
        type="button"
        class="button primary"
        :disabled="busy || !steps.length"
        :title="t('editor.publishTo', { folder: site.publishTo })"
        @click="publish"
      >
        <Icon name="publish" :size="16" />{{ t('editor.publish') }}
      </button>
      <button
        v-else
        type="button"
        class="button primary"
        :disabled="!steps.length"
        @click="exportZip"
      >
        <Icon name="archive" :size="16" />{{ t('editor.export') }}
      </button>
      <button
        type="button"
        class="button icon quiet"
        :title="t('editor.more')"
        aria-haspopup="menu"
        @click="buttonMenu($event, moreEntries(), t('editor.more'))"
      >
        <Icon name="more" />
      </button>
    </header>

    <div class="editor-body">
      <MediaPanel
        v-if="guide"
        :guide="guide"
        :selected-id="selectedId"
        :image-of="imageOf"
        @select="pickStep"
        @move="onMove"
        @menu="onStepMenu"
      />

      <section class="viewer" :aria-label="t('editor.viewer')">
        <div class="viewer-bar">
          <div class="segmented view-switch" role="group" :aria-label="t('editor.view')">
            <button
              type="button"
              :aria-pressed="view === 'recorder'"
              :title="t('editor.siteViewTitle')"
              @click="show('recorder')"
            >
              <Icon name="globe" :size="14" />{{ t('editor.siteView') }}
            </button>
            <button
              type="button"
              :aria-pressed="view === 'canvas'"
              :disabled="!steps.length"
              :title="t('editor.stepViewTitle')"
              @click="show('canvas')"
            >
              <Icon name="edit" :size="14" />{{ t('editor.stepView') }}
            </button>
          </div>
          <div class="browser-nav">
            <button
              type="button"
              class="button icon small quiet"
              :title="t('editor.back')"
              :disabled="!hasPage"
              @click="browse('back')"
            >
              <Icon name="left" :size="16" />
            </button>
            <button
              type="button"
              class="button icon small quiet"
              :title="t('editor.forward')"
              :disabled="!hasPage"
              @click="browse('forward')"
            >
              <Icon name="right" :size="16" />
            </button>
            <button
              type="button"
              class="button icon small quiet"
              :title="t('editor.reload')"
              :disabled="!hasPage"
              @click="browse('reload')"
            >
              <Icon name="reload" :size="15" />
            </button>
          </div>
          <form class="address" @submit.prevent="openAddress">
            <Icon name="globe" :size="14" />
            <label class="visually-hidden" for="address">{{ t('editor.address') }}</label>
            <input
              id="address"
              v-model="address"
              :placeholder="t('editor.addressPlaceholder')"
              spellcheck="false"
            />
            <span v-if="page?.loading" class="loading" :aria-label="t('editor.loading')"></span>
          </form>
          <button
            type="button"
            class="button small"
            :disabled="!canRecord || !hasPage || busy"
            :title="canRecord ? t('editor.captureTitle') : noRecording()"
            @click="captureNow"
          >
            <Icon name="camera" :size="15" />{{ t('editor.capture') }}
          </button>
        </div>

        <div class="viewer-stage">
          <div v-if="stage === 'recorder'" class="browser-frame" :class="{ recording }">
            <div ref="siteSlot" class="site-slot"></div>
            <img v-if="still" ref="stillImage" class="site-still" :src="still" alt="" />
            <div v-if="!hasPage" class="browser-empty">
              <Icon name="globe" :size="30" />
              <h2>{{ t('editor.emptyBrowserTitle') }}</h2>
              <p>{{ t('editor.emptyBrowserBody') }}</p>
              <button
                v-if="site?.address"
                type="button"
                class="button primary"
                @click="go(site.address)"
              >
                {{ t('editor.openAddress', { address: site.address }) }}
              </button>
            </div>
          </div>

          <div v-else-if="stage === 'player'" class="player-stage">
            <interactive-learning
              ref="player"
              class="stage-player"
              show-address
              hide-controls
            ></interactive-learning>
          </div>

          <template v-else>
            <StepCanvas
              v-if="selectedStep && guide"
              ref="canvas"
              :step="selectedStep"
              :asset="assetOf(selectedStep)"
              :image="imageOf(selectedStep)"
              :first-number="markerNumber(guide.steps, selectedIndex)"
              :selected-marker="selectedMarker"
              @add="onAddMarker"
              @move="onMoveMarker"
              @select="selectedMarker = $event"
              @remove="onRemoveMarker"
              @menu="onScreenMenu"
              @marker-menu="(event, id) => onMarkerMenu(event, selectedStep!.id, id)"
              @scroll="
                (top) =>
                  changeStep(selectedStep!.id, (step) => scrollTo(step, top), 'history.visiblePart')
              "
            />
            <div v-else class="viewer-empty">
              <Icon name="route" :size="30" />
              <h2>{{ t('editor.noStepTitle') }}</h2>
              <template v-if="canRecord">
                <p>{{ t('editor.noStepBody') }}</p>
                <button type="button" class="button record" @click="recordNow">
                  <Icon name="record" :size="14" />{{ t('editor.record') }}
                </button>
              </template>
              <p v-else>{{ t('editor.noRecordingHere', { reason: noRecording() }) }}</p>
            </div>
          </template>
        </div>

        <footer class="transport" :aria-label="t('editor.playback')">
          <button
            type="button"
            class="button icon small quiet"
            :title="t('editor.previousStep')"
            :disabled="selectedIndex <= 0"
            @click="selectBy(-1)"
          >
            <Icon name="left" :size="16" />
          </button>
          <button
            type="button"
            class="button icon play-button"
            :aria-label="playing ? t('editor.pause') : t('editor.play')"
            :title="playing ? t('editor.pauseTitle') : t('editor.playTitle')"
            :disabled="!steps.length"
            @click="playing ? pause() : play()"
          >
            <Icon :name="playing ? 'pause' : 'play'" :size="15" />
          </button>
          <button
            type="button"
            class="button icon small quiet"
            :title="t('editor.nextStep')"
            :disabled="selectedIndex >= steps.length - 1"
            @click="selectBy(1)"
          >
            <Icon name="right" :size="16" />
          </button>
          <p class="transport-time tabular">
            <b>{{ timecode(playhead) }}</b> / {{ timecode(total) }}
          </p>
          <span class="transport-spacer"></span>
          <p v-if="selectedStep && stage === 'canvas'" class="transport-step tabular">
            {{ t('editor.stepOf', { number: selectedIndex + 1, count: steps.length }) }}
          </p>
        </footer>
      </section>

      <Inspector
        v-if="guide"
        :guide="guide"
        :step="selectedStep"
        :index="selectedIndex"
        :first-number="markerNumber(guide.steps, Math.max(0, selectedIndex))"
        :selected-marker="selectedMarker"
        :can-retake="canRecord && hasPage"
        :publish-to="site?.publishTo ?? null"
        :published-at="publishedAt"
        @step="onInspectorStep"
        @guide="onInspectorGuide"
        @select-marker="selectedMarker = $event"
        @remove-marker="onRemoveMarker"
        @remove-step="onRemoveStep"
        @duplicate-step="onDuplicateStep"
        @retake="retake"
        @whole-page="onWholePage"
        @marker-menu="(event, id) => selectedStep && onMarkerMenu(event, selectedStep.id, id)"
      />
    </div>

    <Timeline
      v-if="guide"
      :guide="guide"
      :selected-id="selectedId"
      :playhead="playhead"
      :playing="playing"
      :image-of="imageOf"
      @select="pickStep"
      @select-marker="pickMarker"
      @seek="seek"
      @move="onMove"
      @duration="onDuration"
      @transition="onTransition"
      @duplicate="onDuplicateStep"
      @remove="onRemoveStep"
      @menu="onStepMenu"
      @marker-menu="onMarkerMenu"
    />
  </div>
</template>
