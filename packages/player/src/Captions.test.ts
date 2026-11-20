import { describe, expect, it } from 'vitest';
import { captionAt, captionChunks } from './Captions';

// « Deuxième étape : les postes de dépense. Le loyer, les assurances, les taxes… »
const words = [
  { text: 'Deuxième', atMs: 80, endMs: 520 },
  { text: 'étape :', atMs: 540, endMs: 980 },
  { text: 'les', atMs: 1200, endMs: 1320 },
  { text: 'postes', atMs: 1340, endMs: 1700 },
  { text: 'de', atMs: 1720, endMs: 1800 },
  { text: 'dépense.', atMs: 1820, endMs: 2300 },
  { text: 'Le', atMs: 2800, endMs: 2900 },
  { text: 'loyer,', atMs: 2920, endMs: 3300 },
  { text: 'les', atMs: 3420, endMs: 3520 },
  { text: 'assurances,', atMs: 3540, endMs: 4200 },
  { text: 'les', atMs: 4300, endMs: 4400 },
  { text: 'taxes…', atMs: 4420, endMs: 5000 },
];

describe('captions of the voice', () => {
  it('reads a few words at a time, cut at the ends of sentences, the commas and the pauses', () => {
    expect(
      captionChunks(words).map((chunk) => chunk.words.map((word) => word.text).join(' ')),
    ).toEqual([
      'Deuxième étape :',
      'les postes de dépense.',
      // A comma ends a chunk only once it holds three words.
      'Le loyer, les assurances,',
      'les taxes…',
    ]);
  });

  it('shows the chunk being said and lights its words as the voice says them', () => {
    expect(captionAt(words, 0)).toMatchObject({ index: 0, said: 0 });
    expect(captionAt(words, 600)).toMatchObject({ index: 0, said: 2 });
    const second = captionAt(words, 1500)!;
    expect(second.index).toBe(1);
    expect(second.said).toBe(2);
    // Between two chunks, the one said last stays until the next starts.
    expect(captionAt(words, 2600)?.index).toBe(1);
  });

  it('leaves the screen a moment after the last word, and before the line', () => {
    expect(captionAt(words, 5500)?.index).toBe(3);
    expect(captionAt(words, 5800)).toBeNull();
    expect(captionAt(words, -10)).toBeNull();
    expect(captionAt([], 100)).toBeNull();
  });
});
