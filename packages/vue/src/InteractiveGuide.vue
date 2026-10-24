<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, useId, watch } from 'vue';
import type { CSSProperties } from 'vue';
import type { GuideDocument, GuideStep } from '@interactive-learning/protocol';
import GuideIcon from './GuideIcon.vue';
import { resolveAssetSource } from './assets';
import { TimelineController } from './TimelineController';
import { AnnotationLayout } from './AnnotationLayout';

const props = withDefaults(
  defineProps<{
    guide: GuideDocument;
    assetBaseUrl?: string;
  }>(),
  { assetBaseUrl: '' },
);

const emit = defineEmits<{
  'step-change': [index: number, step: GuideStep];
}>();
const showInformation = defineModel<boolean>('showInformation', { default: false });

const instanceId = useId();
const titleId = `${instanceId}-title`;
const helpId = `${instanceId}-help`;
const annotationId = `${instanceId}-annotation`;
const annotationTitleId = `${instanceId}-annotation-title`;
const informationId = `${instanceId}-information`;
let timeline = new TimelineController([]);
const state = shallowRef(timeline.snapshot);
const hasStarted = ref(false);
const reducedMotion = ref(false);
const activeAnnotationId = ref<string | null>(null);
const imageStatus = ref<'loading' | 'ready' | 'error'>('loading');
const imageRequestId = ref(0);
const imageElement = ref<HTMLImageElement | null>(null);
const playbackRequested = ref(false);
const playbackRate = ref(1);
const playbackRateLabel = computed(() => playbackRate.value.toLocaleString('fr-FR'));
const playbackError = ref('');
const rootElement = ref<HTMLElement | null>(null);
const fullscreenAvailable = ref(false);
const isFullscreen = ref(false);
const fullscreenError = ref('');
const canvasElement = ref<HTMLElement | null>(null);
const playerElement = ref<HTMLElement | null>(null);
const tooltipElement = ref<HTMLElement | null>(null);
const annotationPosition = shallowRef<CSSProperties>({ visibility: 'hidden' });
const viewport = shallowRef({ width: 0, height: 0, controlsHeight: 48 });
let annotationTrigger: HTMLButtonElement | undefined;
let animationFrame: number | undefined;
let previousFrameTime: number | undefined;
let motionPreference: MediaQueryList | undefined;
let resizeObserver: ResizeObserver | undefined;
let lastGuideId = '';

const currentStep = computed(() => props.guide.steps[state.value.stepIndex]);
const currentAsset = computed(() =>
  props.guide.assets.find((asset) => asset.id === currentStep.value?.assetId),
);
const imageSource = computed(() =>
  resolveAssetSource(currentAsset.value?.src ?? '', props.assetBaseUrl),
);
const activeAnnotation = computed(() =>
  currentStep.value?.annotations.find((annotation) => annotation.id === activeAnnotationId.value),
);
const annotationOffsets = computed(() => {
  let number = 1;
  return props.guide.steps.map((step) => {
    const start = number;
    number += step.annotations.length;
    return start;
  });
});
const currentMarkers = computed(() =>
  (currentStep.value?.annotations ?? []).map((annotation, index) => ({
    annotation,
    number: (annotationOffsets.value[state.value.stepIndex] ?? 1) + index,
    position: AnnotationLayout.marker(annotation, viewport.value),
  })),
);
const informationLabel = computed(() =>
  showInformation.value ? 'Masquer les informations' : 'Afficher les informations',
);
const hasSteps = computed(() => state.value.stepIndex >= 0 && !playbackError.value);
const showStartScreen = computed(
  () => (!hasStarted.value || state.value.ended) && imageStatus.value !== 'error',
);
const aspectRatio = computed(() =>
  currentAsset.value ? `${currentAsset.value.width} / ${currentAsset.value.height}` : '16 / 9',
);
const aspectRatioNumber = computed(() =>
  currentAsset.value ? currentAsset.value.width / currentAsset.value.height : 16 / 9,
);
const fullscreenLabel = computed(() =>
  isFullscreen.value ? 'Quitter le plein écran' : 'Agrandir le lecteur',
);
const playLabel = computed(() =>
  playbackRequested.value
    ? 'Mettre en pause'
    : state.value.ended
      ? 'Revoir le guide'
      : 'Lire le guide',
);
const progressStyle = computed(() => ({ '--il-progress': `${state.value.progress * 100}%` }));

const cursor = computed(() => {
  const target = currentStep.value?.cursor;
  if (!target) return null;

  const from = target.from ?? { x: target.x, y: target.y };
  const moveDuration = Math.min(900, (currentStep.value?.durationMs ?? 0) * 0.4);
  const fraction =
    reducedMotion.value || moveDuration === 0
      ? 1
      : Math.min(1, state.value.stepElapsedMs / moveDuration);
  const eased = fraction * fraction * (3 - 2 * fraction);
  const pulse = (state.value.stepElapsedMs - moveDuration) / 500;

  return {
    x: from.x + (target.x - from.x) * eased,
    y: from.y + (target.y - from.y) * eased,
    showPulse: !reducedMotion.value && target.action === 'click' && pulse >= 0 && pulse <= 1,
    pulseOpacity: Math.max(0, 1 - pulse),
    pulseScale: 0.5 + Math.max(0, pulse) * 1.8,
  };
});

watch(
  () => [props.guide.id, props.guide.steps.map((step) => [step.id, step.durationMs])],
  () => {
    const sameGuide = props.guide.id === lastGuideId;
    const elapsed = sameGuide ? state.value.elapsedMs : 0;
    stopAnimation();
    playbackRequested.value = false;
    playbackError.value = '';
    try {
      timeline = new TimelineController(props.guide.steps);
      timeline.seek(elapsed);
    } catch (error) {
      timeline = new TimelineController([]);
      playbackError.value =
        error instanceof Error ? error.message : 'Ce guide ne peut pas être lu.';
    }
    state.value = timeline.snapshot;
    if (!sameGuide) hasStarted.value = false;
    activeAnnotationId.value = null;
    annotationTrigger = undefined;
    lastGuideId = props.guide.id;
  },
  { immediate: true, deep: true },
);

watch(imageSource, prepareImage, { immediate: true, flush: 'sync' });
watch(
  [activeAnnotation, aspectRatio],
  async () => {
    annotationPosition.value = { visibility: 'hidden' };
    await nextTick();
    updateAnnotationPosition();
  },
  { deep: true },
);
watch(canvasElement, (element, previous) => {
  if (previous) resizeObserver?.unobserve(previous);
  if (element) resizeObserver?.observe(element);
});
watch(playerElement, (element, previous) => {
  if (previous) resizeObserver?.unobserve(previous);
  if (element) resizeObserver?.observe(element);
});
watch(
  () => state.value.stepIndex,
  (index) => {
    activeAnnotationId.value = null;
    annotationTrigger = undefined;
    const step = props.guide.steps[index];
    if (step) emit('step-change', index, step);
  },
);

function updateLayout(): void {
  if (canvasElement.value) {
    viewport.value = {
      width: canvasElement.value.clientWidth,
      height: canvasElement.value.clientHeight,
      controlsHeight: playerElement.value?.clientHeight ?? 48,
    };
  }
  updateAnnotationPosition();
}

function updateAnnotationPosition(): void {
  const canvas = canvasElement.value;
  const tooltip = tooltipElement.value;
  const marker = currentMarkers.value.find(
    ({ annotation }) => annotation.id === activeAnnotationId.value,
  );
  if (!canvas || !tooltip || !marker) return;
  const position = AnnotationLayout.tooltip(
    marker.position,
    viewport.value,
    { width: Math.min(280, Math.max(0, canvas.clientWidth - 24)), height: tooltip.scrollHeight },
    currentMarkers.value.map(({ position }) => position),
  );

  annotationPosition.value = {
    visibility: 'visible',
    left: `${position.left}px`,
    top: `${position.top}px`,
    maxHeight: `${position.maxHeight}px`,
  };
}

function syncState(): void {
  state.value = timeline.snapshot;
}

function prepareImage(): void {
  imageStatus.value = imageSource.value ? 'loading' : 'error';
  imageRequestId.value += 1;
  timeline.pause();
  stopAnimation();
  syncState();
  if (!imageSource.value) playbackRequested.value = false;
}

function isCurrentImage(event: Event): boolean {
  const image = event.currentTarget;
  return (
    image === imageElement.value &&
    image instanceof HTMLImageElement &&
    image.getAttribute('src') === imageSource.value
  );
}

function onImageLoad(event: Event): void {
  if (!isCurrentImage(event)) return;
  imageStatus.value = 'ready';
  resumeWhenReady();
}

function onImageError(event: Event): void {
  if (!isCurrentImage(event)) return;
  pause();
  imageStatus.value = 'error';
}

function retryImage(): void {
  prepareImage();
}

function stopAnimation(): void {
  if (animationFrame !== undefined && typeof cancelAnimationFrame !== 'undefined') {
    cancelAnimationFrame(animationFrame);
  }
  animationFrame = undefined;
  previousFrameTime = undefined;
}

function tick(timestamp: number): void {
  animationFrame = undefined;
  if (!state.value.playing) return;
  if (previousFrameTime !== undefined) {
    // Never skip an unseen screenshot after a slow frame. A new source pauses below
    // through the synchronous image watcher until its load event arrives.
    const remaining = (currentStep.value?.durationMs ?? 0) - state.value.stepElapsedMs;
    timeline.advance(
      Math.min(
        Math.max(0, remaining),
        Math.max(0, timestamp - previousFrameTime) * playbackRate.value,
      ),
    );
  }
  previousFrameTime = timestamp;
  syncState();
  if (state.value.ended) playbackRequested.value = false;
  if (state.value.playing) animationFrame = requestAnimationFrame(tick);
  else previousFrameTime = undefined;
}

function resumeWhenReady(): void {
  if (!playbackRequested.value || imageStatus.value !== 'ready' || state.value.ended) return;
  stopAnimation();
  timeline.play();
  syncState();
  if (typeof requestAnimationFrame !== 'undefined') animationFrame = requestAnimationFrame(tick);
}

function play(): void {
  if (!hasSteps.value || imageStatus.value === 'error') return;
  hasStarted.value = true;
  activeAnnotationId.value = null;
  playbackRequested.value = true;
  if (state.value.ended) {
    timeline.seek(0);
    syncState();
  }
  resumeWhenReady();
}

function pause(): void {
  playbackRequested.value = false;
  timeline.pause();
  stopAnimation();
  syncState();
}

function togglePlayback(): void {
  if (playbackRequested.value) pause();
  else play();
}

function cyclePlaybackRate(): void {
  playbackRate.value = playbackRate.value === 1 ? 1.5 : playbackRate.value === 1.5 ? 2 : 1;
  previousFrameTime = undefined;
}

function seek(elapsedMs: number): void {
  hasStarted.value = true;
  activeAnnotationId.value = null;
  previousFrameTime = undefined;
  timeline.seek(elapsedMs);
  syncState();
  if (state.value.ended) playbackRequested.value = false;
  resumeWhenReady();
  if (!state.value.playing) stopAnimation();
}

function goToStep(index: number): void {
  hasStarted.value = true;
  activeAnnotationId.value = null;
  previousFrameTime = undefined;
  timeline.goToStep(index);
  syncState();
  resumeWhenReady();
}

function seekToStep(index: number): void {
  pause();
  goToStep(index);
}

function onSeek(event: Event): void {
  seek(Number((event.target as HTMLInputElement).value));
}

function toggleAnnotation(id: string, event: MouseEvent): void {
  pause();
  if (activeAnnotationId.value === id) {
    closeAnnotation();
  } else {
    annotationTrigger =
      event.currentTarget instanceof HTMLButtonElement ? event.currentTarget : undefined;
    activeAnnotationId.value = id;
  }
}

function closeAnnotation(restoreFocus = false): void {
  activeAnnotationId.value = null;
  if (restoreFocus) annotationTrigger?.focus({ preventScroll: true });
  annotationTrigger = undefined;
}

function toggleInformation(): void {
  pause();
  showInformation.value = !showInformation.value;
  void nextTick(updateLayout);
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    if (activeAnnotationId.value !== null) {
      event.preventDefault();
      closeAnnotation(true);
    } else if (isFullscreen.value) {
      event.preventDefault();
      void toggleFullscreen();
    }
    return;
  }
  const target = event.target;
  if (
    target instanceof HTMLElement &&
    target.closest('button, input, select, textarea, a, [contenteditable="true"]')
  )
    return;
  if (!hasSteps.value) return;

  switch (event.key) {
    case ' ':
    case 'k':
      event.preventDefault();
      togglePlayback();
      break;
    case 'ArrowLeft':
      event.preventDefault();
      goToStep(Math.max(0, state.value.stepIndex - 1));
      break;
    case 'ArrowRight':
      event.preventDefault();
      goToStep(Math.min(props.guide.steps.length - 1, state.value.stepIndex + 1));
      break;
    case 'Home':
      event.preventDefault();
      seek(0);
      break;
    case 'End':
      event.preventDefault();
      seek(state.value.totalMs);
      break;
  }
}

function formatTime(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1_000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function onMotionPreference(event: MediaQueryListEvent): void {
  reducedMotion.value = event.matches;
}

function onVisibilityChange(): void {
  if (document.hidden && playbackRequested.value) pause();
}

function ownsFullscreen(): boolean {
  const root = rootElement.value;
  if (!root) return false;
  const tree = root.getRootNode();
  // A document reports the shadow host, while the shadow root reports this player.
  return 'fullscreenElement' in tree && tree.fullscreenElement === root;
}

function onFullscreenChange(): void {
  isFullscreen.value = ownsFullscreen();
  fullscreenError.value = '';
  void nextTick(updateLayout);
}

async function toggleFullscreen(): Promise<void> {
  fullscreenError.value = '';
  try {
    if (ownsFullscreen()) {
      await document.exitFullscreen();
    } else {
      await rootElement.value?.requestFullscreen();
    }
  } catch {
    fullscreenError.value = isFullscreen.value
      ? 'La sortie du plein écran a échoué. Utilisez la touche Échap.'
      : 'Le navigateur n’a pas autorisé le plein écran. Vous pouvez continuer la lecture ici.';
  }
}

onMounted(() => {
  motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  reducedMotion.value = motionPreference.matches;
  motionPreference.addEventListener('change', onMotionPreference);
  resizeObserver = new ResizeObserver(updateLayout);
  if (canvasElement.value) resizeObserver.observe(canvasElement.value);
  if (playerElement.value) resizeObserver.observe(playerElement.value);
  updateLayout();
  fullscreenAvailable.value =
    document.fullscreenEnabled && typeof rootElement.value?.requestFullscreen === 'function';
  document.addEventListener('visibilitychange', onVisibilityChange);
  document.addEventListener('fullscreenchange', onFullscreenChange);
});

onBeforeUnmount(() => {
  stopAnimation();
  motionPreference?.removeEventListener('change', onMotionPreference);
  resizeObserver?.disconnect();
  document.removeEventListener('visibilitychange', onVisibilityChange);
  document.removeEventListener('fullscreenchange', onFullscreenChange);
  if (ownsFullscreen()) {
    void document.exitFullscreen().catch(() => undefined);
  }
});

defineExpose({ play, pause, seek, goToStep, seekToStep });
</script>

<template>
  <section
    ref="rootElement"
    class="il-guide"
    :class="{ 'il-guide--reduced-motion': reducedMotion }"
    :aria-label="guide.title"
    :aria-describedby="helpId"
    tabindex="0"
    @keydown="onKeydown"
  >
    <header v-show="showInformation" :id="titleId" class="il-guide__heading">
      <div class="il-guide__heading-copy">
        <h2 class="il-guide__title">{{ guide.title }}</h2>
        <p v-if="guide.description" class="il-guide__description">{{ guide.description }}</p>
      </div>
      <span class="il-guide__count"
        >{{ guide.steps.length }} {{ guide.steps.length > 1 ? 'étapes' : 'étape' }}</span
      >
    </header>

    <div v-if="!hasSteps" class="il-guide__empty" role="status">
      <span class="il-guide__empty-symbol"><GuideIcon name="image" :size="30" /></span>
      <h3>{{ playbackError ? 'Lecture indisponible' : 'Le guide prend forme' }}</h3>
      <p>
        {{
          playbackError ||
          'Ajoutez une première capture pour découvrir votre parcours, étape par étape.'
        }}
      </p>
    </div>

    <template v-else>
      <div class="il-guide__screen">
        <div
          ref="canvasElement"
          class="il-guide__canvas"
          :style="{ aspectRatio, '--il-aspect-ratio': aspectRatioNumber }"
          @click.self="activeAnnotationId = null"
        >
          <img
            v-if="imageSource && imageStatus !== 'error'"
            v-show="imageStatus === 'ready'"
            :key="imageRequestId"
            ref="imageElement"
            class="il-guide__image"
            :src="imageSource"
            :alt="`Capture : ${currentStep?.title ?? ''}`"
            :width="currentAsset?.width"
            :height="currentAsset?.height"
            draggable="false"
            @load="onImageLoad"
            @error="onImageError"
            @click="activeAnnotationId = null"
          />
          <div v-if="imageStatus !== 'ready'" class="il-guide__image-fallback" role="status">
            <GuideIcon name="image" :size="36" />
            <span>{{
              imageStatus === 'loading'
                ? 'Chargement de la capture…'
                : 'Cette capture n’est pas disponible.'
            }}</span>
            <button
              v-if="imageStatus === 'error' && imageSource"
              class="il-guide__retry"
              type="button"
              @click="retryImage"
            >
              Réessayer la capture
            </button>
          </div>

          <template v-if="!showStartScreen && imageStatus === 'ready'">
            <div
              v-if="cursor"
              class="il-guide__cursor"
              :style="{ left: `${cursor.x * 100}%`, top: `${cursor.y * 100}%` }"
              aria-hidden="true"
            >
              <span
                v-if="cursor.showPulse"
                class="il-guide__click-pulse"
                :style="{
                  opacity: cursor.pulseOpacity,
                  transform: `translate(-50%, -50%) scale(${cursor.pulseScale})`,
                }"
              />
              <svg width="22" height="27" viewBox="0 0 30 36" fill="none">
                <path
                  d="M3 2.5 25 20l-10 .8 4.6 9-5 2.6-4.5-9L3 30V2.5Z"
                  fill="currentColor"
                  stroke="white"
                  stroke-width="2.2"
                  stroke-linejoin="round"
                />
              </svg>
            </div>

            <svg
              class="il-guide__anchors"
              viewBox="0 0 1000 1000"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <template v-for="marker in currentMarkers" :key="marker.annotation.id">
                <line
                  v-if="marker.position.displaced"
                  :x1="marker.annotation.x * 1000"
                  :y1="marker.annotation.y * 1000"
                  :x2="marker.position.x * 1000"
                  :y2="marker.position.y * 1000"
                />
              </template>
            </svg>
            <button
              v-for="{ annotation, number, position } in currentMarkers"
              :key="annotation.id"
              class="il-guide__annotation"
              :class="{ 'il-guide__annotation--active': activeAnnotationId === annotation.id }"
              type="button"
              :style="{ left: `${position.x * 100}%`, top: `${position.y * 100}%` }"
              :aria-label="`Repère ${number} : ${annotation.title}`"
              aria-haspopup="dialog"
              :aria-expanded="activeAnnotationId === annotation.id"
              :aria-controls="activeAnnotationId === annotation.id ? annotationId : undefined"
              @pointerdown.stop="pause"
              @focus="pause"
              @click.stop="toggleAnnotation(annotation.id, $event)"
            >
              <span>{{ number }}</span>
            </button>

            <div
              v-if="activeAnnotation"
              :id="annotationId"
              ref="tooltipElement"
              class="il-guide__tooltip"
              :style="annotationPosition"
              role="dialog"
              :aria-labelledby="annotationTitleId"
            >
              <strong :id="annotationTitleId">{{ activeAnnotation.title }}</strong>
              <button
                class="il-guide__tooltip-close"
                type="button"
                aria-label="Fermer le repère"
                @click="closeAnnotation(true)"
              >
                <GuideIcon name="close" :size="14" />
              </button>
              <p v-if="activeAnnotation.body">{{ activeAnnotation.body }}</p>
              <span class="il-guide__tooltip-hint">Échap pour fermer</span>
            </div>
          </template>

          <div v-if="showStartScreen" class="il-guide__cover">
            <button
              class="il-guide__start"
              type="button"
              :aria-label="playLabel"
              data-testid="guide-start"
              @click="play"
            >
              <GuideIcon :name="state.ended ? 'replay' : 'play'" :size="26" />
            </button>
            <span v-if="showInformation" class="il-guide__cover-meta"
              >{{ state.ended ? 'Revoir le guide' : 'Lire le guide' }} ·
              {{ formatTime(state.totalMs) }}</span
            >
          </div>
          <div ref="playerElement" class="il-guide__player">
            <div class="il-guide__controls">
              <div class="il-guide__transport">
                <button
                  class="il-guide__control il-guide__control--primary"
                  type="button"
                  :aria-label="playLabel"
                  :title="playLabel"
                  :disabled="imageStatus === 'error'"
                  data-testid="guide-play"
                  @click="togglePlayback"
                >
                  <GuideIcon
                    :name="playbackRequested ? 'pause' : state.ended ? 'replay' : 'play'"
                    :size="17"
                  />
                </button>
                <button
                  class="il-guide__control il-guide__control--step"
                  type="button"
                  aria-label="Étape précédente"
                  title="Étape précédente"
                  :disabled="state.stepIndex <= 0"
                  data-testid="guide-previous"
                  @click="goToStep(state.stepIndex - 1)"
                >
                  <GuideIcon name="previous" :size="15" />
                </button>
                <button
                  class="il-guide__control il-guide__control--step"
                  type="button"
                  aria-label="Étape suivante"
                  title="Étape suivante"
                  :disabled="state.stepIndex >= guide.steps.length - 1"
                  data-testid="guide-next"
                  @click="goToStep(state.stepIndex + 1)"
                >
                  <GuideIcon name="next" :size="15" />
                </button>
              </div>
              <div class="il-guide__timeline-row">
                <input
                  class="il-guide__timeline"
                  :style="progressStyle"
                  type="range"
                  min="0"
                  :max="state.totalMs"
                  :step="Math.min(100, state.totalMs)"
                  :value="state.elapsedMs"
                  aria-label="Position dans le guide"
                  :aria-valuetext="`${formatTime(state.elapsedMs)} sur ${formatTime(state.totalMs)} — étape ${state.stepIndex + 1}`"
                  data-testid="guide-timeline"
                  @input="onSeek"
                />
              </div>
              <span class="il-guide__time"
                ><span>{{ formatTime(state.elapsedMs) }}</span
                ><span class="il-guide__time-separator">/</span
                >{{ formatTime(state.totalMs) }}</span
              >
              <div class="il-guide__view-controls">
                <button
                  class="il-guide__control"
                  type="button"
                  :aria-label="informationLabel"
                  :title="informationLabel"
                  :aria-pressed="showInformation"
                  :aria-controls="`${titleId} ${informationId}`"
                  @click="toggleInformation"
                >
                  <GuideIcon name="info" :size="17" />
                </button>
                <button
                  class="il-guide__control il-guide__speed"
                  type="button"
                  :aria-label="`Vitesse de lecture : ${playbackRateLabel} fois. Changer la vitesse`"
                  title="Changer la vitesse"
                  @click="cyclePlaybackRate"
                >
                  {{ playbackRateLabel }}×
                </button>
                <button
                  v-if="fullscreenAvailable"
                  class="il-guide__control"
                  type="button"
                  :aria-label="fullscreenLabel"
                  :title="fullscreenLabel"
                  :aria-pressed="isFullscreen"
                  @click="toggleFullscreen"
                >
                  <GuideIcon :name="isFullscreen ? 'contract' : 'expand'" :size="16" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <p v-if="fullscreenError" class="il-guide__fullscreen-error" role="alert">
        {{ fullscreenError }}
      </p>

      <div v-show="showInformation" :id="informationId" class="il-guide__information">
        <div v-if="currentStep" class="il-guide__step" aria-live="polite" aria-atomic="true">
          <div class="il-guide__step-copy">
            <h3>
              <span class="il-guide__step-number"
                >{{ state.stepIndex + 1 }} / {{ guide.steps.length }}</span
              >{{ currentStep.title }}
            </h3>
            <p v-if="currentStep.description">{{ currentStep.description }}</p>
          </div>
          <span v-if="state.ended" class="il-guide__complete"
            ><GuideIcon name="check" :size="15" /> Terminé</span
          >
        </div>

        <details v-if="currentStep?.annotations.length" class="il-guide__details">
          <summary>
            Voir les repères <span>{{ currentStep.annotations.length }}</span>
          </summary>
          <ol :start="annotationOffsets[state.stepIndex] ?? 1">
            <li v-for="annotation in currentStep.annotations" :key="annotation.id">
              <strong>{{ annotation.title }}</strong>
              <p v-if="annotation.body">{{ annotation.body }}</p>
            </li>
          </ol>
        </details>
      </div>
    </template>

    <p :id="helpId" class="il-guide__sr-only">
      Sur le lecteur : Espace pour lire ou mettre en pause, flèches gauche et droite pour passer à
      l’étape précédente ou suivante. Cliquez sur un repère pour le lire ; la lecture se met en
      pause. Au clavier, Entrée ou Espace ouvre le repère focalisé. Échap ferme un repère ouvert.
      Sans repère ouvert, Échap quitte le plein écran.
    </p>
  </section>
</template>
