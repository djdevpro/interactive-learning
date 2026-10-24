import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { imageSize } from 'image-size';
import { MAX_IMAGE_BYTES } from '@interactive-learning/protocol';
import type { GuideAsset } from '@interactive-learning/protocol';
import { isNodeError, RecorderError } from './errors.js';

export interface ImageData {
  bytes: Buffer;
  mimeType: GuideAsset['mimeType'];
  extension: 'png' | 'jpg' | 'webp';
  width: number;
  height: number;
  hash: string;
}

export function inspectImage(bytes: Buffer): ImageData {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new RecorderError(
      'INVALID_IMAGE_SIZE',
      'La taille de l’image doit être comprise entre 1 octet et 12 Mio.',
    );
  }
  let mimeType: ImageData['mimeType'];
  let extension: ImageData['extension'];
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    mimeType = 'image/png';
    extension = 'png';
  } else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
    mimeType = 'image/jpeg';
    extension = 'jpg';
  } else if (
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  ) {
    mimeType = 'image/webp';
    extension = 'webp';
  } else {
    throw new RecorderError(
      'UNSUPPORTED_IMAGE',
      'Seules les images PNG, JPEG et WebP sont acceptées.',
    );
  }
  let dimensions;
  try {
    dimensions = imageSize(bytes);
  } catch (error) {
    throw new RecorderError('INVALID_IMAGE', 'Impossible de lire les dimensions de l’image.', {
      cause: error,
    });
  }
  const { width, height } = dimensions;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width > 32768 ||
    height > 32768
  ) {
    throw new RecorderError('INVALID_IMAGE', 'L’image ne possède pas de dimensions valides.');
  }
  return {
    bytes,
    mimeType,
    extension,
    width,
    height,
    hash: createHash('sha256').update(bytes).digest('hex'),
  };
}

export async function readImage(path: string): Promise<ImageData> {
  try {
    const info = await stat(path);
    if (!info.isFile())
      throw new RecorderError('INVALID_IMAGE', 'Le chemin de l’image doit désigner un fichier.');
    if (info.size > MAX_IMAGE_BYTES)
      throw new RecorderError('INVALID_IMAGE_SIZE', 'L’image dépasse la limite de 12 Mio.');
    return inspectImage(await readFile(path));
  } catch (error) {
    if (isNodeError(error, 'ENOENT'))
      throw new RecorderError('IMAGE_NOT_FOUND', 'Le fichier image est introuvable.');
    throw error;
  }
}

export function readDataImage(src: string): ImageData {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(src);
  if (!match)
    throw new RecorderError(
      'INVALID_IMAGE',
      'L’image intégrée doit être une data URI PNG, JPEG ou WebP en base64.',
    );
  if (match[2].length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) {
    throw new RecorderError('INVALID_IMAGE_SIZE', 'L’image intégrée dépasse la limite de 12 Mio.');
  }
  const image = inspectImage(Buffer.from(match[2], 'base64'));
  if (image.mimeType !== match[1])
    throw new RecorderError('INVALID_IMAGE', 'Le type déclaré ne correspond pas à l’image.');
  return image;
}

export function assertAssetMetadata(asset: GuideAsset, image: ImageData): void {
  if (
    asset.width !== image.width ||
    asset.height !== image.height ||
    asset.mimeType !== image.mimeType
  ) {
    throw new RecorderError(
      'ASSET_METADATA_MISMATCH',
      'Les dimensions ou le type d’une image ne correspondent pas au manifeste.',
    );
  }
}
