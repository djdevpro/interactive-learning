import type { GuideAsset, GuideStep, GuideViewport, Point } from '@interactive-learning/protocol';

/** A step without a visible part shows its whole screenshot. */
export const WHOLE_IMAGE: GuideViewport = { x: 0, y: 0, width: 1, height: 1 };

export interface MotionInput {
  step: GuideStep;
  asset: GuideAsset | undefined;
  previous: { step: GuideStep; asset: GuideAsset | undefined } | undefined;
  /** Time spent in the step, in milliseconds. */
  elapsedMs: number;
  reducedMotion: boolean;
}

export interface StepMotion {
  /** Part of the current screenshot on screen now. */
  view: GuideViewport;
  opacity: number;
  /**
   * The previous screenshot while the new one fades in over it. It stays opaque, so the blend
   * never lets the background show through.
   */
  previous: { assetId: string; view: GuideViewport } | null;
  /** Cursor on screen, from 0 to 1 of the stage, and its click ripple from 0 to 1. */
  cursor: (Point & { ripple: number | null }) | null;
  /** Where the cursor stops, from 0 to 1 of the stage. */
  target: Point | null;
  /** Markers appear once the screen is in place and the cursor has arrived. */
  markersVisible: boolean;
}

export function viewOf(step: GuideStep): GuideViewport {
  return step.viewport ?? WHOLE_IMAGE;
}

/** A point of the whole screenshot, placed on the stage that shows `view`. */
export function toStage(point: Point, view: GuideViewport): Point {
  return { x: (point.x - view.x) / view.width, y: (point.y - view.y) / view.height };
}

/** Width over height of the part of the screenshot a step shows. */
export function stageAspect(asset: GuideAsset | undefined, view: GuideViewport): number {
  return asset ? (asset.width * view.width) / (asset.height * view.height) : 16 / 9;
}

const unit = (value: number) => Math.min(1, Math.max(0, value));
const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount;
// Slow start and slow stop, as a hand on a mouse or a wheel moves.
const ease = (value: number) => (value < 0.5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2);

/**
 * The previous view, placed on another screenshot of the same page. Two captures of one page at
 * the same width overlap pixel for pixel, so the change can show in place before any scroll.
 */
function lineUp(
  previous: { step: GuideStep; asset: GuideAsset | undefined },
  before: GuideViewport,
  step: GuideStep,
  asset: GuideAsset | undefined,
): GuideViewport | undefined {
  const page = previous.step.source?.url;
  if (!asset || !previous.asset || !page || page !== step.source?.url) return undefined;
  if (Math.abs(previous.asset.width - asset.width) > 1) return undefined;
  const ratio = previous.asset.height / asset.height;
  const height = before.height * ratio;
  if (height > 1) return undefined;
  // A page that got shorter scrolls back up, as a browser does.
  return { x: before.x, y: Math.min(before.y * ratio, 1 - height), width: before.width, height };
}

/**
 * Where everything is at one moment of a step. The screen comes first: a new screenshot fades in,
 * in place when it shows the same page, then the screen scrolls to the part this step shows. The
 * cursor then glides from where it last clicked, clicks, and the markers appear. Everything is
 * computed from the time in the step, so seeking or pausing shows the same frame.
 */
export function stepMotion({
  step,
  asset,
  previous,
  elapsedMs,
  reducedMotion,
}: MotionInput): StepMotion {
  const view = viewOf(step);
  const duration = step.durationMs;
  const before = previous ? viewOf(previous.step) : undefined;
  const sameImage = previous?.step.assetId === step.assetId;
  // Where the screen starts on this step's screenshot, when it can carry on from the previous one.
  const start =
    previous && before ? (sameImage ? before : lineUp(previous, before, step, asset)) : undefined;
  const fades =
    !sameImage &&
    previous?.asset !== undefined &&
    before !== undefined &&
    (step.transition ?? 'fade') === 'fade' &&
    // Screenshots of another shape would stretch while they blend: they swap instead.
    (start !== undefined ||
      Math.abs(stageAspect(previous.asset, before) / stageAspect(asset, view) - 1) < 0.03);
  const fadeMs = reducedMotion || !fades ? 0 : Math.min(500, duration * 0.2);
  const distance = start
    ? Math.hypot((view.x - start.x) / view.width, (view.y - start.y) / view.height)
    : 0;
  // A longer scroll takes longer, within a third of the step.
  const scrollMs =
    reducedMotion || distance < 0.001
      ? 0
      : Math.min(duration * 0.35, 450 + 300 * Math.min(distance, 4));
  const screenMs = fadeMs + scrollMs;

  const cursor = step.cursor;
  const target = cursor ? toStage(cursor, view) : null;
  // The pointer stays where it last clicked while the page moves under it.
  const from = !cursor
    ? null
    : cursor.from
      ? toStage(cursor.from, view)
      : previous?.step.cursor && before
        ? toStage(previous.step.cursor, before)
        : { x: 0.5, y: 0.5 };
  const travel = target && from ? Math.hypot(target.x - from.x, target.y - from.y) : 0;
  const moveMs =
    reducedMotion || travel < 0.002 ? 0 : Math.min(duration * 0.3, 450 + 500 * Math.min(travel, 1));
  const arrivedAt = screenMs + moveMs;

  const faded = fadeMs ? ease(unit(elapsedMs / fadeMs)) : 1;
  const scrolled = scrollMs ? ease(unit((elapsedMs - fadeMs) / scrollMs)) : 1;
  const moved = moveMs ? ease(unit((elapsedMs - screenMs) / moveMs)) : 1;
  const ripple = elapsedMs - arrivedAt;

  return {
    view: start
      ? {
          x: lerp(start.x, view.x, scrolled),
          y: lerp(start.y, view.y, scrolled),
          width: lerp(start.width, view.width, scrolled),
          height: lerp(start.height, view.height, scrolled),
        }
      : view,
    opacity: faded,
    previous:
      previous && before && fadeMs && faded < 1
        ? { assetId: previous.step.assetId, view: before }
        : null,
    cursor:
      target && from
        ? {
            x: lerp(from.x, target.x, moved),
            y: lerp(from.y, target.y, moved),
            ripple:
              cursor?.action === 'click' && !reducedMotion && ripple >= 0 && ripple <= 500
                ? ripple / 500
                : null,
          }
        : null,
    target,
    markersVisible: elapsedMs >= arrivedAt,
  };
}
