import { computed, shallowRef } from 'vue';
import type { GuideDocument } from '@interactive-learning/protocol';

/** Edits close together, like the keys of one word, undo as one. */
const MERGE_MS = 700;
const LIMIT = 200;
/** Changes reach the disk this long after the last one, and at once when the editor closes. */
const SAVE_DELAY_MS = 400;

interface Entry {
  guide: GuideDocument;
  label: string;
  at: number;
}

/**
 * The tutorial being edited, with its undo history. Every change is saved on its own: there is
 * no Save button, and undo walks back through the changes of this session.
 */
export function createHistory(save: (guide: GuideDocument) => Promise<void>) {
  const current = shallowRef<GuideDocument | null>(null);
  const past = shallowRef<Entry[]>([]);
  const future = shallowRef<Entry[]>([]);
  const saving = shallowRef<'saved' | 'pending' | 'error'>('saved');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let writing: Promise<void> = Promise.resolve();

  function schedule(): void {
    saving.value = 'pending';
    clearTimeout(timer);
    timer = setTimeout(() => void flush(), SAVE_DELAY_MS);
  }

  /** Writes the latest state now, after any write already on its way. */
  function flush(): Promise<void> {
    clearTimeout(timer);
    const guide = current.value;
    if (!guide || saving.value === 'saved') return writing;
    writing = writing
      .then(() => save(guide))
      .then(
        () => {
          if (current.value === guide) saving.value = 'saved';
        },
        () => {
          saving.value = 'error';
        },
      );
    return writing;
  }

  return {
    guide: current,
    saving,
    canUndo: computed(() => past.value.length > 0),
    canRedo: computed(() => future.value.length > 0),
    /** What the next undo would revert, for its tooltip. */
    undoLabel: computed(() => past.value.at(-1)?.label ?? ''),
    redoLabel: computed(() => future.value.at(-1)?.label ?? ''),

    /** Starts editing another tutorial, with an empty history. */
    open(guide: GuideDocument): void {
      clearTimeout(timer);
      current.value = guide;
      past.value = [];
      future.value = [];
      saving.value = 'saved';
    },

    /** Applies a change. Changes with the same label in quick succession undo together. */
    change(next: GuideDocument, label: string): void {
      const previous = current.value;
      if (!previous || next === previous) return;
      const now = Date.now();
      const last = past.value.at(-1);
      const merges = last && last.label === label && now - last.at < MERGE_MS;
      past.value = merges
        ? [...past.value.slice(0, -1), { ...last, at: now }]
        : [...past.value, { guide: previous, label, at: now }].slice(-LIMIT);
      future.value = [];
      current.value = { ...next, updatedAt: new Date().toISOString() };
      schedule();
    },

    undo(): string | undefined {
      const entry = past.value.at(-1);
      if (!entry || !current.value) return undefined;
      past.value = past.value.slice(0, -1);
      future.value = [...future.value, { guide: current.value, label: entry.label, at: 0 }];
      current.value = entry.guide;
      schedule();
      return entry.label;
    },

    redo(): string | undefined {
      const entry = future.value.at(-1);
      if (!entry || !current.value) return undefined;
      future.value = future.value.slice(0, -1);
      past.value = [...past.value, { guide: current.value, label: entry.label, at: 0 }];
      current.value = entry.guide;
      schedule();
      return entry.label;
    },

    flush,
  };
}

export type History = ReturnType<typeof createHistory>;
