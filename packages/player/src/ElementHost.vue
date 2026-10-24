<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef, useHost, watch } from 'vue';
import { validateGuide, type GuideDocument, type GuideStep } from '@interactive-learning/protocol';
import InteractiveGuide from '../../vue/src/InteractiveGuide.vue';
import { GuideSource } from './GuideSource';
import type { PlayerControls, PlayerEventMap } from './types';

const props = withDefaults(
  defineProps<{
    guide?: GuideDocument;
    src?: string;
    assetBaseUrl?: string;
    showInformation?: boolean;
  }>(),
  { src: '', assetBaseUrl: '', showInformation: false },
);

const host = useHost();
const source = new GuideSource();
const document = shallowRef<GuideDocument>();
const resolvedBase = ref('');
const information = ref(props.showInformation);
const error = ref('');
const loading = ref(false);
const player = ref<PlayerControls>();
let revision = 0;
let mounted = false;

function dispatch<K extends keyof PlayerEventMap>(
  name: K,
  detail: PlayerEventMap[K]['detail'],
): void {
  host?.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
}

async function load(): Promise<void> {
  const current = ++revision;
  source.cancel();
  document.value = undefined;
  error.value = '';
  loading.value = true;
  try {
    if (props.guide) {
      document.value = validateGuide(props.guide);
      resolvedBase.value = '';
    } else if (props.src) {
      const loaded = await source.load(props.src, host?.baseURI ?? window.location.href);
      if (current !== revision) return;
      document.value = loaded.guide;
      resolvedBase.value = loaded.assetBaseUrl;
    } else {
      return;
    }
    await nextTick();
    if (current === revision && document.value) dispatch('guide-load', { guide: document.value });
  } catch (cause) {
    if (current !== revision) return;
    error.value = cause instanceof Error ? cause.message : 'Ce guide ne peut pas être lu.';
    dispatch('guide-error', { message: error.value });
  } finally {
    if (current === revision) loading.value = false;
  }
}

function setInformation(visible: boolean): void {
  information.value = visible;
  if (host) (host as unknown as { showInformation: boolean }).showInformation = visible;
  dispatch('information-change', { visible });
}

function onStepChange(index: number, step: GuideStep): void {
  dispatch('step-change', { index, step });
}

watch(
  () => [props.guide, props.src],
  () => {
    if (mounted) void load();
  },
);
watch(
  () => props.showInformation,
  (visible) => {
    information.value = visible;
  },
);
onMounted(() => {
  mounted = true;
  void load();
});
onBeforeUnmount(() => {
  mounted = false;
  revision++;
  source.cancel();
});

defineExpose({
  play: () => player.value?.play(),
  pause: () => player.value?.pause(),
  seek: (elapsedMs: number) => player.value?.seek(elapsedMs),
  goToStep: (index: number) => player.value?.goToStep(index),
  seekToStep: (index: number) => player.value?.seekToStep(index),
});
</script>

<template>
  <InteractiveGuide
    v-if="document"
    ref="player"
    :guide="document"
    :asset-base-url="assetBaseUrl || resolvedBase"
    :show-information="information"
    @update:show-information="setInformation"
    @step-change="onStepChange"
  />
  <div v-else class="il-element-status" :aria-busy="loading">
    <p role="status">
      {{ error || (loading ? 'Chargement du guide…' : 'Choisissez un guide à lire.') }}
    </p>
    <button v-if="error" type="button" @click="load">Réessayer</button>
  </div>
</template>
