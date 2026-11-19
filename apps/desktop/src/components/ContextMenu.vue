<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Icon from './Icon.vue';
import { closeMenu, isAction, openMenu, type MenuAction } from '../menus';

/**
 * The menus of the studio, from a right click or a More button: one at a time, over everything,
 * kept inside the window, and driven with the arrows, Enter and Esc like the menus of the system.
 */
const element = ref<HTMLElement | null>(null);
const position = ref({ left: -9999, top: -9999 });
const MARGIN = 8;

watch(openMenu, async (menu) => {
  if (!menu) return;
  position.value = { left: -9999, top: -9999 };
  await nextTick();
  const box = element.value?.getBoundingClientRect();
  const width = box?.width ?? 220;
  const height = box?.height ?? 200;
  let left = menu.align === 'end' ? menu.anchor.x - width : menu.anchor.x;
  left = Math.max(MARGIN, Math.min(left, innerWidth - width - MARGIN));
  let top = menu.anchor.bottom;
  // Without room below, the menu opens upward from its anchor.
  if (top + height > innerHeight - MARGIN) top = menu.anchor.top - height;
  top = Math.max(MARGIN, Math.min(top, innerHeight - height - MARGIN));
  position.value = { left, top };
  await nextTick();
  const first = element.value?.querySelector<HTMLButtonElement>('button:not(:disabled)');
  if (menu.keyboard) first?.focus();
  else element.value?.focus({ preventScroll: true });
});

function choose(entry: MenuAction): void {
  closeMenu(true);
  entry.run();
}

function onKey(event: KeyboardEvent): void {
  // The keys of the menu stay in it: Delete never reaches the editor behind it.
  event.stopPropagation();
  const items = [
    ...(element.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []),
  ];
  const index = items.indexOf(document.activeElement as HTMLButtonElement);
  const focus = (next: number) => items[(next + items.length) % items.length]?.focus();
  if (event.key === 'ArrowDown') focus(index + 1);
  else if (event.key === 'ArrowUp') focus(index < 0 ? -1 : index - 1);
  else if (event.key === 'Home') focus(0);
  else if (event.key === 'End') focus(-1);
  else if (event.key === 'Escape' || event.key === 'Tab') closeMenu(true);
  else return;
  event.preventDefault();
}

function outside(event: Event): void {
  if (openMenu.value && !element.value?.contains(event.target as Node)) closeMenu();
}
const dismiss = () => {
  if (openMenu.value) closeMenu();
};

onMounted(() => {
  window.addEventListener('pointerdown', outside, true);
  window.addEventListener('wheel', dismiss, { passive: true });
  window.addEventListener('resize', dismiss);
  window.addEventListener('blur', dismiss);
});
onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', outside, true);
  window.removeEventListener('wheel', dismiss);
  window.removeEventListener('resize', dismiss);
  window.removeEventListener('blur', dismiss);
});
</script>

<template>
  <div
    v-if="openMenu"
    ref="element"
    class="menu context-menu"
    role="menu"
    tabindex="-1"
    :aria-label="openMenu.label"
    :style="{ left: `${position.left}px`, top: `${position.top}px` }"
    @keydown="onKey"
    @contextmenu.prevent
  >
    <template v-for="(entry, index) in openMenu.entries" :key="index">
      <hr v-if="'separator' in entry" role="separator" />
      <span v-else-if="'heading' in entry" class="menu-label" role="presentation">{{
        entry.heading
      }}</span>
      <button
        v-else-if="isAction(entry)"
        type="button"
        role="menuitem"
        :class="{ 'danger-item': entry.danger }"
        :disabled="entry.disabled"
        @click="choose(entry)"
      >
        <Icon v-if="entry.icon" :name="entry.icon" />
        <span class="menu-text">{{ entry.label }}</span>
        <kbd v-if="entry.keys" class="menu-keys">{{ entry.keys }}</kbd>
      </button>
    </template>
  </div>
</template>
