import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createGuide, sanitizeSourceUrl } from '@interactive-learning/protocol';
import type { GuideAsset, GuideDocument, GuideStep } from '@interactive-learning/protocol';
import { isNodeError, RecorderError } from './errors.js';
import {
  readGuide,
  rejectSymlink,
  resolveAssetPath,
  resolveGuidePath,
  withGuideLock,
  writeGuideAtomically,
} from './files.js';
import { assertAssetMetadata, readDataImage, readImage } from './images.js';
import type { ImageData } from './images.js';

export interface CreateGuideOptions {
  filePath: string;
  title: string;
  description?: string;
}

export interface AddCaptureOptions {
  imagePath: string;
  title?: string;
  description?: string;
  durationMs?: number;
  cursor?: GuideStep['cursor'];
  source?: GuideStep['source'];
}

export interface AddAnnotationOptions {
  x: number;
  y: number;
  title: string;
  body?: string;
}

export interface ReplaceCaptureOptions {
  imagePath: string;
  source?: GuideStep['source'];
}

export interface ReplaceCaptureResult {
  step: GuideStep;
  annotationsRequireReview: boolean;
}

export function assertNormalizedPoint(x: number, y: number): void {
  if (![x, y].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) {
    throw new RecorderError(
      'INVALID_COORDINATES',
      'The x and y coordinates must be numbers between 0 and 1.',
    );
  }
}

export class RecordingSession {
  readonly guidePath: string;

  constructor(guidePath: string) {
    this.guidePath = resolveGuidePath(guidePath);
  }

  static async create(options: CreateGuideOptions): Promise<RecordingSession> {
    if (!options.title.trim())
      throw new RecorderError('INVALID_TITLE', 'The guide title is required.');
    const session = new RecordingSession(options.filePath);
    await withGuideLock(session.guidePath, async () => {
      const document = createGuide(options.title.trim(), options.description ?? '');
      await writeGuideAtomically(session.guidePath, document);
    });
    return session;
  }

  async read(): Promise<GuideDocument> {
    return (await readGuide(this.guidePath)).document;
  }

  async addCapture(options: AddCaptureOptions): Promise<GuideStep> {
    if (options.cursor) {
      assertNormalizedPoint(options.cursor.x, options.cursor.y);
      if (options.cursor.from) assertNormalizedPoint(options.cursor.from.x, options.cursor.from.y);
    }
    const durationMs = options.durationMs ?? 2500;
    if (!Number.isFinite(durationMs) || durationMs < 400 || durationMs > 120_000) {
      throw new RecorderError(
        'INVALID_DURATION',
        'The duration must be between 400 and 120000 milliseconds.',
      );
    }
    // Read and validate before creating any output or modifying the manifest.
    const image = await readImage(resolve(options.imagePath));
    return withGuideLock(this.guidePath, async () => {
      const { document, raw } = await readGuide(this.guidePath);
      const asset = await this.storeImage(document, image);
      const title = options.title?.trim() || `Step ${document.steps.length + 1}`;
      const step: GuideStep = {
        id: `step_${randomUUID()}`,
        title,
        description: options.description ?? '',
        durationMs,
        assetId: asset.id,
        annotations: [],
        ...(options.cursor ? { cursor: options.cursor } : {}),
        ...(options.source
          ? {
              source: {
                ...options.source,
                url: options.source.url ? sanitizeSourceUrl(options.source.url) : undefined,
              },
            }
          : {}),
      };
      document.steps.push(step);
      document.updatedAt = new Date().toISOString();
      await writeGuideAtomically(this.guidePath, document, raw);
      return step;
    });
  }

  async replaceCapture(
    stepId: string,
    options: ReplaceCaptureOptions,
  ): Promise<ReplaceCaptureResult> {
    const image = await readImage(resolve(options.imagePath));
    return withGuideLock(this.guidePath, async () => {
      const { document, raw } = await readGuide(this.guidePath);
      const step = document.steps.find((candidate) => candidate.id === stepId);
      if (!step)
        throw new RecorderError('STEP_NOT_FOUND', 'This step does not exist in the guide.');
      const asset = await this.storeImage(document, image);
      step.assetId = asset.id;
      delete step.cursor;
      // A previous viewport or capture timestamp no longer describes the new image.
      delete step.source;
      if (options.source) {
        step.source = {
          ...options.source,
          url: options.source.url ? sanitizeSourceUrl(options.source.url) : undefined,
        };
      }
      const usedAssets = new Set(document.steps.map((candidate) => candidate.assetId));
      document.assets = document.assets.filter((candidate) => usedAssets.has(candidate.id));
      document.updatedAt = new Date().toISOString();
      await writeGuideAtomically(this.guidePath, document, raw);
      return { step, annotationsRequireReview: step.annotations.length > 0 };
    });
  }

  private async storeImage(document: GuideDocument, image: ImageData): Promise<GuideAsset> {
    const assetsDirectory = resolve(dirname(this.guidePath), 'assets');
    await rejectSymlink(assetsDirectory);
    await mkdir(assetsDirectory, { recursive: true });
    const src = `assets/${image.hash}.${image.extension}`;
    const imagePath = resolve(dirname(this.guidePath), src);
    await rejectSymlink(imagePath);
    try {
      await writeFile(imagePath, image.bytes, { flag: 'wx' });
    } catch (error) {
      if (!isNodeError(error, 'EEXIST')) throw error;
      if (!(await readFile(imagePath)).equals(image.bytes)) {
        throw new RecorderError('ASSET_CONFLICT', 'An existing image file has unexpected content.');
      }
    }
    let asset = document.assets.find((candidate) => candidate.src === src);
    if (asset) {
      assertAssetMetadata(asset, image);
      return asset;
    }
    asset = {
      id: `asset_${image.hash.slice(0, 24)}`,
      src,
      mimeType: image.mimeType,
      width: image.width,
      height: image.height,
    };
    document.assets.push(asset);
    return asset;
  }

  async addAnnotation(
    stepId: string,
    options: AddAnnotationOptions,
  ): Promise<GuideStep['annotations'][number]> {
    assertNormalizedPoint(options.x, options.y);
    if (!options.title.trim())
      throw new RecorderError('INVALID_TITLE', 'The annotation title is required.');
    return withGuideLock(this.guidePath, async () => {
      const { document, raw } = await readGuide(this.guidePath);
      const step = document.steps.find((item) => item.id === stepId);
      if (!step)
        throw new RecorderError('STEP_NOT_FOUND', 'This step does not exist in the guide.');
      const annotation: GuideStep['annotations'][number] = {
        id: `annotation_${randomUUID()}`,
        x: options.x,
        y: options.y,
        title: options.title.trim(),
        body: options.body ?? '',
      };
      step.annotations.push(annotation);
      document.updatedAt = new Date().toISOString();
      await writeGuideAtomically(this.guidePath, document, raw);
      return annotation;
    });
  }

  async validate(): Promise<GuideDocument> {
    const document = await this.read();
    for (const asset of document.assets) {
      const image = asset.src.startsWith('data:')
        ? readDataImage(asset.src)
        : await readImage(await resolveAssetPath(this.guidePath, asset.src));
      assertAssetMetadata(asset, image);
    }
    return document;
  }
}
