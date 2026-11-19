<script lang="ts">
/** Line icons drawn for the studio on a 24 px grid, in one stroke. They take the text color. */
const paths = {
  museum:
    '<path d="M3.5 9 12 4l8.5 5"/><path d="M4.5 9.5h15"/><path d="M6.5 10v7M10 10v7M14 10v7M17.5 10v7"/><path d="M4 19.5h16"/>',
  globe:
    '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.4 2.4 3.4 5.4 3.4 8.5s-1 6.1-3.4 8.5c-2.4-2.4-3.4-5.4-3.4-8.5s1-6.1 3.4-8.5Z"/>',
  room: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M4 9.5h16"/>',
  route:
    '<circle cx="5.5" cy="17" r="2"/><circle cx="12" cy="8" r="2"/><circle cx="18.5" cy="15" r="2"/><path d="m7 15.2 3.8-5.4M13.6 9.4l3.6 3.9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  left: '<path d="m14.5 18-6-6 6-6"/>',
  right: '<path d="m9.5 18 6-6-6-6"/>',
  down: '<path d="m6 9.5 6 6 6-6"/>',
  more: '<path d="M6 12h.01M12 12h.01M18 12h.01" stroke-width="2.6"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
  close: '<path d="m6.5 6.5 11 11M17.5 6.5l-11 11"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  record: '<circle cx="12" cy="12" r="6" fill="currentColor" stroke="none"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" stroke="none"/>',
  play: '<path d="M8 5.5v13L18.5 12 8 5.5Z" fill="currentColor"/>',
  pause:
    '<rect x="7" y="5.5" width="3.5" height="13" rx="1" fill="currentColor" stroke="none"/><rect x="13.5" y="5.5" width="3.5" height="13" rx="1" fill="currentColor" stroke="none"/>',
  camera: '<path d="M4 8.5h3.2L9 5.5h6l1.8 3H20v10H4v-10Z"/><circle cx="12" cy="13.5" r="3.2"/>',
  edit: '<path d="M14.5 5.5 18.5 9.5"/><path d="M5 19l1-4L15.8 5.2a1.9 1.9 0 0 1 2.7 0l.3.3a1.9 1.9 0 0 1 0 2.7L9 18l-4 1Z"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
  undo: '<path d="M9 14 4.5 9.5 9 5"/><path d="M5 9.5h9.5a5 5 0 0 1 0 10H11"/>',
  redo: '<path d="m15 14 4.5-4.5L15 5"/><path d="M19 9.5H9.5a5 5 0 0 0 0 10H13"/>',
  publish:
    '<path d="M12 15V4.5M7.5 9 12 4.5 16.5 9"/><path d="M4.5 14v4a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-4"/>',
  archive:
    '<rect x="4" y="4.5" width="16" height="4" rx="1"/><path d="M5.5 8.5V18a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5V8.5"/><path d="M10 12.5h4"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  folder:
    '<path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2.5h8a1.5 1.5 0 0 1 1.5 1.5v7.5A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5v-10Z"/>',
  trash: '<path d="M4.5 7h15M10 11v6M14 11v6M6.5 7l.9 12.5h9.2L17.5 7M9 7V4.5h6V7"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
  move: '<path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2.5h8a1.5 1.5 0 0 1 1.5 1.5v7.5A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5v-10Z"/><path d="M9.5 13.5h5M12.5 11l2.5 2.5-2.5 2.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  fade: '<rect x="3.5" y="5.5" width="10" height="10" rx="1.5"/><rect x="10.5" y="8.5" width="10" height="10" rx="1.5" fill="currentColor" fill-opacity=".18"/>',
  cut: '<rect x="3.5" y="6.5" width="7" height="11" rx="1.5"/><rect x="13.5" y="6.5" width="7" height="11" rx="1.5" fill="currentColor" fill-opacity=".18"/><path d="M12 4v16"/>',
  pointer: '<path d="M6 3.5 18.5 11l-5.7 1.5-2.5 5.6L6 3.5Z"/>',
  marker:
    '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/>',
  frame:
    '<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/>',
  retake: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4.8h-4.8"/>',
  reload: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4.8h-4.8"/>',
  zoomIn: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4M8.5 11h5M11 8.5v5"/>',
  zoomOut: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4M8.5 11h5"/>',
  fit: '<path d="M9 4.5H4.5V9M15 4.5h4.5V9M19.5 15v4.5H15M9 19.5H4.5V15"/>',
  alert: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5.5M12 16.4v.1"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.6v.1"/>',
  published: '<circle cx="12" cy="12" r="8.5"/><path d="m8 12.3 2.8 2.8L16 9.6"/>',
  grip: '<path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" stroke-width="2.6"/>',
  text: '<path d="M5 6.5h14M5 12h14M5 17.5h9"/>',
  external:
    '<path d="M13.5 4.5h6v6M19.5 4.5l-8 8"/><path d="M17.5 13.5v4.5a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 18V8A1.5 1.5 0 0 1 6 6.5h4.5"/>',
  settings:
    '<path d="M9.28 5.44L10.65 5.03L10.87 2.77L13.13 2.77L13.35 5.03L14.72 5.44L15.97 6.11L17.73 4.67L19.33 6.27L17.89 8.03L18.56 9.28L18.97 10.65L21.23 10.87L21.23 13.13L18.97 13.35L18.56 14.72L17.89 15.97L19.33 17.73L17.73 19.33L15.97 17.89L14.72 18.56L13.35 18.97L13.13 21.23L10.87 21.23L10.65 18.97L9.28 18.56L8.03 17.89L6.27 19.33L4.67 17.73L6.11 15.97L5.44 14.72L5.03 13.35L2.77 13.13L2.77 10.87L5.03 10.65L5.44 9.28L6.11 8.03L4.67 6.27L6.27 4.67L8.03 6.11Z"/><circle cx="12" cy="12" r="3"/>',
  plug: '<path d="M9 3.5v4M15 3.5v4"/><path d="M6.5 7.5h11V11a5.5 5.5 0 0 1-11 0V7.5Z"/><path d="M12 16.5v4"/>',
  keyboard:
    '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M10.5 10h.01M14 10h.01M17.5 10h.01M7 13.5h.01M17.5 13.5h.01" stroke-width="2.4"/><path d="M10 14h4"/>',
  download: '<path d="M12 4.5V15M7.5 10.5 12 15l4.5-4.5"/><path d="M5 19.5h14"/>',
  spark:
    '<path d="M12 3.5c.7 3.9 2.6 5.8 6.5 6.5-3.9.7-5.8 2.6-6.5 6.5-.7-3.9-2.6-5.8-6.5-6.5 3.9-.7 5.8-2.6 6.5-6.5Z"/><path d="M18.5 15.5c.25 1.4.85 2 2.25 2.25-1.4.25-2 .85-2.25 2.25-.25-1.4-.85-2-2.25-2.25 1.4-.25 2-.85 2.25-2.25Z"/>',
};
export type IconName = keyof typeof paths;
</script>

<script setup lang="ts">
const props = withDefaults(defineProps<{ name: IconName; size?: number }>(), { size: 18 });
</script>

<template>
  <svg
    :width="props.size"
    :height="props.size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    v-html="paths[props.name]"
  ></svg>
</template>
