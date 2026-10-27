<script setup lang="ts">
/** The Interactive Learning mark, drawn like the app icon: three white bars on its green. */
withDefaults(defineProps<{ size?: number }>(), { size: 24 });
</script>

<template>
  <svg class="logo" :width="size" :height="size" viewBox="0 0 128 128" aria-hidden="true">
    <rect width="128" height="128" rx="28" fill="#1c6651" />
    <rect x="33" y="60" width="15" height="36" rx="7.5" fill="#ffffff" />
    <rect x="56.5" y="34" width="15" height="62" rx="7.5" fill="#ffffff" />
    <rect x="80" y="48" width="15" height="48" rx="7.5" fill="#ffffff" />
  </svg>
</template>
