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
export interface GuideStep {
  id: string;
  title: string;
  description: string;
  durationMs: number;
  assetId: string;
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
