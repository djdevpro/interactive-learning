<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { GuideAsset, GuideStep, Point } from '@interactive-learning/protocol';
import Icon from './Icon.vue';

/**
 * The screenshot of the selected step, on the stage of the viewer. A click adds a marker,
 * a marker drags to its place, and on a full-page screenshot the frame of the part shown on
 * screen drags up and down. Every change goes to the editor, which keeps it and its undo.
 */
const props = defineProps<{
  step: GuideStep;
  asset: GuideAsset | undefined;
  image: string;
  /** Number of the first marker of this step; the player counts markers across the tutorial. */
  firstNumber: number;
  selectedMarker: string | null;
}>();
const emit = defineEmits<{
  add: [point: Point];
  move: [id: string, point: Point, done: boolean];
  select: [id: string | null];
  remove: [id: string];
  scroll: [top: number];
}>();

const scale = ref<number | 'fit'>('fit');
const area = ref<HTMLElement | null>(null);
const canvas = ref<HTMLElement | null>(null);
const available = ref(800);
let resizeObserver: ResizeObserver | undefined;
let dragging: { id: string; moved: boolean } | undefined;
let frameDrag: { offset: number } | undefined;
const live = ref<{ id: string; point: Point } | null>(null);
const liveTop = ref<number | null>(null);

/** Width of the screenshot on screen: the width of the wall, or a chosen zoom. */
const shownWidth = computed(() => {
  const natural = props.asset?.width ?? 1280;
  const fit = Math.max(320, available.value - 96);
  return scale.value === 'fit' ? Math.min(fit, natural) : natural * scale.value;
});
const zoomLabel = computed(() =>
  scale.value === 'fit'
    ? `${Math.round((shownWidth.value / (props.asset?.width ?? 1280)) * 100)}%`
    : `${Math.round(scale.value * 100)}%`,
);
const frame = computed(() => {
  const view = props.step.viewport;
  if (!view || view.height >= 0.999) return null;
  return { ...view, y: liveTop.value ?? view.y };
});

function positionOf(id: string, point: Point): Point {
  return live.value?.id === id ? live.value.point : point;
}

function pointAt(event: PointerEvent | MouseEvent): Point {
  const box = canvas.value!.getBoundingClientRect();
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  return {
    x: clamp((event.clientX - box.left) / box.width),
    y: clamp((event.clientY - box.top) / box.height),
  };
}

function place(event: MouseEvent): void {
  if (event.target !== event.currentTarget && !(event.target as HTMLElement).dataset.surface)
    return;
  emit('add', pointAt(event));
}

function grab(id: string, event: PointerEvent): void {
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  dragging = { id, moved: false };
  emit('select', id);
}

function drag(event: PointerEvent): void {
  if (!dragging) return;
  dragging.moved = true;
  live.value = { id: dragging.id, point: pointAt(event) };
}

function release(): void {
  if (dragging?.moved && live.value) emit('move', live.value.id, live.value.point, true);
  dragging = undefined;
  live.value = null;
}

function nudge(id: string, point: Point, event: KeyboardEvent): void {
  const moves: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  };
  // The keys a marker answers stay with it: the editor does not also act on the step.
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault();
    event.stopPropagation();
    emit('remove', id);
    return;
  }
  const move = moves[event.key];
  if (!move) return;
  event.preventDefault();
  event.stopPropagation();
  const step = event.shiftKey ? 0.02 : 0.004;
  emit('move', id, { x: point.x + move[0] * step, y: point.y + move[1] * step }, false);
}

function grabFrame(event: PointerEvent): void {
  if (!frame.value) return;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  frameDrag = { offset: pointAt(event).y - frame.value.y };
}

function dragFrame(event: PointerEvent): void {
  if (!frameDrag || !frame.value) return;
  liveTop.value = Math.min(
    1 - frame.value.height,
    Math.max(0, pointAt(event).y - frameDrag.offset),
  );
}

function releaseFrame(): void {
  if (frameDrag && liveTop.value !== null) emit('scroll', liveTop.value);
  frameDrag = undefined;
  liveTop.value = null;
}

function frameKey(event: KeyboardEvent): void {
  if (!frame.value || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
  event.preventDefault();
  event.stopPropagation();
  const amount = (event.shiftKey ? 0.5 : 0.1) * frame.value.height;
  emit('scroll', frame.value.y + (event.key === 'ArrowUp' ? -amount : amount));
}

/** A tall screenshot opens on the part that was on screen. */
async function reveal(): Promise<void> {
  await nextTick();
  const view = props.step.viewport;
  const box = canvas.value;
  if (!area.value || !box || !view) return;
  const top = view.y * box.clientHeight;
  const middle = top + (view.height * box.clientHeight) / 2;
  area.value.scrollTop = Math.max(0, middle - area.value.clientHeight / 2 + 40);
}

function zoomBy(direction: 1 | -1): void {
  const natural = props.asset?.width ?? 1280;
  const current = shownWidth.value / natural;
  const steps = [0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2];
  const next =
    direction > 0
      ? steps.find((value) => value > current + 0.01)
      : [...steps].reverse().find((value) => value < current - 0.01);
  scale.value = next ?? scale.value;
}

watch(() => props.step.id, reveal);
onMounted(() => {
  resizeObserver = new ResizeObserver(([entry]) => {
    if (entry) available.value = entry.contentRect.width;
  });
  if (area.value) resizeObserver.observe(area.value);
  void reveal();
});
onBeforeUnmount(() => resizeObserver?.disconnect());

defineExpose({ zoomBy, fit: () => (scale.value = 'fit') });
</script>

<template>
  <div class="wall">
    <div ref="area" class="wall-scroll">
      <div class="hang" :style="{ width: `${shownWidth}px` }">
        <div
          ref="canvas"
          class="screen"
          :style="{ aspectRatio: asset ? `${asset.width} / ${asset.height}` : '16 / 10' }"
          @click="place"
        >
          <img class="screen-image" :src="image" alt="" draggable="false" data-surface="1" />

          <div
            v-if="frame"
            class="on-screen"
            :style="{ top: `${frame.y * 100}%`, height: `${frame.height * 100}%` }"
            data-surface="1"
          >
            <span
              class="on-screen-handle"
              role="slider"
              tabindex="0"
              aria-label="Part of the page on screen"
              aria-orientation="vertical"
              :aria-valuenow="Math.round(frame.y * 100)"
              aria-valuemin="0"
              aria-valuemax="100"
              title="Drag to change what the viewer sees of the page"
              @pointerdown.stop="grabFrame"
              @pointermove="dragFrame"
              @pointerup="releaseFrame"
              @pointercancel="releaseFrame"
              @keydown="frameKey"
              @click.stop
            >
              <Icon name="frame" :size="14" />On screen
            </span>
          </div>

          <button
            v-for="(marker, index) in step.annotations"
            :key="marker.id"
            type="button"
            class="pin tabular"
            :class="{ selected: marker.id === selectedMarker, clicked: index === 0 && step.cursor }"
            :style="{
              left: `${positionOf(marker.id, marker).x * 100}%`,
              top: `${positionOf(marker.id, marker).y * 100}%`,
            }"
            :aria-label="`Marker ${firstNumber + index}${marker.title ? `: ${marker.title}` : ''}`"
            :title="index === 0 && step.cursor ? 'The cursor clicks here' : 'Drag to move'"
            @pointerdown.stop="grab(marker.id, $event)"
            @pointermove="drag"
            @pointerup="release"
            @pointercancel="release"
            @keydown="nudge(marker.id, marker, $event)"
            @click.stop
          >
            {{ firstNumber + index }}
          </button>
        </div>
      </div>
    </div>

    <div class="wall-tools" role="toolbar" aria-label="Zoom">
      <button type="button" class="button icon small quiet" title="Zoom out" @click="zoomBy(-1)">
        <Icon name="zoomOut" :size="16" />
      </button>
      <button
        type="button"
        class="zoom-value tabular"
        title="Fit to the window"
        @click="scale = 'fit'"
      >
        {{ zoomLabel }}
      </button>
      <button type="button" class="button icon small quiet" title="Zoom in" @click="zoomBy(1)">
        <Icon name="zoomIn" :size="16" />
      </button>
    </div>
  </div>
</template>
