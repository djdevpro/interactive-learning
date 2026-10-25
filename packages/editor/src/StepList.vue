<script setup lang="ts">
import type { GuideStep } from '@interactive-learning/protocol';
import { markerSummary } from './draft';
import Icon from './Icon.vue';

/** Thumbnails of the steps. The selected one is marked as current. */
defineProps<{
  steps: readonly GuideStep[];
  imageOf: (assetId: string) => string;
  selectedId?: string | null;
}>();
const emit = defineEmits<{ select: [stepId: string] }>();
</script>

<template>
  <ol class="steps">
    <li v-for="(step, index) in steps" :key="step.id">
      <button
        type="button"
        class="step"
        :class="{ selected: step.id === selectedId }"
        :aria-current="step.id === selectedId ? 'step' : undefined"
        @click="emit('select', step.id)"
      >
        <img :src="imageOf(step.assetId)" alt="" />
        <span class="step-text">
          <span class="step-number">Step {{ index + 1 }}</span>
          <span class="step-title">{{ step.title || 'Untitled step' }}</span>
          <span class="step-meta" :class="{ missing: markerSummary(step) === 'No marker yet' }">
            {{ markerSummary(step) }}
          </span>
        </span>
        <Icon name="right" :size="16" />
      </button>
    </li>
  </ol>
</template>
