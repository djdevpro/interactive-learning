import { shallowRef } from 'vue';

export interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'error';
  action?: { label: string; run: () => void };
}

/** The message at the bottom of the window. A newer one replaces it. */
export const toast = shallowRef<Toast | null>(null);
let timer: ReturnType<typeof setTimeout> | undefined;
let count = 0;

export function notify(message: string, action?: Toast['action']): void {
  show({ id: ++count, message, tone: 'info', ...(action ? { action } : {}) }, action ? 6000 : 2800);
}

/** Says what went wrong, in the words of the error when it has some. */
export function warn(cause: unknown, fallback: string): void {
  const message =
    cause instanceof Error ? cause.message : typeof cause === 'string' && cause ? cause : fallback;
  show({ id: ++count, message, tone: 'error' }, 6000);
}

function show(next: Toast, duration: number): void {
  toast.value = next;
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (toast.value?.id === next.id) toast.value = null;
  }, duration);
}

export function dismiss(): void {
  toast.value = null;
}

/** `5 min ago`, `yesterday`, or a date, for when a tutorial changed. */
export function since(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '';
  const minutes = Math.round((now - time) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  if (hours < 48) return 'yesterday';
  return new Date(time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
