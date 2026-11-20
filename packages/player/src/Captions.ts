import type { GuideWord } from '@interactive-learning/protocol';

/** A few words of the voice shown together over the screen. */
export interface CaptionChunk {
  words: readonly GuideWord[];
  atMs: number;
  endMs: number;
}

const MAX_WORDS = 6;
const MAX_CHARACTERS = 38;
/** A comma ends a chunk only once it holds this many words, so a short phrase is not left alone. */
const COMMA_WORDS = 3;
/** A silence this long between two words starts a new chunk, as the voice breathes. */
const PAUSE_MS = 350;
/** The last chunk of a line stays this long after its last word. */
const HOLD_MS = 700;

const chunked = new WeakMap<readonly GuideWord[], CaptionChunk[]>();

/**
 * Cuts the words of a line into short chunks, the way video captions read: a chunk ends at the
 * end of a sentence, at a comma once it holds a few words, at a pause of the voice, or when it
 * would grow too long.
 */
export function captionChunks(words: readonly GuideWord[]): CaptionChunk[] {
  const known = chunked.get(words);
  if (known) return known;
  const chunks: CaptionChunk[] = [];
  let current: GuideWord[] = [];
  const close = () => {
    if (current.length)
      chunks.push({ words: current, atMs: current[0]!.atMs, endMs: current.at(-1)!.endMs });
    current = [];
  };
  for (const word of words) {
    const previous = current.at(-1);
    const length = current.reduce((sum, said) => sum + said.text.length + 1, word.text.length);
    if (
      previous &&
      (current.length >= MAX_WORDS ||
        length > MAX_CHARACTERS ||
        /[.;:!?…]$/.test(previous.text) ||
        (/,$/.test(previous.text) && current.length >= COMMA_WORDS) ||
        word.atMs - previous.endMs > PAUSE_MS)
    )
      close();
    current.push(word);
  }
  close();
  chunked.set(words, chunks);
  return chunks;
}

/**
 * The chunk on screen `offsetMs` after the start of its line, and how many of its words the voice
 * has said. The first chunk shows from the start of the line, each one until the next, and the
 * last one a moment after its last word.
 */
export function captionAt(
  words: readonly GuideWord[],
  offsetMs: number,
): { index: number; chunk: CaptionChunk; said: number } | null {
  const chunks = captionChunks(words);
  if (!chunks.length || offsetMs < 0) return null;
  let index = 0;
  for (let next = 1; next < chunks.length && chunks[next]!.atMs <= offsetMs; next++) index = next;
  const chunk = chunks[index]!;
  if (index === chunks.length - 1 && offsetMs > chunk.endMs + HOLD_MS) return null;
  return { index, chunk, said: chunk.words.filter((word) => word.atMs <= offsetMs).length };
}
