import {
  SCHEMA_VERSION,
  MAX_IMAGE_BYTES,
  type GuideDocument,
  type GuideAsset,
  type GuideStep,
  type GuideAnnotation,
  type GuideViewport,
  type Point,
  type CaptureContext,
  type ImageMimeType,
} from './types';

export class GuideValidationError extends Error {
  constructor(
    public readonly path: string,
    message: string,
  ) {
    super(`${path}: ${message}`);
    this.name = 'GuideValidationError';
  }
}
function fail(path: string, message: string): never {
  throw new GuideValidationError(path, message);
}
function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'expected an object');
  return value as Record<string, unknown>;
}
function text(value: unknown, path: string, max = 10000): string {
  if (typeof value !== 'string' || value.length > max) fail(path, 'invalid or too long text');
  return value;
}
function identifier(value: unknown, path: string): string {
  const result = text(value, path, 128);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(result)) fail(path, 'invalid identifier');
  return result;
}
function number(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
    fail(path, `expected a number between ${min} and ${max}`);
  return value;
}
function date(value: unknown, path: string): string {
  const result = text(value, path, 64);
  if (!Number.isFinite(Date.parse(result))) fail(path, 'invalid date');
  return result;
}
function array(value: unknown, path: string, max = 500): unknown[] {
  if (!Array.isArray(value) || value.length > max) fail(path, 'invalid or too long list');
  return value;
}
function point(value: unknown, path: string): Point {
  const obj = object(value, path);
  return { x: number(obj.x, path + '.x', 0, 1), y: number(obj.y, path + '.y', 0, 1) };
}
export function isSafeAssetSource(value: string): boolean {
  if (value.startsWith('data:')) {
    return (
      value.length <= MAX_IMAGE_BYTES * 1.4 + 100 &&
      /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
    );
  }
  if (!value || /[\\:#?\u0000-\u001f]/.test(value) || value.startsWith('/')) return false;
  try {
    return (
      decodeURIComponent(value)
        .split('/')
        .every((part) => part !== '..' && part !== '.' && part.length > 0) &&
      !/[\\:\u0000-\u001f]/.test(decodeURIComponent(value))
    );
  } catch {
    return false;
  }
}
function asset(value: unknown, path: string): GuideAsset {
  const obj = object(value, path);
  const src = text(obj.src, path + '.src', Math.ceil(MAX_IMAGE_BYTES * 1.4) + 100);
  if (!isSafeAssetSource(src))
    fail(path + '.src', 'expected an embedded image or a safe relative path');
  const mimeType = text(obj.mimeType, path + '.mimeType');
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(mimeType))
    fail(path + '.mimeType', 'unsupported image format');
  if (src.startsWith('data:') && !src.startsWith('data:' + mimeType + ';'))
    fail(path + '.src', 'MIME type does not match the image');
  const width = number(obj.width, path + '.width', 1, 32768);
  const height = number(obj.height, path + '.height', 1, 32768);
  if (!Number.isInteger(width) || !Number.isInteger(height))
    fail(path, 'expected integer dimensions');
  return {
    id: identifier(obj.id, path + '.id'),
    src,
    mimeType: mimeType as ImageMimeType,
    width,
    height,
  };
}
function annotation(value: unknown, path: string): GuideAnnotation {
  const obj = object(value, path);
  return {
    id: identifier(obj.id, path + '.id'),
    ...point(obj, path),
    title: text(obj.title, path + '.title', 500),
    body: text(obj.body, path + '.body'),
  };
}
function context(value: unknown, path: string): CaptureContext {
  const obj = object(value, path);
  const result: CaptureContext = { capturedAt: date(obj.capturedAt, path + '.capturedAt') };
  if (obj.url !== undefined) {
    result.url = text(obj.url, path + '.url', 4000);
    try {
      const url = new URL(result.url);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
        fail(path + '.url', 'unsupported URL');
    } catch {
      fail(path + '.url', 'invalid URL');
    }
  }
  if (obj.viewport !== undefined) {
    const vp = object(obj.viewport, path + '.viewport');
    result.viewport = {
      width: number(vp.width, path + '.viewport.width', 1, 32768),
      height: number(vp.height, path + '.viewport.height', 1, 32768),
    };
  }
  if (obj.scroll !== undefined) {
    const scroll = object(obj.scroll, path + '.scroll');
    result.scroll = {
      x: number(scroll.x, path + '.scroll.x', -1e8, 1e8),
      y: number(scroll.y, path + '.scroll.y', -1e8, 1e8),
    };
  }
  if (obj.dpr !== undefined) result.dpr = number(obj.dpr, path + '.dpr', 0.1, 10);
  if (obj.reason !== undefined) result.reason = text(obj.reason, path + '.reason', 100);
  return result;
}
function step(value: unknown, path: string): GuideStep {
  const obj = object(value, path);
  const result: GuideStep = {
    id: identifier(obj.id, path + '.id'),
    title: text(obj.title, path + '.title', 500),
    description: text(obj.description, path + '.description'),
    durationMs: number(obj.durationMs, path + '.durationMs', 400, 120000),
    assetId: identifier(obj.assetId, path + '.assetId'),
    annotations: array(obj.annotations, path + '.annotations', 50).map((a, i) =>
      annotation(a, path + '.annotations[' + i + ']'),
    ),
  };
  if (obj.cursor !== undefined) {
    const cursor = object(obj.cursor, path + '.cursor');
    if (
      cursor.action !== undefined &&
      (typeof cursor.action !== 'string' || !['click', 'move'].includes(cursor.action))
    )
      fail(path + '.cursor.action', 'invalid cursor action');
    result.cursor = point(cursor, path + '.cursor');
    if (cursor.action !== undefined) result.cursor.action = cursor.action as 'click' | 'move';
    if (cursor.from !== undefined) result.cursor.from = point(cursor.from, path + '.cursor.from');
  }
  if (obj.viewport !== undefined) result.viewport = viewport(obj.viewport, path + '.viewport');
  if (obj.transition !== undefined) {
    if (obj.transition !== 'fade' && obj.transition !== 'cut')
      fail(path + '.transition', 'expected fade or cut');
    result.transition = obj.transition;
  }
  if (obj.source !== undefined) result.source = context(obj.source, path + '.source');
  unique(result.annotations, path + '.annotations');
  return result;
}
function viewport(value: unknown, path: string): GuideViewport {
  const obj = object(value, path);
  const result = {
    x: number(obj.x, path + '.x', 0, 1),
    y: number(obj.y, path + '.y', 0, 1),
    width: number(obj.width, path + '.width', 0.001, 1),
    height: number(obj.height, path + '.height', 0.001, 1),
  };
  // Rounding in recorders may overshoot the edge by a hair.
  if (result.x + result.width > 1.001 || result.y + result.height > 1.001)
    fail(path, 'the visible part must stay inside the image');
  return result;
}
function unique(items: { id: string }[], path: string): void {
  if (new Set(items.map((i) => i.id)).size !== items.length) fail(path, 'duplicate identifiers');
}
export function validateGuide(input: unknown): GuideDocument {
  const obj = object(input, 'guide');
  if (obj.schemaVersion !== SCHEMA_VERSION)
    fail('guide.schemaVersion', `unsupported version (expected ${SCHEMA_VERSION})`);
  const result: GuideDocument = {
    schemaVersion: SCHEMA_VERSION,
    id: identifier(obj.id, 'guide.id'),
    title: text(obj.title, 'guide.title', 500),
    description: text(obj.description, 'guide.description'),
    createdAt: date(obj.createdAt, 'guide.createdAt'),
    updatedAt: date(obj.updatedAt, 'guide.updatedAt'),
    assets: array(obj.assets, 'guide.assets').map((a, i) => asset(a, 'guide.assets[' + i + ']')),
    steps: array(obj.steps, 'guide.steps').map((s, i) => step(s, 'guide.steps[' + i + ']')),
  };
  unique(result.assets, 'guide.assets');
  unique(result.steps, 'guide.steps');
  const assetIds = new Set(result.assets.map((a) => a.id));
  for (const [index, s] of result.steps.entries())
    if (!assetIds.has(s.assetId))
      fail('guide.steps[' + index + '].assetId', 'screenshot not found');
  return result;
}
