import {
  sanitizeSourceUrl,
  type CaptureContext,
  type GuideAsset,
  type GuideDocument,
  type GuideStep,
  type GuideViewport,
} from '@interactive-learning/protocol';

export interface Size {
  width: number;
  height: number;
}

export interface Area extends Size {
  x: number;
  y: number;
}

/** What `site_capture` returns: the image and the page it shows, in CSS pixels. */
export interface Capture {
  /** A file of the tutorial, `assets/<content>.webp`, or a data URI when kept in memory. */
  src: string;
  /** Size of the image, given when it was saved in a tutorial. */
  image?: Size | null;
  url: string;
  title: string;
  page: Size;
  view: Area;
}

/** A report of the observer that runs in the recorded page. */
export interface Observation {
  type: 'click' | 'scroll' | 'settled';
  url: string;
  title: string;
  revision: number;
  scroll: { x: number; y: number };
  viewport: Size;
  page: Size;
  point?: { x: number; y: number };
  label?: string;
  /** Time since the person last acted in the page, on a settled page. */
  sinceAction?: number;
}

/** The latest screenshot of the page, kept until an action of the person makes it a step. */
export interface Baseline {
  asset: GuideAsset;
  page: Size;
  url: string;
  title: string;
  view: Area;
}

const unit = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 10_000) / 10_000;

export function baselineOf(capture: Capture, image: Size): Baseline {
  // A file named after its content keeps one identifier: the same screen is one asset.
  const file = /^assets\/([\w-]+)\.webp$/.exec(capture.src)?.[1];
  return {
    asset: {
      id: file ? `asset_${file}` : `asset_${crypto.randomUUID()}`,
      src: capture.src,
      mimeType: 'image/webp',
      width: image.width,
      height: image.height,
    },
    page: capture.page,
    url: capture.url,
    title: capture.title,
    view: capture.view,
  };
}

/** The part of a page that a window of `window` size shows when the page is scrolled to `scroll`. */
export function visiblePart(
  page: Size,
  scroll: { x: number; y: number },
  window: Size,
): GuideViewport {
  const width = unit(window.width / page.width);
  const height = unit(window.height / page.height);
  return {
    x: unit(Math.min(scroll.x / page.width, 1 - width)),
    y: unit(Math.min(scroll.y / page.height, 1 - height)),
    width,
    height,
  };
}

/** Adds an image once: a page captured again without any change reuses its screenshot. */
export function withAsset(
  guide: GuideDocument,
  asset: GuideAsset,
): { guide: GuideDocument; assetId: string } {
  const known = guide.assets.find((candidate) => candidate.src === asset.src);
  if (known) return { guide, assetId: known.id };
  return { guide: { ...guide, assets: [...guide.assets, asset] }, assetId: asset.id };
}

function source(url: string, reason: string, observation?: Observation): CaptureContext {
  const address = sanitizeSourceUrl(url);
  return {
    capturedAt: new Date().toISOString(),
    ...(address ? { url: address } : {}),
    ...(observation
      ? {
          viewport: {
            width: Math.max(1, Math.round(observation.viewport.width)),
            height: Math.max(1, Math.round(observation.viewport.height)),
          },
          scroll: observation.scroll,
        }
      : {}),
    reason,
  };
}

/** A new screenshot fades in; the same screenshot scrolls instead, so no transition is set. */
function transitionFrom(guide: GuideDocument, assetId: string): Pick<GuideStep, 'transition'> {
  const previous = guide.steps.at(-1);
  return previous && previous.assetId !== assetId ? { transition: 'fade' } : {};
}

/** A click step that fades or scrolls first keeps the same time to read its marker afterwards. */
function clickDuration(guide: GuideDocument, assetId: string, viewport: GuideViewport): number {
  const previous = guide.steps.at(-1);
  const moves =
    previous !== undefined &&
    (previous.assetId !== assetId ||
      Math.abs((previous.viewport?.y ?? 0) - viewport.y) > 0.001 ||
      Math.abs((previous.viewport?.x ?? 0) - viewport.x) > 0.001);
  return moves ? 4000 : 3000;
}

/**
 * A click in the page. The step shows the screen before the click, scrolled as the person saw
 * it, with the cursor and a marker on the clicked point, named after what was clicked.
 */
export function clickStep(guide: GuideDocument, base: Baseline, click: Observation): GuideDocument {
  const { guide: withImage, assetId } = withAsset(guide, base.asset);
  const point = click.point ?? { x: click.viewport.width / 2, y: click.viewport.height / 2 };
  const x = unit((point.x + click.scroll.x) / base.page.width);
  const y = unit((point.y + click.scroll.y) / base.page.height);
  const label = click.label?.trim() ?? '';
  const viewport = visiblePart(base.page, click.scroll, click.viewport);
  const step: GuideStep = {
    id: `step_${crypto.randomUUID()}`,
    title: label ? `Click “${label}”` : 'Click here',
    description: '',
    durationMs: clickDuration(withImage, assetId, viewport),
    assetId,
    viewport,
    ...transitionFrom(withImage, assetId),
    cursor: { x, y, action: 'click' },
    annotations: [
      { id: `marker_${crypto.randomUUID()}`, x, y, title: label || 'Click here', body: '' },
    ],
    source: source(click.url, 'click', click),
  };
  return { ...withImage, steps: [...withImage.steps, step] };
}

/** A screen without a click: a capture by hand, or the last screen of a recording. */
export function screenStep(
  guide: GuideDocument,
  base: Baseline,
  scroll: { x: number; y: number } = base.view,
  reason = 'manual',
): GuideDocument {
  const { guide: withImage, assetId } = withAsset(guide, base.asset);
  const step: GuideStep = {
    id: `step_${crypto.randomUUID()}`,
    title: base.title || 'New screen',
    description: '',
    durationMs: 2500,
    assetId,
    viewport: visiblePart(base.page, scroll, base.view),
    ...transitionFrom(withImage, assetId),
    annotations: [],
    source: source(base.url, reason),
  };
  return { ...withImage, steps: [...withImage.steps, step] };
}
