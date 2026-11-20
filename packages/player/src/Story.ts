import type { GuideStoryLine } from '@interactive-learning/protocol';

/**
 * The line of the story told at a moment of the guide: the last one that has started, which lasts
 * until the next one or the end. Nothing before the first line. A line that starts once the guide
 * is over is never told, so the story always ends with the guide.
 */
export function storyLineAt(
  story: readonly GuideStoryLine[] | undefined,
  elapsedMs: number,
  totalMs: number,
): { index: number; line: GuideStoryLine } | null {
  if (!story?.length) return null;
  let current: { index: number; line: GuideStoryLine } | null = null;
  for (const [index, line] of story.entries()) {
    if (line.atMs >= totalMs || line.atMs > elapsedMs) break;
    current = { index, line };
  }
  return current;
}

/**
 * The voice to hear at a moment of the guide: that of the line being told, from the time since
 * its start. Nothing for a line without a voice.
 */
export function voiceAt(
  story: readonly GuideStoryLine[] | undefined,
  elapsedMs: number,
  totalMs: number,
): { index: number; audio: string; offsetMs: number } | null {
  const told = storyLineAt(story, elapsedMs, totalMs);
  if (!told?.line.audio) return null;
  return { index: told.index, audio: told.line.audio, offsetMs: elapsedMs - told.line.atMs };
}
