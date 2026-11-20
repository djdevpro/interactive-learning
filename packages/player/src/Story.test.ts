import { describe, expect, it } from 'vitest';
import { storyLineAt } from './Story';

const story = [
  { atMs: 1000, text: 'Le groupe a trois filiales.' },
  { atMs: 5000, text: 'Chacune a son plan comptable.' },
  { atMs: 12_000, text: 'Après la fin.' },
];

describe('the story of a guide', () => {
  it('tells nothing before its first line', () => {
    expect(storyLineAt(story, 500, 10_000)).toBeNull();
  });

  it('tells each line from its start until the next one', () => {
    expect(storyLineAt(story, 1000, 10_000)?.index).toBe(0);
    expect(storyLineAt(story, 4999, 10_000)?.index).toBe(0);
    expect(storyLineAt(story, 5000, 10_000)?.line.text).toBe('Chacune a son plan comptable.');
  });

  it('ends with the guide: a line that starts after the end is never told', () => {
    expect(storyLineAt(story, 10_000, 10_000)?.index).toBe(1);
    expect(storyLineAt(story, 12_500, 10_000)?.index).toBe(1);
  });

  it('tells nothing for a guide without a story', () => {
    expect(storyLineAt(undefined, 3000, 10_000)).toBeNull();
    expect(storyLineAt([], 3000, 10_000)).toBeNull();
  });
});
