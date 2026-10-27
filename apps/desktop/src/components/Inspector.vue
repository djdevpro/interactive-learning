<script setup lang="ts">
import { computed, nextTick, watch } from 'vue';
import type { GuideDocument, GuideStep } from '@interactive-learning/protocol';
import Icon from './Icon.vue';
import { MAX_DURATION_MS, MIN_DURATION_MS, seconds, stepStarts } from '../editing';
import { runtime } from '../library';
import { canRecord, NO_RECORDING } from '../platform';

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
  step: [change: (step: GuideStep) => GuideStep, label: string];
  guide: [change: (guide: GuideDocument) => GuideDocument, label: string];
  'select-marker': [id: string | null];
  'remove-marker': [id: string];
  'remove-step': [];
  'duplicate-step': [];
  retake: [];
  'whole-page': [whole: boolean];
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
  emit('step', (step) => ({ ...step, durationMs: ms }), 'Change duration');
}

function setAddress(event: Event): void {
  const url = text(event).trim();
  emit(
    'step',
    (step) => {
      const { url: _previous, ...source } = step.source ?? { capturedAt: new Date().toISOString() };
      return { ...step, source: url ? { ...source, url } : source };
    },
    'Change page address',
  );
}

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
  <aside class="inspector" aria-label="Properties">
    <template v-if="step">
      <header class="label-head">
        <span class="stop-disc tabular" aria-hidden="true">{{ index + 1 }}</span>
        <label class="visually-hidden" for="step-title">Step title</label>
        <input
          id="step-title"
          class="label-title"
          :value="step.title"
          placeholder="What the viewer does here"
          @input="emit('step', (current) => ({ ...current, title: text($event) }), 'Rename step')"
        />
      </header>
      <p class="label-meta tabular">
        Step {{ index + 1 }} of {{ guide.steps.length }} · {{ seconds(step.durationMs) }} ·
        {{ index === 0 ? 'Opens the tutorial' : step.transition === 'cut' ? 'Cut' : 'Fade' }}
      </p>
      <label class="visually-hidden" for="step-text">Text of the step</label>
      <textarea
        id="step-text"
        class="textarea label-text"
        :value="step.description"
        placeholder="A sentence the viewer reads under the title"
        rows="2"
        @input="
          emit('step', (current) => ({ ...current, description: text($event) }), 'Edit step text')
        "
      ></textarea>

      <section class="label-section" aria-labelledby="timing-title">
        <h3 id="timing-title">Timing</h3>
        <div class="label-row">
          <label class="field duration">
            <span>Plays for</span>
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
            <span id="transition-title">Arrives with</span>
            <div class="segmented" role="group" aria-labelledby="transition-title">
              <button
                type="button"
                :aria-pressed="step.transition !== 'cut'"
                @click="
                  emit(
                    'step',
                    (current) => ({ ...current, transition: 'fade' }),
                    'Change transition',
                  )
                "
              >
                <Icon name="fade" :size="15" />Fade
              </button>
              <button
                type="button"
                :aria-pressed="step.transition === 'cut'"
                @click="
                  emit(
                    'step',
                    (current) => ({ ...current, transition: 'cut' }),
                    'Change transition',
                  )
                "
              >
                <Icon name="cut" :size="15" />Cut
              </button>
            </div>
          </div>
        </div>
      </section>

      <section class="label-section" aria-labelledby="screenshot-title">
        <h3 id="screenshot-title">Screenshot</h3>
        <label class="field">
          <span>Page address</span>
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
                ? NO_RECORDING
                : canRetake
                  ? 'Replace the screenshot with the page open in the Site view'
                  : 'Open the page in the Site view to retake it'
            "
            @click="emit('retake')"
          >
            <Icon name="retake" :size="15" />Retake screenshot
          </button>
          <button
            v-if="step.viewport && step.viewport.height < 0.999"
            type="button"
            class="button small quiet"
            title="Show the whole page instead of the part that was on screen"
            @click="emit('whole-page', true)"
          >
            <Icon name="fit" :size="15" />Show whole page
          </button>
        </div>
      </section>

      <section class="label-section" aria-labelledby="markers-title">
        <h3 id="markers-title">
          Markers <span class="label-count tabular">{{ step.annotations.length }}</span>
        </h3>
        <ol v-if="step.annotations.length" class="marker-list">
          <li
            v-for="(marker, position) in step.annotations"
            :key="marker.id"
            :class="{ selected: marker.id === selectedMarker }"
          >
            <button
              type="button"
              class="marker-disc tabular"
              :title="`Select marker ${firstNumber + position}`"
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
                    ? 'What the click does'
                    : 'What the viewer should notice'
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
                    'Edit marker',
                  )
                "
              />
              <textarea
                v-if="marker.id === selectedMarker"
                class="textarea"
                rows="2"
                :value="marker.body"
                placeholder="More detail, shown when the viewer opens the marker"
                @input="
                  emit(
                    'step',
                    (current) => ({
                      ...current,
                      annotations: current.annotations.map((entry) =>
                        entry.id === marker.id ? { ...entry, body: text($event) } : entry,
                      ),
                    }),
                    'Edit marker',
                  )
                "
              ></textarea>
              <p v-if="position === 0 && step.cursor" class="hint">
                The cursor clicks this marker.
              </p>
            </div>
            <button
              type="button"
              class="button icon small quiet"
              :title="`Delete marker ${firstNumber + position}`"
              @click="emit('remove-marker', marker.id)"
            >
              <Icon name="trash" :size="15" />
            </button>
          </li>
        </ol>
        <p class="hint">Click the screen to add a marker.</p>
      </section>

      <footer class="label-foot">
        <button type="button" class="button small" @click="emit('duplicate-step')">
          <Icon name="copy" :size="15" />Duplicate
        </button>
        <button type="button" class="button small quiet danger-text" @click="emit('remove-step')">
          <Icon name="trash" :size="15" />Delete step
        </button>
      </footer>
    </template>

    <template v-else>
      <label class="visually-hidden" for="tutorial-title">Tutorial title</label>
      <input
        id="tutorial-title"
        class="label-title"
        :value="guide.title"
        placeholder="Name of the tutorial"
        @input="
          emit('guide', (current) => ({ ...current, title: text($event) }), 'Rename tutorial')
        "
      />
      <p class="label-meta tabular">
        {{ guide.steps.length === 1 ? '1 step' : `${guide.steps.length} steps` }} ·
        {{ runtime(total) }}
        <template v-if="pages > 1"> · {{ pages }} pages</template>
      </p>
      <textarea
        class="textarea label-text"
        :value="guide.description"
        placeholder="What this tutorial teaches"
        rows="3"
        @input="
          emit(
            'guide',
            (current) => ({ ...current, description: text($event) }),
            'Edit description',
          )
        "
      ></textarea>
      <section class="label-section">
        <h3>Publishing</h3>
        <p v-if="publishTo" class="label-note">
          <Icon name="link" :size="15" />
          <span
            >Publishes to <b :title="publishTo">{{ publishTo }}</b
            ><template v-if="publishedAt"
              >, last on {{ new Date(publishedAt).toLocaleString('en-GB') }}</template
            >.</span
          >
        </p>
        <p v-else class="label-note">
          <Icon name="info" :size="15" />
          <span
            >Link the site to a project folder in the library to publish there. Export ZIP works
            anytime.</span
          >
        </p>
      </section>
      <p class="hint">Select a step on the timeline to edit it.</p>
    </template>
  </aside>
</template>
