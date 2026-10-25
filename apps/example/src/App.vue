<script setup lang="ts">
import '@interactive-learning/player/auto';

// Local business courses stay out of Git; `?cours=<id>` plays one of them when it exists.
const courseIds = new Set(['formation', 'suivi-apprenti', 'dossier-facture', 'qualiopi']);
const params = new URLSearchParams(location.search);
const course = params.has('sample') ? null : params.get('cours');
const error = course && !courseIds.has(course) ? 'This local course is unknown.' : '';
const source = course && !error ? `./courses/${course}/guide.json` : './example/guide.json';
</script>

<template>
  <main class="example-page">
    <p v-if="error" class="guide-status" role="alert">{{ error }}</p>
    <interactive-learning v-else :src="source" />
  </main>
</template>
