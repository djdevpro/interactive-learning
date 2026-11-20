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
