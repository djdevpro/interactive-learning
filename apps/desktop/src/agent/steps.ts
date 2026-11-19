import type {
  GuideAnnotation,
  GuideDocument,
  GuideStep,
  Point,
} from '@interactive-learning/protocol';
import { stepStarts, withMarkers } from '../editing';
import { baselineOf, screenStep, type Capture } from '../recording';

const unit = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 10_000) / 10_000;

/** The step an agent names by its number, from 1, or an error it can act on. */
export function stepAt(guide: GuideDocument, number: unknown): { step: GuideStep; index: number } {
  const index = Number(number) - 1;
  const step = Number.isInteger(index) ? guide.steps[index] : undefined;
  if (step) return { step, index };
  throw new Error(
    guide.steps.length
      ? `There is no step ${String(number)}. The tutorial has ${guide.steps.length} steps, numbered from 1.`
      : 'The tutorial has no step yet.',
  );
}

export function markerAt(
  step: GuideStep,
  number: unknown,
  stepNumber: number,
): { marker: GuideAnnotation; index: number } {
  const index = Number(number) - 1;
  const marker = Number.isInteger(index) ? step.annotations[index] : undefined;
  if (marker) return { marker, index };
  throw new Error(
    step.annotations.length
      ? `Step ${stepNumber} has no marker ${String(number)}. Its markers are numbered from 1 to ${step.annotations.length}.`
      : `Step ${stepNumber} has no marker.`,
  );
}

/** A position on a screenshot, from 0 to 1 of its width and height. */
export function pointOf(x: unknown, y: unknown): Point {
  const point = { x: Number(x), y: Number(y) };
  if (![point.x, point.y].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) {
    throw new Error('x and y go from 0 to 1 of the width and the height of the screenshot.');
  }
  return { x: unit(point.x), y: unit(point.y) };
}

/** A step as an agent reads it. */
export function describeStep(guide: GuideDocument, step: GuideStep, index: number) {
  const asset = guide.assets.find((candidate) => candidate.id === step.assetId);
  return {
    number: index + 1,
    title: step.title,
    text: step.description,
    duration_ms: step.durationMs,
    transition: step.transition ?? null,
    page: step.source?.url ?? null,
    screenshot: asset ? { width: asset.width, height: asset.height } : null,
    on_screen: step.viewport ?? 'the whole page',
    cursor: step.cursor
      ? { x: step.cursor.x, y: step.cursor.y, action: step.cursor.action ?? 'click' }
      : null,
    markers: step.annotations.map((marker, position) => ({
      number: position + 1,
      title: marker.title,
      text: marker.body,
      x: marker.x,
      y: marker.y,
    })),
  };
}

export function describeGuide(guide: GuideDocument, path: string) {
  return {
    tutorial: path,
    title: guide.title,
    description: guide.description,
    duration_ms: stepStarts(guide).total,
    steps: guide.steps.map((step, index) => describeStep(guide, step, index)),
  };
}

export interface StepTexts {
  title?: string | undefined;
  text?: string | undefined;
  markerTitle?: string | undefined;
  markerText?: string | undefined;
}

/**
 * The page as it is, as a new step. With `point`, a point of the window in CSS pixels, a marker
 * and the cursor point at it, the cursor moving there without a click.
 */
export function pointedStep(
  guide: GuideDocument,
  capture: Capture,
  point: Point | null,
  texts: StepTexts,
): GuideDocument {
  const base = baselineOf(capture, capture.image ?? capture.page);
  const next = screenStep(guide, base, capture.view, 'agent');
  const added = next.steps.at(-1);
  if (!added) return next;
  let step: GuideStep = {
    ...added,
    title: texts.title?.trim() || added.title,
    description: texts.text?.trim() ?? '',
  };
  if (point) {
    const x = unit((point.x + capture.view.x) / capture.page.width);
    const y = unit((point.y + capture.view.y) / capture.page.height);
    const marker: GuideAnnotation = {
      id: `marker_${crypto.randomUUID()}`,
      x,
      y,
      title: texts.markerTitle?.trim() ?? '',
      body: texts.markerText?.trim() ?? '',
    };
    step = { ...withMarkers(step, [marker]), cursor: { x, y, action: 'move' } };
  }
  return { ...next, steps: [...next.steps.slice(0, -1), step] };
}
