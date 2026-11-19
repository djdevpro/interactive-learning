<script setup lang="ts">
import { computed, nextTick, watch } from 'vue';
import type { GuideDocument, GuideStep } from '@interactive-learning/protocol';
import Icon from './Icon.vue';
import { MAX_DURATION_MS, MIN_DURATION_MS, seconds, stepStarts } from '../editing';
import { formatDateTime, t, type MessageKey } from '../i18n';
import { runtime } from '../library';
import { canRecord, noRecording } from '../platform';

/**
 * The properties of what is selected: the step with its time, its screen and its markers, or
 * the tutorial when no step is selected. Every field applies at once.
 */
const props = defineProps<{
  guide: GuideDocument;
  step: GuideStep | undefined;
  index: number;
  firstNumber: number;
  selectedMarker: string | null;
  canRetake: boolean;
  publishTo: string | null;
  publishedAt: string | null;
}>();
const emit = defineEmits<{
  step: [change: (step: GuideStep) => GuideStep, label: MessageKey];
  guide: [change: (guide: GuideDocument) => GuideDocument, label: MessageKey];
  'select-marker': [id: string | null];
  'remove-marker': [id: string];
  'remove-step': [];
  'duplicate-step': [];
  retake: [];
  'whole-page': [whole: boolean];
  'marker-menu': [event: MouseEvent, id: string];
}>();

const total = computed(() => stepStarts(props.guide).total);
const pages = computed(
  () => new Set(props.guide.steps.map((step) => step.source?.url).filter(Boolean)).size,
);

function text(event: Event): string {
  return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
}

function setDuration(event: Event): void {
  const value = Number.parseFloat(text(event).replace(',', '.'));
  if (!Number.isFinite(value)) return;
  const ms =
    Math.round(Math.min(MAX_DURATION_MS, Math.max(MIN_DURATION_MS, value * 1000)) / 100) * 100;
  emit('step', (step) => ({ ...step, durationMs: ms }), 'history.duration');
}

function setAddress(event: Event): void {
  const url = text(event).trim();
  emit(
    'step',
    (step) => {
      const { url: _previous, ...source } = step.source ?? { capturedAt: new Date().toISOString() };
      return { ...step, source: url ? { ...source, url } : source };
    },
    'history.pageAddress',
  );
}

const arrival = computed(() => {
  if (props.index === 0) return t('inspector.opensTutorial');
  return props.step?.transition === 'cut' ? t('inspector.cut') : t('inspector.fade');
});

// The selected marker's text field takes the focus, so a new marker is named at once.
watch(
  () => props.selectedMarker,
  async (id) => {
    if (!id) return;
    await nextTick();
    document.querySelector<HTMLInputElement>(`[data-marker-field="${id}"]`)?.focus();
  },
);
</script>

<template>
  <aside class="inspector" :aria-label="t('inspector.panel')">
    <template v-if="step">
      <header class="label-head">
        <span class="stop-disc tabular" aria-hidden="true">{{ index + 1 }}</span>
        <label class="visually-hidden" for="step-title">{{ t('inspector.stepTitle') }}</label>
        <input
          id="step-title"
          class="label-title"
          :value="step.title"
          :placeholder="t('inspector.stepTitlePlaceholder')"
          @input="
            emit('step', (current) => ({ ...current, title: text($event) }), 'history.renameStep')
          "
        />
      </header>
      <p class="label-meta tabular">
        {{
          t('inspector.stepMeta', {
            number: index + 1,
            count: guide.steps.length,
            duration: seconds(step.durationMs),
            arrival,
          })
        }}
      </p>
      <label class="visually-hidden" for="step-text">{{ t('inspector.stepText') }}</label>
      <textarea
        id="step-text"
        class="textarea label-text"
        :value="step.description"
        :placeholder="t('inspector.stepTextPlaceholder')"
        rows="2"
        @input="
          emit('step', (current) => ({ ...current, description: text($event) }), 'history.stepText')
        "
      ></textarea>

      <section class="label-section" aria-labelledby="timing-title">
        <h3 id="timing-title">{{ t('inspector.timing') }}</h3>
        <div class="label-row">
          <label class="field duration">
            <span>{{ t('inspector.playsFor') }}</span>
            <span class="with-unit">
              <input
                class="input tabular"
                type="number"
                :min="MIN_DURATION_MS / 1000"
                :max="MAX_DURATION_MS / 1000"
                step="0.5"
                :value="step.durationMs / 1000"
                @change="setDuration"
              />
              <span>s</span>
            </span>
          </label>
          <div v-if="index > 0" class="field">
            <span id="transition-title">{{ t('inspector.arrivesWith') }}</span>
            <div class="segmented" role="group" aria-labelledby="transition-title">
              <button
                type="button"
                :aria-pressed="step.transition !== 'cut'"
                @click="
                  emit(
                    'step',
                    (current) => ({ ...current, transition: 'fade' }),
                    'history.transition',
                  )
                "
              >
                <Icon name="fade" :size="15" />{{ t('inspector.fade') }}
              </button>
              <button
                type="button"
                :aria-pressed="step.transition === 'cut'"
                @click="
                  emit(
                    'step',
                    (current) => ({ ...current, transition: 'cut' }),
                    'history.transition',
                  )
                "
              >
                <Icon name="cut" :size="15" />{{ t('inspector.cut') }}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section class="label-section" aria-labelledby="screenshot-title">
        <h3 id="screenshot-title">{{ t('inspector.screenshot') }}</h3>
        <label class="field">
          <span>{{ t('inspector.pageAddress') }}</span>
          <input
            class="input"
            :value="step.source?.url ?? ''"
            placeholder="https://app.example.com/billing"
            @change="setAddress"
          />
        </label>
        <div class="label-actions">
          <button
            type="button"
            class="button small"
            :disabled="!canRetake"
            :title="
              !canRecord
                ? noRecording()
                : canRetake
                  ? t('inspector.retakeTitle')
                  : t('inspector.retakeNeedsPage')
            "
            @click="emit('retake')"
          >
            <Icon name="retake" :size="15" />{{ t('inspector.retake') }}
          </button>
          <button
            v-if="step.viewport && step.viewport.height < 0.999"
            type="button"
            class="button small quiet"
            :title="t('inspector.wholePageTitle')"
            @click="emit('whole-page', true)"
          >
            <Icon name="fit" :size="15" />{{ t('inspector.wholePage') }}
          </button>
        </div>
      </section>

      <section class="label-section" aria-labelledby="markers-title">
        <h3 id="markers-title">
          {{ t('inspector.markers') }}
          <span class="label-count tabular">{{ step.annotations.length }}</span>
        </h3>
        <ol v-if="step.annotations.length" class="marker-list">
          <li
            v-for="(marker, position) in step.annotations"
            :key="marker.id"
            :class="{ selected: marker.id === selectedMarker }"
            @contextmenu="emit('marker-menu', $event, marker.id)"
          >
            <button
              type="button"
              class="marker-disc tabular"
              :title="t('inspector.selectMarker', { number: firstNumber + position })"
              @click="emit('select-marker', marker.id)"
            >
              {{ firstNumber + position }}
            </button>
            <div class="marker-fields">
              <input
                class="input"
                :data-marker-field="marker.id"
                :value="marker.title"
                :placeholder="
                  position === 0 && step.cursor
                    ? t('inspector.clickMarkerPlaceholder')
                    : t('inspector.markerPlaceholder')
                "
                @focus="emit('select-marker', marker.id)"
                @input="
                  emit(
                    'step',
                    (current) => ({
                      ...current,
                      annotations: current.annotations.map((entry) =>
                        entry.id === marker.id ? { ...entry, title: text($event) } : entry,
                      ),
                    }),
                    'history.editMarker',
                  )
                "
              />
              <textarea
                v-if="marker.id === selectedMarker"
                class="textarea"
                rows="2"
                :value="marker.body"
                :placeholder="t('inspector.markerBodyPlaceholder')"
                @input="
                  emit(
                    'step',
                    (current) => ({
                      ...current,
                      annotations: current.annotations.map((entry) =>
                        entry.id === marker.id ? { ...entry, body: text($event) } : entry,
                      ),
                    }),
                    'history.editMarker',
                  )
                "
              ></textarea>
              <p v-if="position === 0 && step.cursor" class="hint">
                {{ t('inspector.cursorClicks') }}
              </p>
            </div>
            <button
              type="button"
              class="button icon small quiet"
              :title="t('inspector.deleteMarker', { number: firstNumber + position })"
              @click="emit('remove-marker', marker.id)"
            >
              <Icon name="trash" :size="15" />
            </button>
          </li>
        </ol>
        <p class="hint">{{ t('inspector.addMarkerHint') }}</p>
      </section>

      <footer class="label-foot">
        <button type="button" class="button small" @click="emit('duplicate-step')">
          <Icon name="copy" :size="15" />{{ t('inspector.duplicate') }}
        </button>
        <button type="button" class="button small quiet danger-text" @click="emit('remove-step')">
          <Icon name="trash" :size="15" />{{ t('inspector.deleteStep') }}
        </button>
      </footer>
    </template>

    <template v-else>
      <label class="visually-hidden" for="tutorial-title">{{ t('editor.tutorialTitle') }}</label>
      <input
        id="tutorial-title"
        class="label-title"
        :value="guide.title"
        :placeholder="t('inspector.tutorialTitlePlaceholder')"
        @input="
          emit(
            'guide',
            (current) => ({ ...current, title: text($event) }),
            'history.renameTutorial',
          )
        "
      />
      <p class="label-meta tabular">
        {{ t('common.steps', { count: guide.steps.length }) }} ·
        {{ runtime(total) }}
        <template v-if="pages > 1"> · {{ t('common.pages', { count: pages }) }}</template>
      </p>
      <textarea
        class="textarea label-text"
        :value="guide.description"
        :placeholder="t('inspector.tutorialDescription')"
        rows="3"
        @input="
          emit(
            'guide',
            (current) => ({ ...current, description: text($event) }),
            'history.editDescription',
          )
        "
      ></textarea>
      <section class="label-section">
        <h3>{{ t('inspector.publishing') }}</h3>
        <p v-if="publishTo" class="label-note">
          <Icon name="link" :size="15" />
          <span
            >{{ t('inspector.publishesTo') }} <b :title="publishTo">{{ publishTo }}</b
            ><template v-if="publishedAt">{{
              t('inspector.lastPublished', { date: formatDateTime(publishedAt) })
            }}</template
            >.</span
          >
        </p>
        <p v-else class="label-note">
          <Icon name="info" :size="15" />
          <span>{{ t('inspector.notLinked') }}</span>
        </p>
      </section>
      <p class="hint">{{ t('inspector.selectStepHint') }}</p>
    </template>
  </aside>
</template>
