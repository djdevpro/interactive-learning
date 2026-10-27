import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGuide, type GuideDocument } from '@interactive-learning/protocol';
import { createHistory } from './history';

const titled = (guide: GuideDocument, title: string): GuideDocument => ({ ...guide, title });

describe('editing history', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('undoes and redoes changes, and saves the latest state once it settles', async () => {
    const saved: string[] = [];
    const history = createHistory(async (guide) => {
      saved.push(guide.title);
    });
    history.open(createGuide('Draft'));
    history.change(titled(history.guide.value!, 'First'), 'Rename');
    vi.advanceTimersByTime(1000);
    history.change(titled(history.guide.value!, 'Second'), 'Rename');
    expect(history.guide.value?.title).toBe('Second');
    expect(history.undo()).toBe('Rename');
    expect(history.guide.value?.title).toBe('First');
    expect(history.redo()).toBe('Rename');
    expect(history.guide.value?.title).toBe('Second');
    await vi.runAllTimersAsync();
    // The first title settled before the second change; the undo and redo settle on the second.
    expect(saved).toEqual(['First', 'Second']);
    expect(history.saving.value).toBe('saved');
  });

  it('undoes quick changes of the same kind together, such as typing a title', () => {
    const history = createHistory(async () => undefined);
    history.open(createGuide('Draft'));
    for (const title of ['B', 'Bi', 'Bil', 'Bill']) {
      history.change(titled(history.guide.value!, title), 'Rename');
      vi.advanceTimersByTime(100);
    }
    history.undo();
    expect(history.guide.value?.title).toBe('Draft');
    expect(history.canUndo.value).toBe(false);
  });

  it('forgets what was undone once a new change is made', () => {
    const history = createHistory(async () => undefined);
    history.open(createGuide('Draft'));
    history.change(titled(history.guide.value!, 'One'), 'Rename');
    history.undo();
    history.change(titled(history.guide.value!, 'Two'), 'Retitle');
    expect(history.canRedo.value).toBe(false);
  });
});
