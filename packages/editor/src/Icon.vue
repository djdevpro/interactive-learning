<script lang="ts">
/** Line icons on a 24 px grid. They inherit the text colour. */
const paths = {
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>',
  pointer: '<path d="M5 3.5 18.5 11l-6 1.6-2.6 5.9L5 3.5Z"/>',
  retake: '<path d="M20 12a8 8 0 1 1-2.35-5.65"/><path d="M20 4v5h-5"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  left: '<path d="m14.5 18-6-6 6-6"/>',
  right: '<path d="m9.5 18 6-6-6-6"/>',
  camera: '<path d="M4 8h3.2L9 5h6l1.8 3H20v11H4V8Z"/><circle cx="12" cy="13.5" r="3.2"/>',
  pause: '<path d="M9 6v12M15 6v12"/>',
  play: '<path d="M8 5.5v13L18.5 12 8 5.5Z"/>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="1.5"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 16V5M7 9.5l5-5 5 5M5 20h14"/>',
  image:
    '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="m4 16 4.5-4.5 4 4 2.5-2.5 5 5"/><circle cx="15.5" cy="9" r="1.3"/>',
  save: '<path d="M5 4h11l3 3v13H5V4Z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.4v.1"/>',
  tab: '<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 9.5h18M8 5v4.5"/>',
};
export type IconName = keyof typeof paths;
</script>

<script setup lang="ts">
import type { PropType } from 'vue';

defineProps({
  name: { type: String as PropType<IconName>, required: true },
  size: { type: Number, default: 18 },
});
</script>

<template>
  <svg
    class="icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    v-html="paths[name]"
  ></svg>
</template>
