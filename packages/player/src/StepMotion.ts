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
  /** Part of the current screenshot on screen now, smaller while the camera zooms in. */
  view: GuideViewport;
  opacity: number;
  /**
   * The previous screenshot while the new one fades in over it. It stays opaque, so the blend
   * never lets the background show through.
   */
  previous: { assetId: string; view: GuideViewport } | null;
  /** Cursor on screen, from 0 to 1 of the stage, and its click ripple from 0 to 1. */
  cursor: (Point & { ripple: number | null }) | null;
  /** Where the cursor stops, from 0 to 1 of the stage once the camera is back. */
  target: Point | null;
  /** Markers appear once the screen is in place, the cursor has arrived and the camera is back. */
  markersVisible: boolean;
}

export function viewOf(step: GuideStep): GuideViewport {
  return step.viewport ?? WHOLE_IMAGE;
}

/** A point of the whole screenshot, placed on the stage that shows `view`. */
export function toStage(point: Point, view: GuideViewport): Point {
  return { x: (point.x - view.x) / view.width, y: (point.y - view.y) / view.height };
}

/** A point of the stage that shows `view`, placed on the whole screenshot. */
function toImage(point: Point, view: GuideViewport): Point {
  return { x: view.x + point.x * view.width, y: view.y + point.y * view.height };
}

/**
 * The part of `view` that a camera `zoom` times closer to `focus` shows. It centers the point as
 * far as the view allows, so a point near an edge stays near it.
 */
export function closeUp(view: GuideViewport, focus: Point, zoom: number): GuideViewport {
  const width = view.width / zoom;
  const height = view.height / zoom;
  const within = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
  return {
    x: within(focus.x - width / 2, view.x, view.x + view.width - width),
    y: within(focus.y - height / 2, view.y, view.y + view.height - height),
    width,
    height,
  };
}

/**
 * Where the action sits well on screen, from 0 to 1 of the stage: off the edges, and above the
 * band of the captions and the controls.
 */
const COMFORT = { left: 0.08, right: 0.92, top: 0.08, bottom: 0.7 };
/** How close the camera may go to frame the action, and what each step closer costs. */
const FRAME_ZOOMS = [1.15, 1.3, 1.45];
const FRAME_COST = 0.06;

/**
 * The part of the screenshot the camera frames for a step: the view of the step, or a closer part
 * of it when the cursor or a marker sits near an edge, under the captions or the controls. The
 * camera then brings the action toward the middle as far as the screenshot allows, a little
 * closer for each step of the way it gains, and never shows past the screenshot.
 */
export function frameOf(step: GuideStep): GuideViewport {
  const view = viewOf(step);
  const points: Point[] = [...(step.cursor ? [step.cursor] : []), ...step.annotations];
  if (!points.length) return view;
  // How far the action lies outside its place, or Infinity when the frame would hide part of it.
  const strain = (frame: GuideViewport) =>
    points.reduce((sum, point) => {
      const { x, y } = toStage(point, frame);
      if (x < 0 || x > 1 || y < 0 || y > 1) return Infinity;
      return (
        sum +
        Math.max(0, COMFORT.left - x, x - COMFORT.right) +
        Math.max(0, COMFORT.top - y, y - COMFORT.bottom)
      );
    }, 0);
  let best = view;
  let least = strain(view);
  if (least === 0) return view;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const focus = {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
  const middle = { x: (COMFORT.left + COMFORT.right) / 2, y: (COMFORT.top + COMFORT.bottom) / 2 };
  const within = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
  for (const zoom of FRAME_ZOOMS) {
    const width = view.width / zoom;
    const height = view.height / zoom;
    const frame = {
      x: within(focus.x - middle.x * width, view.x, view.x + view.width - width),
      y: within(focus.y - middle.y * height, view.y, view.y + view.height - height),
      width,
      height,
    };
    const value = strain(frame) + FRAME_COST * (zoom - 1);
    if (value < least) {
      best = frame;
      least = value;
    }
  }
  return best;
}

// The camera closes in while the pointer ends its way, stays through the click, then goes back.
const ZOOM_IN_MS = 700;
const ZOOM_HOLD_MS = 900;
const ZOOM_OUT_MS = 650;
/** A step zooms only when it lasts at least this long after the click. */
const ZOOM_MIN_AFTER_MS = 900;

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
 * cursor then glides from where it last clicked, clicks, and the markers appear. A step with a
 * zoom closes in on the point while the cursor ends its way, and goes back before the markers.
 * Everything is computed from the time in the step, so seeking or pausing shows the same frame.
 */
export function stepMotion({
  step,
  asset,
  previous,
  elapsedMs,
  reducedMotion,
}: MotionInput): StepMotion {
  // The camera frames each step, so it moves from one framing to the next as it scrolls.
  const view = frameOf(step);
  const duration = step.durationMs;
  const before = previous ? frameOf(previous.step) : undefined;
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
  const glideMs =
    reducedMotion || travel < 0.002 ? 0 : Math.min(duration * 0.3, 450 + 500 * Math.min(travel, 1));
  // A zoom lets the pointer take at least the time the camera needs to close in.
  const zoomMoveMs = Math.max(glideMs, Math.min(ZOOM_IN_MS, duration * 0.3));
  const zoom =
    !reducedMotion &&
    cursor &&
    step.zoom !== undefined &&
    step.zoom > 1 &&
    duration - screenMs - zoomMoveMs >= ZOOM_MIN_AFTER_MS
      ? step.zoom
      : 1;
  const moveMs = zoom > 1 ? zoomMoveMs : glideMs;
  const arrivedAt = screenMs + moveMs;

  const faded = fadeMs ? ease(unit(elapsedMs / fadeMs)) : 1;
  const scrolled = scrollMs ? ease(unit((elapsedMs - fadeMs) / scrollMs)) : 1;
  const moved = moveMs ? ease(unit((elapsedMs - screenMs) / moveMs)) : 1;
  const ripple = elapsedMs - arrivedAt;

  // How close the camera is, from 0 for the view of the step to 1 for the zoom of the step.
  let closeness = 0;
  let markersAt = arrivedAt;
  if (zoom > 1) {
    const inMs = Math.min(ZOOM_IN_MS, moveMs);
    const afterMs = duration - arrivedAt;
    const outStart = arrivedAt + Math.min(ZOOM_HOLD_MS, afterMs * 0.35);
    const outMs = Math.min(ZOOM_OUT_MS, afterMs * 0.3);
    markersAt = outStart + outMs;
    closeness =
      elapsedMs < outStart
        ? ease(unit((elapsedMs - (arrivedAt - inMs)) / inMs))
        : 1 - ease(unit((elapsedMs - outStart) / outMs));
  }

  const screen = start
    ? {
        x: lerp(start.x, view.x, scrolled),
        y: lerp(start.y, view.y, scrolled),
        width: lerp(start.width, view.width, scrolled),
        height: lerp(start.height, view.height, scrolled),
      }
    : view;
  // A framed step is already closer: the zoom of the click adds what it lacks, and a little.
  const framed = viewOf(step).width / view.width;
  const close =
    cursor && closeness > 0 ? closeUp(view, cursor, Math.max(1.15, zoom / framed)) : undefined;
  const camera = close
    ? {
        x: lerp(view.x, close.x, closeness),
        y: lerp(view.y, close.y, closeness),
        width: lerp(view.width, close.width, closeness),
        height: lerp(view.height, close.height, closeness),
      }
    : screen;
  // The pointer moves on the page, so the camera carries it with the screenshot.
  const pointer = (point: Point) => (close ? toStage(toImage(point, view), camera) : point);

  return {
    view: camera,
    opacity: faded,
    previous:
      previous && before && fadeMs && faded < 1
        ? { assetId: previous.step.assetId, view: before }
        : null,
    cursor:
      target && from
        ? {
            ...pointer({ x: lerp(from.x, target.x, moved), y: lerp(from.y, target.y, moved) }),
            ripple:
              cursor?.action === 'click' && !reducedMotion && ripple >= 0 && ripple <= 500
                ? ripple / 500
                : null,
          }
        : null,
    target,
    markersVisible: elapsedMs >= markersAt,
  };
}
