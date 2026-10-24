<script setup lang="ts">
withDefaults(
  defineProps<{
    name:
      | 'play'
      | 'pause'
      | 'previous'
      | 'next'
      | 'replay'
      | 'image'
      | 'arrow'
      | 'check'
      | 'info'
      | 'close'
      | 'expand'
      | 'contract';
    size?: number;
  }>(),
  { size: 20 },
);
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <g v-if="name === 'info'" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7v.1" />
    </g>
    <path
      v-else-if="name === 'close'"
      d="m6 6 12 12M18 6 6 18"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
    />
    <path v-else-if="name === 'play'" d="m9 5 11 7-11 7V5Z" fill="currentColor" />
    <path
      v-else-if="name === 'pause'"
      d="M8 5v14M16 5v14"
      stroke="currentColor"
      stroke-width="4"
      stroke-linecap="round"
    />
    <path
      v-else-if="name === 'previous'"
      d="M6 5v14m13-14L9 12l10 7V5Z"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path
      v-else-if="name === 'next'"
      d="M18 5v14M5 5l10 7-10 7V5Z"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path
      v-else-if="name === 'replay'"
      d="M4.5 9a8 8 0 1 1-.2 5M4 4v5h5"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <g
      v-else-if="name === 'image'"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linejoin="round"
    >
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="m3 16 5-5 5 5 3-3 5 5" />
      <circle cx="15.5" cy="8.5" r="1" />
    </g>
    <path
      v-else-if="name === 'check'"
      d="m5 12 4 4L19 6"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path
      v-else-if="name === 'expand' || name === 'contract'"
      :d="
        name === 'expand'
          ? 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5'
          : 'M3 8h5V3m8 0v5h5M8 21v-5H3m13 5v-5h5'
      "
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path
      v-else
      d="M5 12h14m-6-6 6 6-6 6"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>
