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
  /**
   * Closes in on the point of the cursor as it gets there, holds through the click, then goes back
   * before the markers appear: 1.8 shows that area 1.8 times larger. A step without a cursor, or
   * too short for the way in and out, stays as it is.
   */
  zoom?: number;
  cursor?: GuideCursor;
  annotations: GuideAnnotation[];
  source?: CaptureContext;
}
/**
 * A line of the story a guide tells under its screenshots, on its own timing rather than the
 * steps': it starts `atMs` after the start of the guide and lasts until the next line, or the end.
 */
export interface GuideStoryLine {
  atMs: number;
  text: string;
  /**
   * The line read aloud, like the voice over of a video: a sound file next to the guide, as the
   * screenshots are, or an embedded one. It plays from the start of the line.
   */
  audio?: string;
  /**
   * The words of the voice, in the order it says them: the player shows a few at a time over the
   * screen, as the captions of a video, each lit when it is said.
   */
  words?: GuideWord[];
}
/** A word of a line read aloud, said from `atMs` to `endMs` after the start of the line. */
export interface GuideWord {
  text: string;
  atMs: number;
  endMs: number;
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
  /** Lines in the order they are told. A line that starts after the last step never shows. */
  story?: GuideStoryLine[];
}
