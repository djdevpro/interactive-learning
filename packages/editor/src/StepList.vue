<script setup lang="ts">
import { ref } from 'vue';
import type { GuideStep } from '@interactive-learning/protocol';
import { markerSummary } from './draft';
import Icon from './Icon.vue';

/**
 * Thumbnails of the steps. The selected one is marked as current. With `reorderable`, a step is
 * dragged to a new place, or moved with Alt and the arrow keys.
 */
const props = defineProps<{
  steps: readonly GuideStep[];
  imageOf: (assetId: string) => string;
  selectedId?: string | null;
  reorderable?: boolean;
}>();
const emit = defineEmits<{ select: [stepId: string]; move: [from: number, to: number] }>();

const dragged = ref<number | null>(null);
const target = ref<number | null>(null);

/** A thumbnail of a full-page screenshot shows the part the screen showed at that step. */
function thumbnailPosition(step: GuideStep): string {
  const view = step.viewport;
  if (!view || view.height >= 1) return 'top left';
  return `left ${Math.round((view.y / (1 - view.height)) * 100)}%`;
}

function drop(index: number): void {
  if (dragged.value !== null && dragged.value !== index) emit('move', dragged.value, index);
  dragged.value = null;
  target.value = null;
}

function onKey(index: number, event: KeyboardEvent): void {
  if (!props.reorderable || !event.altKey) return;
  const offset = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
  const to = index + offset;
  if (!offset || to < 0 || to >= props.steps.length) return;
  event.preventDefault();
  emit('move', index, to);
}
</script>

<template>
  <ol class="steps">
    <li
      v-for="(step, index) in steps"
      :key="step.id"
      :class="{
        dragged: dragged === index,
        'drop-before': target === index && dragged !== null && dragged > index,
        'drop-after': target === index && dragged !== null && dragged < index,
      }"
      :draggable="reorderable"
      @dragstart="dragged = index"
      @dragend="((dragged = null), (target = null))"
      @dragover.prevent="target = index"
      @drop.prevent="drop(index)"
    >
      <button
        type="button"
        class="step"
        :class="{ selected: step.id === selectedId }"
        :aria-current="step.id === selectedId ? 'step' : undefined"
        :aria-keyshortcuts="reorderable ? 'Alt+ArrowUp Alt+ArrowDown' : undefined"
        @click="emit('select', step.id)"
        @keydown="onKey(index, $event)"
      >
        <img
          :src="imageOf(step.assetId)"
          alt=""
          draggable="false"
          :style="{ objectPosition: thumbnailPosition(step) }"
        />
        <span class="step-text">
          <span class="step-number">Step {{ index + 1 }}</span>
          <span class="step-title">{{ step.title || 'Untitled step' }}</span>
          <span class="step-meta" :class="{ missing: markerSummary(step) === 'No marker yet' }">
            {{ markerSummary(step) }}
          </span>
        </span>
        <Icon v-if="reorderable" class="step-grip" name="grip" :size="16" />
        <Icon v-else name="right" :size="16" />
      </button>
    </li>
  </ol>
</template>
