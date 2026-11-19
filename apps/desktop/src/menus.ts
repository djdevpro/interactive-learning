import { shallowRef } from 'vue';
import type { IconName } from './components/Icon.vue';

/** An item of a menu: what it does, and the keys that do the same, shown at its right. */
export interface MenuAction {
  label: string;
  icon?: IconName;
  run: () => void;
  danger?: boolean;
  disabled?: boolean;
  keys?: string;
}
export type MenuEntry = MenuAction | { separator: true } | { heading: string };

export interface OpenMenu {
  /** Where the menu hangs: the left or right edge at `x`, under `bottom`, or over `top`. */
  anchor: { x: number; top: number; bottom: number };
  align: 'start' | 'end';
  entries: MenuEntry[];
  label: string;
  /** Opened from the keyboard: its first item takes the focus. */
  keyboard: boolean;
  returnFocus: HTMLElement | null;
}

/** The one menu open in the window, if any. */
export const openMenu = shallowRef<OpenMenu | null>(null);

export const isAction = (entry: MenuEntry): entry is MenuAction => 'run' in entry;

/** Fields keep the menu of the system, with Cut, Copy and Paste, and so does code to copy. */
export function keepsNativeMenu(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(target.closest('input, textarea, select, [contenteditable="true"], .code'))
  );
}

/** No separator at the ends of a menu, nor two in a row, when entries come and go. */
export function tidy(entries: MenuEntry[]): MenuEntry[] {
  const kept: MenuEntry[] = [];
  for (const entry of entries) {
    const previous = kept.at(-1);
    if ('separator' in entry && (!previous || 'separator' in previous)) continue;
    kept.push(entry);
  }
  while (kept.length && 'separator' in kept.at(-1)!) kept.pop();
  return kept;
}

function show(menu: Omit<OpenMenu, 'entries'> & { entries: MenuEntry[] }): void {
  const entries = tidy(menu.entries);
  if (entries.some(isAction)) openMenu.value = { ...menu, entries };
}

/**
 * The menu of what is under the pointer, opened by a right click where it happened, or under the
 * focused element when the menu key of the keyboard asked for it.
 */
export function contextMenu(event: MouseEvent, entries: MenuEntry[], label: string): void {
  if (keepsNativeMenu(event.target)) return;
  event.preventDefault();
  event.stopPropagation();
  const element = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  // A right click comes from the second button; the keyboard sends no button at all.
  const keyboard = event.button !== 2;
  const box = element?.getBoundingClientRect();
  show({
    anchor:
      keyboard && box
        ? { x: box.left + 8, top: box.top, bottom: box.bottom }
        : { x: event.clientX, top: event.clientY, bottom: event.clientY },
    align: 'start',
    entries,
    label,
    keyboard,
    returnFocus: document.activeElement instanceof HTMLElement ? document.activeElement : null,
  });
}

/** The menu of a More button, under it, their right edges aligned. */
export function buttonMenu(event: MouseEvent, entries: MenuEntry[], label: string): void {
  const button = event.currentTarget as HTMLElement;
  const box = button.getBoundingClientRect();
  show({
    anchor: { x: box.right, top: box.top - 4, bottom: box.bottom + 4 },
    align: 'end',
    entries,
    label,
    keyboard: event.detail === 0,
    returnFocus: button,
  });
}

export function closeMenu(restoreFocus = false): void {
  const menu = openMenu.value;
  openMenu.value = null;
  if (restoreFocus) menu?.returnFocus?.focus();
}
