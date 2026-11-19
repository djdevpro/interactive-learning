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

/** `5 min ago`, `yesterday`, or a date, in the language of the studio. */
export { since } from './i18n';
