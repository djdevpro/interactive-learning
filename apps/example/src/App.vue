<script setup lang="ts">
import { onMounted, shallowRef, ref } from 'vue';
import { InteractiveGuide } from '@interactive-learning/vue';
import { validateGuide, type GuideDocument } from '@interactive-learning/protocol';
interface Course {
  id: string;
  title: string;
  description: string;
  steps: number;
  durationMs: number;
  src: string;
}

const params = new URLSearchParams(location.search);
const isSample = params.has('sample');
const requestedCourseId = params.get('cours');
const courseIds = new Set(['formation', 'suivi-apprenti', 'dossier-facture', 'qualiopi']);
const guide = shallowRef<GuideDocument>();
const assetBaseUrl = ref('');
const error = ref('');
const loading = ref(false);

function readCatalog(value: unknown): Course[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('Les guides ne sont pas encore disponibles.');
  }
  const ids = new Set<string>();
  for (const course of value) {
    if (
      !course ||
      typeof course !== 'object' ||
      typeof course.id !== 'string' ||
      !courseIds.has(course.id) ||
      ids.has(course.id) ||
      typeof course.title !== 'string' ||
      typeof course.description !== 'string' ||
      !Number.isInteger(course.steps) ||
      course.steps < 1 ||
      !Number.isFinite(course.durationMs) ||
      course.durationMs <= 0 ||
      course.src !== `./courses/${course.id}/guide.json`
    ) {
      throw new Error('Le catalogue des guides ne peut pas être lu.');
    }
    ids.add(course.id);
  }
  return value as Course[];
}

async function loadGuide(): Promise<void> {
  loading.value = true;
  error.value = '';
  guide.value = undefined;
  try {
    let source = './example/guide.json';
    if (!isSample && requestedCourseId) {
      if (!courseIds.has(requestedCourseId)) {
        throw new Error('Ce cours local est inconnu.');
      }
      const catalogResponse = await fetch('./courses/catalog.json');
      if (
        !catalogResponse.ok ||
        !catalogResponse.headers.get('content-type')?.includes('application/json')
      ) {
        throw new Error('Les cours locaux ne sont pas disponibles sur cette installation.');
      }
      const courses = readCatalog(await catalogResponse.json());
      const selectedCourse = courses.find((course) => course.id === requestedCourseId);
      if (!selectedCourse) throw new Error('Ce cours local ne figure pas dans le catalogue.');
      source = selectedCourse.src;
    }
    const response = await fetch(source);
    if (!response.ok) throw new Error('Ce guide n’a pas pu être chargé.');
    guide.value = validateGuide(await response.json());
    assetBaseUrl.value = source.slice(0, source.lastIndexOf('/') + 1);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Ce guide ne peut pas être lu.';
  } finally {
    loading.value = false;
  }
}

onMounted(loadGuide);
</script>
<template>
  <main class="example-page">
    <InteractiveGuide v-if="guide" :guide="guide" :asset-base-url="assetBaseUrl" />
    <div v-else class="guide-status" :aria-busy="loading">
      <p role="status">{{ error || 'Chargement du guide…' }}</p>
      <button v-if="error && !loading" class="guide-retry" type="button" @click="loadGuide">
        Réessayer
      </button>
    </div>
  </main>
</template>
