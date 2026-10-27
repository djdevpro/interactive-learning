export const SCHEMA_VERSION = '1.0.0' as const;
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

export interface Point {
  x: number;
  y: number;
}
export interface GuideCursor extends Point {
  action?: 'click' | 'move';
  from?: Point;
}
export interface GuideAnnotation extends Point {
  id: string;
  title: string;
  body: string;
}
export type ImageMimeType = 'image/png' | 'image/jpeg' | 'image/webp';
export interface GuideAsset {
  id: string;
  src: string;
  mimeType: ImageMimeType;
  width: number;
  height: number;
}
export interface CaptureContext {
  capturedAt: string;
  url?: string;
  viewport?: { width: number; height: number };
  scroll?: Point;
  dpr?: number;
  reason?: string;
}
/**
 * Part of a screenshot that a step shows, from 0 to 1 of the image. A full-page screenshot is
 * seen through the window of the browser: steps that share it scroll from one part to another.
 */
export interface GuideViewport extends Point {
  width: number;
  height: number;
}
/** How a step replaces the previous screenshot: `fade` blends them, `cut` swaps them at once. */
export type GuideTransition = 'fade' | 'cut';
export interface GuideStep {
  id: string;
  title: string;
  description: string;
  durationMs: number;
  assetId: string;
  /** Cursor and annotation positions stay relative to the whole image, not to this part. */
  viewport?: GuideViewport;
  transition?: GuideTransition;
  cursor?: GuideCursor;
  annotations: GuideAnnotation[];
  source?: CaptureContext;
}
export interface GuideDocument {
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  assets: GuideAsset[];
  steps: GuideStep[];
}
