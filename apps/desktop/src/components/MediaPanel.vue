<script setup lang="ts">
import type { GuideDocument, GuideStep } from '@interactive-learning/protocol';
import { seconds } from '../editing';
import { t } from '../i18n';
import { canRecord } from '../platform';

/** The left panel of the editor: the steps of the tutorial, in the order a viewer meets them. */
defineProps<{
  guide: GuideDocument;
  selectedId: string | null;
  imageOf: (step: GuideStep) => string;
}>();
const emit = defineEmits<{
  select: [stepId: string];
  move: [from: number, to: number];
  menu: [event: MouseEvent, stepId: string];
}>();

function thumbStyle(step: GuideStep): Record<string, string> {
  const view = step.viewport;
  const top = view && view.height < 1 ? (view.y / (1 - view.height)) * 100 : 0;
  return { objectPosition: `0 ${Math.min(100, Math.max(0, top))}%` };
}

function onKey(index: number, event: KeyboardEvent): void {
  if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
  event.preventDefault();
  event.stopPropagation();
  emit('move', index, index + (event.key === 'ArrowUp' ? -1 : 1));
}
</script>

<template>
  <aside class="media" aria-labelledby="media-title">
    <header class="media-head">
      <h2 id="media-title">
        {{ t('media.steps') }} <span class="label-count tabular">{{ guide.steps.length }}</span>
      </h2>
    </header>

    <ol class="outline">
      <li v-for="(step, index) in guide.steps" :key="step.id">
        <button
          type="button"
          class="outline-row"
          :aria-current="step.id === selectedId ? 'step' : undefined"
          :title="t('media.moveHint')"
          @click="emit('select', step.id)"
          @keydown="onKey(index, $event)"
          @contextmenu="emit('menu', $event, step.id)"
        >
          <span class="outline-number tabular">{{ index + 1 }}</span>
          <img class="outline-thumb" :src="imageOf(step)" :style="thumbStyle(step)" alt="" />
          <span class="outline-text">
            <span class="outline-title">{{ step.title || t('common.untitledStep') }}</span>
            <span class="outline-meta tabular">
              {{ seconds(step.durationMs) }}
              <template v-if="step.annotations.length">
                · {{ t('common.markers', { count: step.annotations.length }) }}
              </template>
            </span>
          </span>
        </button>
      </li>
      <li v-if="!guide.steps.length" class="outline-empty">
        {{ canRecord ? t('media.emptyRecord') : t('media.empty') }}
      </li>
    </ol>
  </aside>
</template>
