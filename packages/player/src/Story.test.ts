import { describe, expect, it } from 'vitest';
import { storyLineAt, voiceAt } from './Story';

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

describe('the voice of the story', () => {
  const voiced = [
    { atMs: 1000, text: 'Le groupe a trois filiales.', audio: 'voix/a.mp3' },
    { atMs: 5000, text: 'Chacune a son plan comptable.' },
    { atMs: 8000, text: 'Et ses comptes en banque.', audio: 'voix/c.mp3' },
  ];

  it('reads the line being told, from the time since its start', () => {
    expect(voiceAt(voiced, 500, 10_000)).toBeNull();
    expect(voiceAt(voiced, 3500, 10_000)).toEqual({
      index: 0,
      audio: 'voix/a.mp3',
      offsetMs: 2500,
    });
    expect(voiceAt(voiced, 9000, 10_000)).toEqual({
      index: 2,
      audio: 'voix/c.mp3',
      offsetMs: 1000,
    });
  });

  it('stays silent on a line without a voice', () => {
    expect(voiceAt(voiced, 6000, 10_000)).toBeNull();
  });
});
