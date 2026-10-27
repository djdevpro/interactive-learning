import type {
  GuideAnnotation,
  GuideCursor,
  GuideDocument,
  GuideStep,
  GuideTransition,
  GuideViewport,
} from '@interactive-learning/protocol';

/** What the step editor saves. Positions are normalized from 0 to 1. */
export interface StepDraft {
  title: string;
  description: string;
  cursor: GuideCursor | null;
  annotations: GuideAnnotation[];
  /** Address of the page of the step. Empty removes it, undefined keeps it. */
  url?: string;
  /** Visible part of a full-page screenshot. Null shows the whole image, undefined keeps it. */
  viewport?: GuideViewport | null;
  /** Undefined keeps the transition and the duration of the step. */
  transition?: GuideTransition;
  durationMs?: number;
}

/** The step with the edits of the draft, ready to validate. */
export function applyStepDraft(step: GuideStep, draft: StepDraft): GuideStep {
  const { cursor: _previous, source, viewport: shownPart, ...rest } = step;
  const viewport = draft.viewport === undefined ? shownPart : (draft.viewport ?? undefined);
  const url = draft.url?.trim();
  let edited = source;
  if (url) edited = { ...(source ?? { capturedAt: new Date().toISOString() }), url };
  else if (url === '' && source) {
    const { url: _removed, ...others } = source;
    edited = others;
  }
  return {
    ...rest,
    title: draft.title,
    description: draft.description,
    annotations: draft.annotations,
    ...(draft.durationMs ? { durationMs: draft.durationMs } : {}),
    ...(draft.transition ? { transition: draft.transition } : {}),
    ...(viewport ? { viewport } : {}),
    ...(draft.cursor ? { cursor: draft.cursor } : {}),
    ...(edited ? { source: edited } : {}),
  };
}

/** Removes the images no step shows any more. */
export function withoutUnusedAssets(guide: GuideDocument): GuideDocument {
  const used = new Set(guide.steps.map((step) => step.assetId));
  return { ...guide, assets: guide.assets.filter((asset) => used.has(asset.id)) };
}

/** Number of the first marker of a step. The player counts markers across the whole guide. */
export function markerNumber(steps: readonly GuideStep[], index: number): number {
  return steps.slice(0, index).reduce((total, step) => total + step.annotations.length, 1);
}

/** A recorded click without markers still counts as one, since the editor shows it as one. */
export function markerSummary(step: GuideStep): string {
  const count = step.annotations.length || (step.cursor ? 1 : 0);
  return count === 0 ? 'No marker yet' : count === 1 ? '1 marker' : `${count} markers`;
}
