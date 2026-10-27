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
} from '@interactive-learning/protocol';
import { markerNumber } from '@interactive-learning/editor/draft';
import Icon from './Icon.vue';
import Inspector from './Inspector.vue';
import Logo from './Logo.vue';
import MediaPanel from './MediaPanel.vue';
import StepCanvas from './StepCanvas.vue';
import Timeline from './Timeline.vue';
import { createHistory } from '../history';
import { canRecord, NO_RECORDING, revealLabel } from '../platform';
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
const emit = defineEmits<{ close: [] }>();

const history = createHistory((guide) => library.writeTutorial(props.path, guide));
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

function change(next: GuideDocument, label: string): void {
  history.change(next, label);
}

function changeStep(stepId: string, edit: (step: GuideStep) => GuideStep, label: string): void {
  if (guide.value) change(updateStep(guide.value, stepId, edit), label);
}

// Opening and leaving.

onMounted(async () => {
  try {
    history.open(await library.readTutorial(props.path));
  } catch (cause) {
    warn(cause, 'This tutorial could not be opened.');
    emit('close');
    return;
  }
  const parts = partsOf(props.path);
  const sites = await library.scan().catch(() => []);
  site.value = sites.find((entry) => entry.id === parts.site) ?? null;
  theme.value = site.value?.themes.find((entry) => entry.id === parts.theme) ?? null;
  publishedAt.value =
    theme.value?.tutorials.find((entry) => entry.path === props.path)?.publishedAt ?? null;
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
});

onBeforeUnmount(() => {
  for (const stop of unlisten) stop();
  resizeObserver?.disconnect();
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('resize', placeSite);
  cancelAnimationFrame(frame);
  void invoke('site_bounds', { x: 0, y: 0, width: 1, height: 1, visible: false }).catch(() => {});
});

/**
 * Removes the screenshots no step uses any more, once the guide that uses the others is saved.
 * The images of the guide in memory are kept too, whatever the disk holds.
 */
async function prune(): Promise<void> {
  await history.flush();
  const keep = guide.value?.assets.map((asset) => asset.src) ?? [];
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

async function go(target = address.value): Promise<void> {
  if (!target.trim()) return;
  try {
    const url = await invoke<string>('site_navigate', { url: target });
    address.value = url;
    page.value = { url, loading: true };
    (document.getElementById('address') as HTMLInputElement | null)?.blur();
  } catch (cause) {
    warn(cause, 'This address could not be opened.');
  }
}

function browse(action: 'back' | 'forward' | 'reload'): void {
  void invoke('site_history', { action }).catch((cause) => warn(cause, 'The page did not answer.'));
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
    change(next, 'Record step');
    const last = next.steps.at(-1);
    if (last) select(last.id);
  },
  announce: notify,
  fail: (cause) => warn(cause, 'The step could not be recorded.'),
});
const recording = recorder.active;

async function toggleRecording(): Promise<void> {
  if (recording.value) {
    await recorder.stop();
    await prune();
    notify('Recording stopped');
  } else {
    if (!hasPage.value) await go(address.value || site.value?.address || '');
    await recorder.start();
    notify('Recording · each click becomes a step');
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
    warn(cause, 'The capture failed.');
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
    notify('Open the page of this step, then retake it from the properties');
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
      'Retake screenshot',
    );
    notify('Screenshot replaced');
  } catch (cause) {
    warn(cause, 'The capture failed.');
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
    notify('Recording stopped');
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
  if (guide.value) change(moveStep(guide.value, from, to), 'Move step');
}

function onDuration(stepId: string, ms: number): void {
  if (guide.value) change(setDuration(guide.value, stepId, ms), 'Change duration');
}

function onTransition(stepId: string): void {
  changeStep(
    stepId,
    (step) => ({ ...step, transition: step.transition === 'cut' ? 'fade' : 'cut' }),
    'Change transition',
  );
}

function onAddMarker(point: { x: number; y: number }): void {
  const step = selectedStep.value;
  if (!step) return;
  const added = addMarker(step, point);
  changeStep(step.id, () => added.step, 'Add marker');
  selectedMarker.value = added.id;
}

function onMoveMarker(id: string, point: { x: number; y: number }): void {
  const step = selectedStep.value;
  if (step) changeStep(step.id, (current) => moveMarker(current, id, point), 'Move marker');
}

function onRemoveMarker(id: string): void {
  const step = selectedStep.value;
  if (!step) return;
  changeStep(step.id, (current) => removeMarker(current, id), 'Delete marker');
  if (selectedMarker.value === id) selectedMarker.value = null;
}

function onRemoveStep(): void {
  const step = selectedStep.value;
  if (!step || !guide.value) return;
  const index = selectedIndex.value;
  change(removeStep(guide.value, step.id), 'Delete step');
  select(steps.value[Math.min(index, steps.value.length - 1)]?.id ?? null);
  notify('Step deleted', { label: 'Undo', run: undo });
}

function onDuplicateStep(): void {
  const step = selectedStep.value;
  if (!step || !guide.value) return;
  change(duplicateStep(guide.value, step.id), 'Duplicate step');
  selectBy(1);
}

function undo(): void {
  const label = history.undo();
  if (label) notify(`${label} undone`);
  if (!steps.value.some((step) => step.id === selectedId.value)) select(steps.value[0]?.id ?? null);
}

function redo(): void {
  const label = history.redo();
  if (label) notify(`${label} redone`);
}

// Publishing and export.

async function publish(): Promise<void> {
  if (!site.value?.publishTo) return;
  busy.value = true;
  try {
    await history.flush();
    const destination = await library.publish(props.path);
    publishedAt.value = new Date().toISOString();
    notify('Published', { label: 'Show', run: () => void library.reveal(destination, true) });
  } catch (cause) {
    warn(cause, 'The tutorial could not be published.');
  } finally {
    busy.value = false;
  }
}

async function exportZip(): Promise<void> {
  const name = partsOf(props.path).tutorial || 'tutorial';
  const target = await save({
    defaultPath: `${name}.zip`,
    filters: [{ name: 'Tutorial archive', extensions: ['zip'] }],
  }).catch(() => null);
  if (target) await exportTo(target);
}

/** `guide.json` and its screenshots in one archive, the one the extension and the CLI open. */
async function exportTo(target: string): Promise<void> {
  try {
    await history.flush();
    await library.exportZip(props.path, target);
    notify('ZIP saved', { label: 'Show', run: () => void library.reveal(target, true) });
  } catch (cause) {
    warn(cause, 'The export failed.');
  }
}

function hideMenus(): void {
  for (const menu of document.querySelectorAll<HTMLElement>('.menu:popover-open'))
    menu.hidePopover();
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

defineExpose({
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

function onInspectorStep(edit: (step: GuideStep) => GuideStep, label: string): void {
  const step = selectedStep.value;
  if (step) changeStep(step.id, edit, label);
}

function onInspectorGuide(edit: (guide: GuideDocument) => GuideDocument, label: string): void {
  if (guide.value) change(edit(guide.value), label);
}

function onWholePage(): void {
  const step = selectedStep.value;
  if (step) changeStep(step.id, (current) => scrollTo(current, null), 'Show whole page');
}
</script>

<template>
  <div class="editor" :data-label="label">
    <header class="editor-bar">
      <button type="button" class="button quiet" title="Back to the library" @click="close">
        <Logo :size="20" />Library
      </button>
      <button
        type="button"
        class="button record-toggle"
        :class="{ live: recording }"
        :aria-pressed="recording"
        :disabled="!canRecord"
        :title="
          !canRecord
            ? NO_RECORDING
            : recording
              ? 'Stop recording (Ctrl+R)'
              : 'Record the site (Ctrl+R)'
        "
        @click="recordNow"
      >
        <span class="record-dot" aria-hidden="true"></span>
        {{ recording ? `Recording · ${steps.length}` : 'Record' }}
      </button>
      <span class="bar-rule" aria-hidden="true"></span>
      <nav class="crumbs" aria-label="Place in the library">
        <span class="crumb">{{ site?.name ?? '…' }}</span>
        <Icon name="right" :size="13" />
        <span class="crumb"
          ><span class="label-dot" aria-hidden="true"></span>{{ theme?.name ?? '…' }}</span
        >
        <Icon name="right" :size="13" />
        <label class="visually-hidden" for="tutorial-name">Tutorial title</label>
        <input
          v-if="guide"
          id="tutorial-name"
          class="crumb-title"
          :value="guide.title"
          :size="Math.max(14, guide.title.length + 1)"
          @input="
            change(
              { ...guide, title: ($event.target as HTMLInputElement).value },
              'Rename tutorial',
            )
          "
        />
      </nav>
      <span class="bar-spacer"></span>
      <span class="save-state" :data-state="history.saving.value" role="status">
        <Icon v-if="history.saving.value === 'saved'" name="check" :size="14" />
        {{
          history.saving.value === 'saved'
            ? 'Saved'
            : history.saving.value === 'pending'
              ? 'Saving…'
              : 'Not saved'
        }}
      </span>
      <button
        type="button"
        class="button icon quiet"
        :disabled="!history.canUndo.value"
        :title="
          history.canUndo.value
            ? `Undo ${history.undoLabel.value.toLowerCase()} (Ctrl+Z)`
            : 'Nothing to undo'
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
            ? `Redo ${history.redoLabel.value.toLowerCase()} (Ctrl+Y)`
            : 'Nothing to redo'
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
        :title="`Publish to ${site.publishTo}`"
        @click="publish"
      >
        <Icon name="publish" :size="16" />Publish
      </button>
      <button
        v-else
        type="button"
        class="button primary"
        :disabled="!steps.length"
        @click="exportZip"
      >
        <Icon name="archive" :size="16" />Export
      </button>
      <button type="button" class="button icon quiet" title="More" popovertarget="editor-menu">
        <Icon name="more" />
      </button>
      <div id="editor-menu" popover class="menu" @click="hideMenus">
        <button type="button" :disabled="!steps.length" @click="exportZip">
          <Icon name="archive" />Export ZIP…
        </button>
        <button type="button" @click="library.reveal(props.path)">
          <Icon name="folder" />{{ revealLabel }}
        </button>
      </div>
    </header>

    <div class="editor-body">
      <MediaPanel
        v-if="guide"
        :guide="guide"
        :selected-id="selectedId"
        :image-of="imageOf"
        @select="pickStep"
        @move="onMove"
      />

      <section class="viewer" aria-label="Viewer">
        <div class="viewer-bar">
          <div class="segmented view-switch" role="group" aria-label="View">
            <button
              type="button"
              :aria-pressed="view === 'recorder'"
              title="The site, in the browser of the studio"
              @click="show('recorder')"
            >
              <Icon name="globe" :size="14" />Site
            </button>
            <button
              type="button"
              :aria-pressed="view === 'canvas'"
              :disabled="!steps.length"
              title="The selected step, to edit its markers and screen"
              @click="show('canvas')"
            >
              <Icon name="edit" :size="14" />Step
            </button>
          </div>
          <div class="browser-nav">
            <button
              type="button"
              class="button icon small quiet"
              title="Back"
              :disabled="!hasPage"
              @click="browse('back')"
            >
              <Icon name="left" :size="16" />
            </button>
            <button
              type="button"
              class="button icon small quiet"
              title="Forward"
              :disabled="!hasPage"
              @click="browse('forward')"
            >
              <Icon name="right" :size="16" />
            </button>
            <button
              type="button"
              class="button icon small quiet"
              title="Reload"
              :disabled="!hasPage"
              @click="browse('reload')"
            >
              <Icon name="reload" :size="15" />
            </button>
          </div>
          <form class="address" @submit.prevent="openAddress">
            <Icon name="globe" :size="14" />
            <label class="visually-hidden" for="address">Address</label>
            <input
              id="address"
              v-model="address"
              placeholder="Address of the page"
              spellcheck="false"
            />
            <span v-if="page?.loading" class="loading" aria-label="Loading"></span>
          </form>
          <button
            type="button"
            class="button small"
            :disabled="!canRecord || !hasPage || busy"
            :title="canRecord ? 'Add the page as it is now' : NO_RECORDING"
            @click="captureNow"
          >
            <Icon name="camera" :size="15" />Capture
          </button>
        </div>

        <div class="viewer-stage">
          <div v-if="stage === 'recorder'" class="browser-frame" :class="{ recording }">
            <div ref="siteSlot" class="site-slot"></div>
            <img v-if="still" ref="stillImage" class="site-still" :src="still" alt="" />
            <div v-if="!hasPage" class="browser-empty">
              <Icon name="globe" :size="30" />
              <h2>Open the page to record</h2>
              <p>Type its address above. Every click you make while recording becomes a step.</p>
              <button
                v-if="site?.address"
                type="button"
                class="button primary"
                @click="go(site.address)"
              >
                Open {{ site.address }}
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
              @scroll="
                (top) =>
                  changeStep(selectedStep!.id, (step) => scrollTo(step, top), 'Move visible part')
              "
            />
            <div v-else class="viewer-empty">
              <Icon name="route" :size="30" />
              <h2>No step yet</h2>
              <template v-if="canRecord">
                <p>Record the site. Each click you make becomes a step of this tutorial.</p>
                <button type="button" class="button record" @click="recordNow">
                  <Icon name="record" :size="14" />Record
                </button>
              </template>
              <p v-else>{{ NO_RECORDING }}. Open a tutorial recorded there to edit it here.</p>
            </div>
          </template>
        </div>

        <footer class="transport" aria-label="Playback">
          <button
            type="button"
            class="button icon small quiet"
            title="Previous step (←)"
            :disabled="selectedIndex <= 0"
            @click="selectBy(-1)"
          >
            <Icon name="left" :size="16" />
          </button>
          <button
            type="button"
            class="button icon play-button"
            :aria-label="playing ? 'Pause' : 'Play'"
            :title="playing ? 'Pause (Space)' : 'Play from the playhead (Space)'"
            :disabled="!steps.length"
            @click="playing ? pause() : play()"
          >
            <Icon :name="playing ? 'pause' : 'play'" :size="15" />
          </button>
          <button
            type="button"
            class="button icon small quiet"
            title="Next step (→)"
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
            Step {{ selectedIndex + 1 }} of {{ steps.length }}
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
    />
  </div>
</template>
