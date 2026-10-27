import type {
  GuideAnnotation,
  GuideDocument,
  GuideStep,
  GuideTransition,
  Point,
} from '@interactive-learning/protocol';
import { withoutUnusedAssets } from '@interactive-learning/editor/draft';

/** Bounds of a step's running time, set on the timeline or in the inspector. */
export const MIN_DURATION_MS = 1000;
export const MAX_DURATION_MS = 30_000;

const unit = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 10_000) / 10_000;

export function clampDuration(ms: number): number {
  return Math.round(Math.min(MAX_DURATION_MS, Math.max(MIN_DURATION_MS, ms)) / 100) * 100;
}

/** When each step starts, from the start of the tutorial, and when the last one ends. */
export function stepStarts(guide: GuideDocument): { starts: number[]; total: number } {
  const starts: number[] = [];
  let total = 0;
  for (const step of guide.steps) {
    starts.push(total);
    total += step.durationMs;
  }
  return { starts, total };
}

/** The step playing at a moment of the tutorial. */
export function stepIndexAt(guide: GuideDocument, ms: number): number {
  const { starts } = stepStarts(guide);
  let index = 0;
  for (const [position, start] of starts.entries()) if (ms >= start) index = position;
  return index;
}

export function updateStep(
  guide: GuideDocument,
  stepId: string,
  change: (step: GuideStep) => GuideStep,
): GuideDocument {
  return {
    ...guide,
    steps: guide.steps.map((step) => (step.id === stepId ? change(step) : step)),
  };
}

export function removeStep(guide: GuideDocument, stepId: string): GuideDocument {
  return withoutUnusedAssets({
    ...guide,
    steps: guide.steps.filter((step) => step.id !== stepId),
  });
}

export function moveStep(guide: GuideDocument, from: number, to: number): GuideDocument {
  const steps = [...guide.steps];
  const [moved] = steps.splice(from, 1);
  if (!moved || from === to) return guide;
  steps.splice(Math.min(Math.max(0, to), steps.length), 0, moved);
  return { ...guide, steps };
}

/** A copy of a step right after it, with new identifiers for it and its markers. */
export function duplicateStep(guide: GuideDocument, stepId: string): GuideDocument {
  const index = guide.steps.findIndex((step) => step.id === stepId);
  const step = guide.steps[index];
  if (!step) return guide;
  const copy: GuideStep = {
    ...step,
    id: `step_${crypto.randomUUID()}`,
    annotations: step.annotations.map((marker) => ({
      ...marker,
      id: `marker_${crypto.randomUUID()}`,
    })),
  };
  const steps = [...guide.steps];
  steps.splice(index + 1, 0, copy);
  return { ...guide, steps };
}

export function setDuration(guide: GuideDocument, stepId: string, ms: number): GuideDocument {
  return updateStep(guide, stepId, (step) => ({ ...step, durationMs: clampDuration(ms) }));
}

export function setTransition(
  guide: GuideDocument,
  stepId: string,
  transition: GuideTransition,
): GuideDocument {
  return updateStep(guide, stepId, (step) => ({ ...step, transition }));
}

/**
 * The markers of a step, and where the cursor clicks: on the first marker, the way the player
 * shows a recorded click. A step without markers keeps no cursor.
 */
export function withMarkers(step: GuideStep, annotations: GuideAnnotation[]): GuideStep {
  const [first] = annotations;
  const { cursor: _previous, ...rest } = step;
  return {
    ...rest,
    annotations,
    ...(first
      ? { cursor: { x: first.x, y: first.y, action: step.cursor?.action ?? 'click' } }
      : {}),
  };
}

export function addMarker(step: GuideStep, point: Point): { step: GuideStep; id: string } {
  const id = `marker_${crypto.randomUUID()}`;
  const marker: GuideAnnotation = { id, x: unit(point.x), y: unit(point.y), title: '', body: '' };
  return { step: withMarkers(step, [...step.annotations, marker]), id };
}

export function moveMarker(step: GuideStep, id: string, point: Point): GuideStep {
  return withMarkers(
    step,
    step.annotations.map((marker) =>
      marker.id === id ? { ...marker, x: unit(point.x), y: unit(point.y) } : marker,
    ),
  );
}

export function editMarker(
  step: GuideStep,
  id: string,
  fields: Partial<Pick<GuideAnnotation, 'title' | 'body'>>,
): GuideStep {
  return {
    ...step,
    annotations: step.annotations.map((marker) =>
      marker.id === id ? { ...marker, ...fields } : marker,
    ),
  };
}

export function removeMarker(step: GuideStep, id: string): GuideStep {
  return withMarkers(
    step,
    step.annotations.filter((marker) => marker.id !== id),
  );
}

/** The visible part of the page, moved to another height; null shows the whole page. */
export function scrollTo(step: GuideStep, top: number | null): GuideStep {
  if (top === null || !step.viewport) {
    const { viewport: _whole, ...rest } = step;
    return rest;
  }
  return {
    ...step,
    viewport: { ...step.viewport, y: unit(Math.min(top, 1 - step.viewport.height)) },
  };
}

/** `4 s`, `4.5 s`: a running time as the inspector and the timeline show it. */
export function seconds(ms: number): string {
  const value = Math.round(ms / 100) / 10;
  return `${Number.isInteger(value) ? value : value.toFixed(1)} s`;
}
