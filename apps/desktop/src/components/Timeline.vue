<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { GuideDocument, GuideStep } from '@interactive-learning/protocol';
import { markerNumber } from '@interactive-learning/editor/draft';
import Icon from './Icon.vue';
import { clampDuration, seconds, stepStarts } from '../editing';
import { runtime, timecode } from '../library';

/**
 * The timeline of the tutorial: a ruler, a Steps track where each step is a clip as long as it
 * plays, a Markers track with the markers of each step, and the playhead across them. Drag a clip
 * to move its step, drag its right edge to change its time, click a joint to fade or cut.
 */
const props = defineProps<{
  guide: GuideDocument;
  selectedId: string | null;
  playhead: number;
  playing: boolean;
  imageOf: (step: GuideStep) => string;
}>();
const emit = defineEmits<{
  select: [stepId: string];
  'select-marker': [stepId: string, markerId: string];
  seek: [ms: number];
  move: [from: number, to: number];
  duration: [stepId: string, ms: number];
  transition: [stepId: string];
  duplicate: [];
  remove: [];
}>();

const zoom = ref(48);
const scroller = ref<HTMLElement | null>(null);
const dragging = ref<{ index: number; offset: number; target: number; moved: boolean } | null>(
  null,
);
let resizing: { stepId: string; left: number } | undefined;
let pointerStart = 0;

const timing = computed(() => stepStarts(props.guide));

/** Zoom that shows the whole tutorial in the width of the panel. */
function fit(): void {
  manualZoom = false;
  const room = (scroller.value?.clientWidth ?? 800) - TAIL;
  const seconds = Math.max(8, timing.value.total / 1000);
  zoom.value = Math.min(120, Math.max(12, Math.floor((room / seconds) * 10) / 10));
}

/** Room after the last step, for its handle and the joint of a next one. */
const TAIL = 40;
// The whole tutorial stays in view as steps come and go and as the window changes, until the
// zoom is set by hand.
let manualZoom = false;
let resizeObserver: ResizeObserver | undefined;
onMounted(() => {
  fit();
  resizeObserver = new ResizeObserver(() => {
    panelWidth.value = scroller.value?.clientWidth ?? panelWidth.value;
    if (!manualZoom && !resizing) fit();
  });
  if (scroller.value) resizeObserver.observe(scroller.value);
});
onBeforeUnmount(() => resizeObserver?.disconnect());
watch(
  () => timing.value.total,
  () => {
    // While an edge is dragged, the scale holds still under the pointer.
    if (!manualZoom && !resizing) fit();
  },
);
const px = (ms: number) => (ms / 1000) * zoom.value;
const width = computed(() => px(timing.value.total) + TAIL);
/** The ruler runs to the right edge of the panel, even when the tutorial is shorter. */
const panelWidth = ref(0);
const ticks = computed(() => {
  const every = zoom.value < 20 ? 10 : zoom.value < 40 ? 5 : 1;
  const label = zoom.value < 20 ? 30 : zoom.value < 40 ? 10 : 5;
  const list: { at: number; label: string | null }[] = [];
  const end = (Math.max(width.value, panelWidth.value) / zoom.value) * 1000;
  for (let second = 0; second * 1000 <= end; second += every) {
    list.push({
      at: px(second * 1000),
      label: second % label === 0 ? runtime(second * 1000) : null,
    });
  }
  return list;
});

/** Height of the picture in a clip, above its caption. */
const FILM_HEIGHT = 58;

function filmStyle(step: GuideStep): Record<string, string> {
  const asset = props.guide.assets.find((candidate) => candidate.id === step.assetId);
  const view = step.viewport ?? { x: 0, y: 0, width: 1, height: 1 };
  if (!asset) return {};
  const scale = FILM_HEIGHT / (asset.height * view.height);
  return {
    backgroundImage: `url("${props.imageOf(step)}")`,
    backgroundSize: `${asset.width * scale}px ${asset.height * scale}px`,
    backgroundPosition: `${-view.x * asset.width * scale}px ${-view.y * asset.height * scale}px`,
  };
}

/** Time under the pointer, within the tutorial unless `beyond` lets it pass its end. */
function timeAt(event: PointerEvent, beyond = false): number {
  const box = scroller.value!.getBoundingClientRect();
  const x = event.clientX - box.left + scroller.value!.scrollLeft;
  const time = Math.max(0, (x / zoom.value) * 1000);
  return beyond ? time : Math.min(timing.value.total, time);
}

function seekFrom(event: PointerEvent): void {
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  emit('seek', timeAt(event));
}

function scrub(event: PointerEvent): void {
  if (event.buttons === 1) emit('seek', timeAt(event));
}

function grab(index: number, event: PointerEvent): void {
  if (event.button !== 0) return;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  pointerStart = event.clientX;
  dragging.value = { index, offset: 0, target: index, moved: false };
  const step = props.guide.steps[index];
  if (step) emit('select', step.id);
}

function drag(event: PointerEvent): void {
  const state = dragging.value;
  if (!state) return;
  const offset = event.clientX - pointerStart;
  if (!state.moved && Math.abs(offset) < 5) return;
  state.moved = true;
  state.offset = offset;
  const step = props.guide.steps[state.index];
  const center = px(timing.value.starts[state.index] ?? 0) + offset + px(step?.durationMs ?? 0) / 2;
  let target = 0;
  timing.value.starts.forEach((start, position) => {
    const middle = px(start) + px(props.guide.steps[position]?.durationMs ?? 0) / 2;
    if (position !== state.index && center > middle) {
      target = position < state.index ? position + 1 : position;
    }
  });
  state.target = Math.max(0, Math.min(props.guide.steps.length - 1, target));
}

function drop(): void {
  const state = dragging.value;
  dragging.value = null;
  if (state?.moved && state.target !== state.index) emit('move', state.index, state.target);
}

function startResize(step: GuideStep, index: number, event: PointerEvent): void {
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  resizing = { stepId: step.id, left: timing.value.starts[index] ?? 0 };
  emit('select', step.id);
}

function resize(event: PointerEvent): void {
  if (!resizing) return;
  emit('duration', resizing.stepId, clampDuration(timeAt(event, true) - resizing.left));
}

function endResize(): void {
  resizing = undefined;
  if (!manualZoom) fit();
}

function place(index: number, step: GuideStep): Record<string, string> {
  const state = dragging.value;
  return {
    left: `${px(timing.value.starts[index] ?? 0)}px`,
    width: `${px(step.durationMs)}px`,
    ...(state?.moved && state.index === index
      ? { translate: `${state.offset}px 0`, zIndex: '3' }
      : {}),
  };
}

const dropLine = computed(() => {
  const state = dragging.value;
  if (!state?.moved || state.target === state.index) return null;
  const step = props.guide.steps[state.target];
  const start = timing.value.starts[state.target] ?? 0;
  return px(state.target > state.index ? start + (step?.durationMs ?? 0) : start);
});

watch(
  () => props.selectedId,
  async (id) => {
    await nextTick();
    scroller.value
      ?.querySelector<HTMLElement>(`[data-step="${id}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  },
);
watch(
  () => props.playhead,
  (ms) => {
    const area = scroller.value;
    if (!area || !props.playing) return;
    const x = px(ms);
    if (x < area.scrollLeft || x > area.scrollLeft + area.clientWidth - 40) {
      area.scrollLeft = Math.max(0, x - 80);
    }
  },
);
</script>

<template>
  <section class="timeline" aria-label="Timeline">
    <header class="timeline-bar">
      <button
        type="button"
        class="button icon small quiet"
        title="Duplicate step (Ctrl+D)"
        :disabled="!selectedId"
        @click="emit('duplicate')"
      >
        <Icon name="copy" :size="16" />
      </button>
      <button
        type="button"
        class="button icon small quiet"
        title="Delete step (Delete)"
        :disabled="!selectedId"
        @click="emit('remove')"
      >
        <Icon name="trash" :size="16" />
      </button>
      <span class="timeline-spacer"></span>
      <span class="timeline-total tabular"
        >{{ guide.steps.length === 1 ? '1 step' : `${guide.steps.length} steps` }} ·
        {{ timecode(timing.total) }}</span
      >
      <button type="button" class="button small quiet" title="Show the whole tutorial" @click="fit">
        <Icon name="fit" :size="15" />Fit
      </button>
      <label class="zoom" title="Zoom the timeline">
        <Icon name="zoomOut" :size="15" />
        <span class="visually-hidden">Zoom</span>
        <input
          v-model.number="zoom"
          type="range"
          min="12"
          max="160"
          step="4"
          @input="manualZoom = true"
        />
        <Icon name="zoomIn" :size="15" />
      </label>
    </header>

    <div class="timeline-body">
      <div class="track-names" aria-hidden="true">
        <span class="track-name ruler-name"></span>
        <span class="track-name steps-name"><Icon name="camera" :size="14" />Steps</span>
        <span class="track-name markers-name"><Icon name="marker" :size="14" />Markers</span>
      </div>

      <div
        ref="scroller"
        class="timeline-scroll"
        @pointermove="drag"
        @pointerup="drop"
        @pointercancel="drop"
      >
        <div class="timeline-canvas" :style="{ width: `${width}px` }">
          <div class="ruler" @pointerdown="seekFrom" @pointermove="scrub">
            <span
              v-for="tick in ticks"
              :key="tick.at"
              class="tick"
              :class="{ major: tick.label }"
              :style="{ left: `${tick.at}px` }"
            >
              <span v-if="tick.label" class="tick-label tabular">{{ tick.label }}</span>
            </span>
          </div>

          <div
            class="lane steps-lane"
            role="listbox"
            aria-label="Steps"
            aria-orientation="horizontal"
          >
            <div
              v-for="(step, index) in guide.steps"
              :key="step.id"
              class="clip"
              role="option"
              :data-step="step.id"
              :aria-selected="step.id === selectedId"
              :aria-label="`Step ${index + 1}: ${step.title || 'Untitled'}, ${seconds(step.durationMs)}`"
              :class="{
                selected: step.id === selectedId,
                lifted: dragging?.moved && dragging.index === index,
              }"
              :style="place(index, step)"
              @pointerdown="grab(index, $event)"
            >
              <span class="clip-shot" :style="filmStyle(step)"></span>
              <span class="clip-caption">
                <span class="clip-number tabular">{{ index + 1 }}</span>
                <span class="clip-title">{{ step.title || 'Untitled step' }}</span>
                <span class="clip-time tabular">{{ seconds(step.durationMs) }}</span>
              </span>
              <span
                class="clip-handle"
                title="Drag to change how long this step plays"
                @pointerdown.stop="startResize(step, index, $event)"
                @pointermove="resize"
                @pointerup="endResize"
                @pointercancel="endResize"
              ></span>
            </div>
            <button
              v-for="(step, index) in guide.steps.slice(1)"
              :key="`to-${step.id}`"
              type="button"
              class="joint"
              :class="step.transition === 'cut' ? 'cut' : 'fade'"
              :style="{ left: `${px(timing.starts[index + 1] ?? 0)}px` }"
              :title="
                step.transition === 'cut'
                  ? `Step ${index + 2} cuts in. Click to fade.`
                  : `Step ${index + 2} fades in. Click to cut.`
              "
              @click="emit('transition', step.id)"
            >
              <Icon :name="step.transition === 'cut' ? 'cut' : 'fade'" :size="13" />
            </button>
            <span
              v-if="dropLine !== null"
              class="drop-line"
              :style="{ left: `${dropLine}px` }"
            ></span>
          </div>

          <div class="lane markers-lane">
            <template v-for="(step, index) in guide.steps" :key="`m-${step.id}`">
              <span
                v-if="step.annotations.length"
                class="marker-group"
                :style="{
                  left: `${px(timing.starts[index] ?? 0)}px`,
                  width: `${px(step.durationMs)}px`,
                }"
              >
                <button
                  v-for="(marker, position) in step.annotations"
                  :key="marker.id"
                  type="button"
                  class="marker-chip tabular"
                  :title="marker.title || 'Marker'"
                  @click="emit('select-marker', step.id, marker.id)"
                >
                  <span class="marker-chip-number">{{
                    markerNumber(guide.steps, index) + position
                  }}</span>
                  <span class="marker-chip-title">{{ marker.title || 'Marker' }}</span>
                </button>
              </span>
            </template>
          </div>

          <span class="playhead" :style="{ left: `${px(playhead)}px` }" aria-hidden="true"></span>
        </div>
      </div>
    </div>
  </section>
</template>
