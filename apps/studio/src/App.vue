<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import type { InteractiveLearningElement } from '@interactive-learning/player';
import type { GuideDocument } from '@interactive-learning/protocol';
import {
  Icon,
  StepEditor,
  StepList,
  applyStepDraft,
  markerNumber,
  withoutUnusedAssets,
  type StepDraft,
} from '@interactive-learning/editor';
import { imageUrl, loadGuide, saveGuide, uploadImage, StudioError, type LoadedGuide } from './api';

const guide = shallowRef<GuideDocument>();
const version = ref('');
const file = ref('');
const selectedId = ref<string | null>(null);
// Remounts the editor after a save or a cancel, so it starts again from the stored step.
const revision = ref(0);
const title = ref('');
const description = ref('');
const busy = ref(false);
const loading = ref(true);
const error = ref('');
const conflict = ref(false);
const flash = ref('');
const editor = ref<InstanceType<typeof StepEditor> | null>(null);
const player = ref<InteractiveLearningElement | null>(null);
let flashTimer: ReturnType<typeof setTimeout> | undefined;

const selectedIndex = computed(
  () => guide.value?.steps.findIndex((step) => step.id === selectedId.value) ?? -1,
);
const selectedStep = computed(() => guide.value?.steps[selectedIndex.value]);
const status = computed(() =>
  conflict.value
    ? 'Changed on disk'
    : busy.value
      ? 'Saving…'
      : loading.value
        ? 'Opening…'
        : 'Saved to disk',
);

function imageOf(assetId: string): string {
  return imageUrl(guide.value?.assets.find((asset) => asset.id === assetId));
}

function showFlash(message: string): void {
  flash.value = message;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => (flash.value = ''), 2200);
}

function apply(loaded: LoadedGuide): void {
  guide.value = loaded.guide;
  version.value = loaded.version;
  file.value = loaded.file;
  title.value = loaded.guide.title;
  description.value = loaded.guide.description;
  if (!loaded.guide.steps.some((step) => step.id === selectedId.value))
    selectedId.value = loaded.guide.steps[0]?.id ?? null;
  revision.value += 1;
}

async function reload(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    apply(await loadGuide());
    conflict.value = false;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'The guide could not be opened.';
  } finally {
    loading.value = false;
  }
}

/** Writes the whole guide. The server refuses it when the file changed since it was read. */
async function persist(next: GuideDocument, message: string): Promise<boolean> {
  busy.value = true;
  error.value = '';
  try {
    apply(await saveGuide(next, version.value));
    showFlash(message);
    return true;
  } catch (cause) {
    if (cause instanceof StudioError && cause.code === 'GUIDE_CHANGED') conflict.value = true;
    error.value = cause instanceof Error ? cause.message : 'The guide could not be saved.';
    return false;
  } finally {
    busy.value = false;
  }
}

async function saveStep(draft: StepDraft): Promise<boolean> {
  const current = guide.value;
  const stepId = selectedId.value;
  if (!current || !stepId) return false;
  return persist(
    {
      ...current,
      steps: current.steps.map((step) => (step.id === stepId ? applyStepDraft(step, draft) : step)),
    },
    'Step saved',
  );
}

/** Saves the open step before leaving it. False keeps it open: its address is invalid. */
async function flush(): Promise<boolean> {
  const draft = editor.value?.pending();
  if (draft === false) return false;
  return draft ? saveStep(draft) : true;
}

async function select(stepId: string): Promise<void> {
  if (stepId !== selectedId.value && (await flush())) selectedId.value = stepId;
}

async function go(offset: number, draft: StepDraft | null): Promise<void> {
  if (draft && !(await saveStep(draft))) return;
  const next = guide.value?.steps[selectedIndex.value + offset];
  if (next) selectedId.value = next.id;
}

async function removeStep(): Promise<void> {
  const current = guide.value;
  const index = selectedIndex.value;
  if (!current || index < 0) return;
  const steps = current.steps.filter((_, position) => position !== index);
  const neighbour = steps[Math.min(index, steps.length - 1)];
  if (await persist(withoutUnusedAssets({ ...current, steps }), 'Step deleted'))
    selectedId.value = neighbour?.id ?? null;
}

/** The new image takes the place of the old one at once; unsaved edits stay in the editor. */
async function replaceImage(image: File): Promise<void> {
  const current = guide.value;
  const stepId = selectedId.value;
  if (!current || !stepId) return;
  busy.value = true;
  error.value = '';
  let asset;
  try {
    asset = (await uploadImage(image)).asset;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'The image could not be added.';
    return;
  } finally {
    busy.value = false;
  }
  const known = current.assets.find((entry) => entry.src === asset.src);
  const assets = known ? current.assets : [...current.assets, asset];
  const assetId = known?.id ?? asset.id;
  const pending = editor.value?.pending();
  const saved = await persist(
    withoutUnusedAssets({
      ...current,
      assets,
      steps: current.steps.map((step) => (step.id === stepId ? { ...step, assetId } : step)),
    }),
    'Image replaced',
  );
  // The save remounted the editor; a draft that was open is saved with the new image.
  if (saved && pending) await saveStep(pending);
}

async function saveGuideDetails(): Promise<void> {
  const current = guide.value;
  if (!current) return;
  const nextTitle = title.value.trim() || current.title;
  if (nextTitle === current.title && description.value === current.description) return;
  await persist({ ...current, title: nextTitle, description: description.value }, 'Guide saved');
}

// The preview plays what is saved, from the open step.
watch([guide, player], ([value, element]) => {
  if (value && element) element.guide = value;
});
watch(selectedIndex, (index) => {
  if (index >= 0) player.value?.seekToStep(index);
});
const onGuideLoad = () => {
  if (selectedIndex.value >= 0) player.value?.seekToStep(selectedIndex.value);
};

const onKeydown = (event: KeyboardEvent) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    void flush();
  }
};
const onBeforeUnload = (event: BeforeUnloadEvent) => {
  if (editor.value?.pending()) event.preventDefault();
};

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('beforeunload', onBeforeUnload);
  player.value?.addEventListener('guide-load', onGuideLoad);
  void reload();
});
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('beforeunload', onBeforeUnload);
  player.value?.removeEventListener('guide-load', onGuideLoad);
});
</script>

<template>
  <div class="studio">
    <header class="studio-bar">
      <span class="studio-mark" aria-hidden="true"><span></span><span></span><span></span></span>
      <strong>Interactive Learning</strong>
      <span class="studio-badge">Studio</span>
      <code class="studio-file" :title="file">{{ file }}</code>
      <span class="studio-status" :data-state="conflict ? 'conflict' : busy ? 'busy' : 'saved'">
        {{ status }}
      </span>
      <button v-if="conflict" class="secondary small" type="button" @click="reload">
        Reload from disk
      </button>
    </header>

    <div class="studio-body">
      <aside class="studio-steps" aria-label="Guide">
        <div class="field">
          <label for="guide-title">Guide title</label>
          <input
            id="guide-title"
            v-model="title"
            maxlength="500"
            autocomplete="off"
            :disabled="!guide"
            @change="saveGuideDetails"
          />
        </div>
        <div class="field">
          <label for="guide-description">Description</label>
          <textarea
            id="guide-description"
            v-model="description"
            rows="2"
            :disabled="!guide"
            @change="saveGuideDetails"
          ></textarea>
        </div>
        <div class="label-row">
          <span class="label">Steps</span>
          <span v-if="guide?.steps.length" class="count">{{ guide.steps.length }}</span>
        </div>
        <StepList
          v-if="guide?.steps.length"
          :steps="guide.steps"
          :image-of="imageOf"
          :selected-id="selectedId"
          @select="select"
        />
        <p v-else-if="guide" class="hint">
          This guide has no steps yet. Add captures with the command line or the extension.
        </p>
      </aside>

      <section class="studio-editor" aria-label="Step">
        <StepEditor
          v-if="guide && selectedStep"
          ref="editor"
          :key="`${selectedStep.id}:${revision}`"
          :step="selectedStep"
          :image="imageOf(selectedStep.assetId)"
          :number="selectedIndex + 1"
          :total="guide.steps.length"
          :marker-number="markerNumber(guide.steps, selectedIndex)"
          replace="upload"
          :busy="busy"
          @save="saveStep"
          @cancel="revision += 1"
          @go="go"
          @remove="removeStep"
          @replace-image="replaceImage"
        />
        <div v-else-if="!loading" class="empty studio-empty">
          <span class="empty-icon"><Icon name="image" /></span>
          <h1>Nothing to edit yet</h1>
          <p>Open a guide with steps to place markers and write their texts.</p>
        </div>
      </section>

      <section class="studio-preview" aria-label="Preview">
        <div class="label-row">
          <span class="label">Preview</span>
          <span class="hint">What is saved, from the open step</span>
        </div>
        <interactive-learning ref="player" asset-base-url="/guide/" show-address />
        <p class="hint studio-shortcut">
          <kbd>Ctrl</kbd> <kbd>S</kbd> saves the open step. Changes are written to
          <code>{{ file || 'guide.json' }}</code> and its <code>assets</code> folder.
        </p>
      </section>
    </div>

    <div class="toasts" aria-live="polite">
      <p v-if="error" class="toast error" role="alert">
        <span>{{ error }}</span>
        <button class="ghost square small" type="button" aria-label="Dismiss" @click="error = ''">
          <Icon name="close" :size="14" />
        </button>
      </p>
      <p v-else-if="flash" class="toast">{{ flash }}</p>
    </div>
  </div>
</template>
