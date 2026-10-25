<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import type { GuideAnnotation, GuideStep, Point } from '@interactive-learning/protocol';
import type { StepDraft } from './draft';
import Icon from './Icon.vue';

/**
 * One step: its markers, its title, and where the cursor clicks, which is the first marker.
 * Positions are normalized from 0 to 1. Nothing is saved before Save step.
 */
const props = defineProps<{
  step: GuideStep;
  image: string;
  number: number;
  total: number;
  /** Number of the first marker of this step; the player counts markers across the guide. */
  markerNumber: number;
  /** `retake` captures the recorded tab again; `upload` picks an image file. */
  replace?: 'retake' | 'upload' | undefined;
  busy: boolean;
}>();
const emit = defineEmits<{
  save: [draft: StepDraft];
  cancel: [];
  go: [offset: number, draft: StepDraft | null];
  remove: [];
  retake: [];
  'replace-image': [file: File];
}>();

const markers = ref<GuideAnnotation[]>([]);
const title = ref('');
const url = ref('');
const urlError = ref('');
const selectedId = ref<string | null>(null);
const confirmDelete = ref(false);
const canvas = ref<HTMLElement | null>(null);
const list = ref<HTMLElement | null>(null);
const imageInput = ref<HTMLInputElement | null>(null);
let initial = '';
let dragging: { id: string; moved: boolean } | undefined;

const clamp = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 10_000) / 10_000;

function draft(): StepDraft {
  const stepTitle = title.value.trim();
  const [first] = markers.value;
  return {
    title: stepTitle,
    description: props.step.description,
    cursor: first ? { x: first.x, y: first.y, action: props.step.cursor?.action ?? 'click' } : null,
    annotations: markers.value.map((marker) => ({
      ...marker,
      title: marker.title.trim() || stepTitle || `Step ${props.number}`,
    })),
    url: url.value.trim(),
  };
}

watch(
  () => props.step.id,
  () => {
    const { annotations, cursor } = props.step;
    // A click recorded without markers becomes the first marker, so it can be seen and moved.
    markers.value = annotations.length
      ? annotations.map((annotation) => ({ ...annotation }))
      : cursor
        ? [{ id: crypto.randomUUID(), x: cursor.x, y: cursor.y, title: '', body: '' }]
        : [];
    title.value = props.step.title;
    url.value = props.step.source?.url ?? '';
    urlError.value = '';
    selectedId.value = null;
    confirmDelete.value = false;
    initial = JSON.stringify(draft());
  },
  { immediate: true },
);

function pointAt(event: PointerEvent | MouseEvent): Point {
  const box = canvas.value!.getBoundingClientRect();
  return {
    x: clamp((event.clientX - box.left) / box.width),
    y: clamp((event.clientY - box.top) / box.height),
  };
}

async function select(id: string, focus = false): Promise<void> {
  selectedId.value = id;
  if (!focus) return;
  await nextTick();
  list.value?.querySelector<HTMLInputElement>(`[data-marker="${id}"] input`)?.focus();
}

/** A click on the screenshot adds a marker there. */
function add(event: MouseEvent): void {
  const marker = { id: crypto.randomUUID(), ...pointAt(event), title: '', body: '' };
  markers.value.push(marker);
  void select(marker.id, true);
}

function remove(id: string): void {
  markers.value = markers.value.filter((marker) => marker.id !== id);
  if (selectedId.value === id) selectedId.value = null;
}

function startDrag(id: string, event: PointerEvent): void {
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  dragging = { id, moved: false };
  selectedId.value = id;
}

function drag(event: PointerEvent): void {
  const marker = markers.value.find((entry) => entry.id === dragging?.id);
  if (!dragging || !marker) return;
  Object.assign(marker, pointAt(event));
  dragging.moved = true;
}

function endDrag(id: string): void {
  // A press without movement is a selection: the marker's text field gets the focus.
  if (dragging && !dragging.moved) void select(id, true);
  dragging = undefined;
}

function onMarkerKey(id: string, event: KeyboardEvent): void {
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault();
    remove(id);
    return;
  }
  const moves: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  };
  const move = moves[event.key];
  const marker = markers.value.find((entry) => entry.id === id);
  if (!move || !marker) return;
  event.preventDefault();
  const step = event.shiftKey ? 0.05 : 0.01;
  marker.x = clamp(marker.x + move[0] * step);
  marker.y = clamp(marker.y + move[1] * step);
}

/** The protocol accepts web addresses only; say so before the save fails. */
function checkUrl(): boolean {
  const value = url.value.trim();
  let valid = !value;
  try {
    valid ||= ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    valid = false;
  }
  urlError.value = valid ? '' : 'Enter an address that starts with http:// or https://.';
  return valid;
}

function save(): void {
  if (checkUrl()) emit('save', draft());
}

function go(offset: number): void {
  const current = pending();
  if (current !== false) emit('go', offset, current);
}

/** The unsaved draft, null when nothing changed, or false when the address is invalid. */
function pending(): StepDraft | null | false {
  if (!checkUrl()) return false;
  const current = draft();
  return JSON.stringify(current) === initial ? null : current;
}

function pickImage(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (file) emit('replace-image', file);
}

defineExpose({ pending });
</script>

<template>
  <main class="content editor" aria-labelledby="editor-title">
    <div class="editor-nav">
      <h1 id="editor-title">Step {{ number }} of {{ total }}</h1>
      <div class="pager">
        <button
          class="square"
          type="button"
          aria-label="Previous step"
          :disabled="number === 1"
          @click="go(-1)"
        >
          <Icon name="left" />
        </button>
        <button
          class="square"
          type="button"
          aria-label="Next step"
          :disabled="number === total"
          @click="go(1)"
        >
          <Icon name="right" />
        </button>
      </div>
    </div>

    <div ref="canvas" class="canvas" @click="add">
      <img :src="image" :alt="`Screenshot of step ${number}`" draggable="false" />
      <svg
        v-if="markers[0]"
        class="canvas-cursor"
        :style="{ left: `${markers[0].x * 100}%`, top: `${markers[0].y * 100}%` }"
        width="16"
        height="20"
        viewBox="0 0 30 36"
        aria-hidden="true"
      >
        <path
          d="M3 2.5 25 20l-10 .8 4.6 9-5 2.6-4.5-9L3 30V2.5Z"
          fill="#1b1e22"
          stroke="white"
          stroke-width="2.4"
          stroke-linejoin="round"
        />
      </svg>
      <button
        v-for="(marker, index) in markers"
        :key="marker.id"
        class="canvas-marker"
        :class="{ selected: marker.id === selectedId }"
        type="button"
        :style="{ left: `${marker.x * 100}%`, top: `${marker.y * 100}%` }"
        :aria-label="`Marker ${markerNumber + index}. Drag or use the arrow keys to move it, Delete to remove it.`"
        @click.stop
        @pointerdown="startDrag(marker.id, $event)"
        @pointermove="drag"
        @pointerup="endDrag(marker.id)"
        @pointercancel="endDrag(marker.id)"
        @keydown="onMarkerKey(marker.id, $event)"
        @focus="selectedId = marker.id"
      >
        {{ markerNumber + index }}
      </button>
      <span v-if="!markers.length" class="canvas-hint">Click to add a marker</span>
    </div>

    <div class="tools">
      <p class="hint">Click the screenshot to add a marker. Drag one to move it.</p>
      <button
        v-if="replace === 'retake'"
        class="ghost"
        type="button"
        :disabled="busy"
        @click="emit('retake')"
      >
        <Icon name="retake" />Retake
      </button>
      <template v-else-if="replace === 'upload'">
        <button class="ghost" type="button" :disabled="busy" @click="imageInput?.click()">
          <Icon name="image" />Replace image
        </button>
        <input
          ref="imageInput"
          class="visually-hidden"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          tabindex="-1"
          aria-hidden="true"
          @change="pickImage"
        />
      </template>
    </div>

    <div class="field">
      <div class="label-row">
        <label for="step-title">Step title</label>
        <button
          class="ghost square"
          type="button"
          aria-label="Delete this step"
          title="Delete this step"
          @click="confirmDelete = !confirmDelete"
        >
          <Icon name="trash" />
        </button>
      </div>
      <div v-if="confirmDelete" class="confirm" role="alert">
        <span>Delete step {{ number }} and its screenshot?</span>
        <button class="danger small" type="button" :disabled="busy" @click="emit('remove')">
          Delete
        </button>
        <button class="ghost small" type="button" @click="confirmDelete = false">Keep</button>
      </div>
      <input
        id="step-title"
        v-model="title"
        maxlength="500"
        placeholder="Name your project"
        autocomplete="off"
      />
    </div>

    <div class="field">
      <label for="step-url">Page address</label>
      <input
        id="step-url"
        v-model="url"
        type="url"
        inputmode="url"
        maxlength="4000"
        placeholder="https://example.com/projects/new"
        autocomplete="off"
        :aria-invalid="Boolean(urlError)"
        aria-describedby="step-url-help"
        @input="urlError = ''"
      />
      <p v-if="urlError" id="step-url-help" class="field-error" role="alert">{{ urlError }}</p>
      <p v-else id="step-url-help" class="hint">
        The player can show it above the screenshot with its info button.
      </p>
    </div>

    <div class="field">
      <div class="label-row">
        <span class="label">Markers</span>
        <span v-if="markers.length" class="count">{{ markers.length }}</span>
      </div>
      <ol v-if="markers.length" ref="list" class="markers">
        <li
          v-for="(marker, index) in markers"
          :key="marker.id"
          :data-marker="marker.id"
          :class="{ selected: marker.id === selectedId }"
        >
          <span class="marker-number" aria-hidden="true">{{ markerNumber + index }}</span>
          <input
            v-model="marker.title"
            maxlength="500"
            autocomplete="off"
            :placeholder="
              index === 0 ? 'Give your project a clear name.' : 'What this marker shows'
            "
            :aria-label="`Text of marker ${markerNumber + index}`"
            @focus="selectedId = marker.id"
          />
          <button
            class="ghost square"
            type="button"
            :aria-label="`Delete marker ${markerNumber + index}`"
            :title="`Delete marker ${markerNumber + index}`"
            @click="remove(marker.id)"
          >
            <Icon name="trash" :size="16" />
          </button>
        </li>
      </ol>
      <p v-else class="hint">No markers on this step. The guide shows only the screenshot.</p>
      <p v-if="markers.length" class="hint">
        The cursor clicks marker {{ markerNumber }}. Each text opens from its marker.
      </p>
    </div>
  </main>

  <footer class="actions">
    <button class="primary grow" type="button" :disabled="busy" @click="save">Save step</button>
    <button class="text" type="button" @click="emit('cancel')">Cancel</button>
  </footer>
</template>
