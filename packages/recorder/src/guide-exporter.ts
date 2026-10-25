import { lstat, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { createZip, validateGuide, type ZipEntry } from '@interactive-learning/protocol';
import { isNodeError, RecorderError } from './errors.js';
import {
  readGuide,
  rejectSymlink,
  resolveAssetPath,
  resolveGuidePath,
  writeGuideAtomically,
} from './files.js';
import { assertAssetMetadata, readDataImage, readImage } from './images.js';

export interface ExportGuideOptions {
  outDirectory: string;
  embed?: boolean;
}

export interface ExportGuideResult {
  directory: string;
  manifestPath: string;
  assetCount: number;
  stepCount: number;
  embedded: boolean;
}

export interface ExportZipResult {
  file: string;
  assetCount: number;
  stepCount: number;
}

export class GuideExporter {
  readonly guidePath: string;

  constructor(guidePath: string) {
    this.guidePath = resolveGuidePath(guidePath);
  }

  /**
   * One archive with `guide.json` and its images in `assets/`. The browser extension imports it
   * to edit the guide, and unzipping it in a public folder gives the files the player loads.
   */
  async exportZip(outFile: string): Promise<ExportZipResult> {
    if (!outFile.trim())
      throw new RecorderError('INVALID_EXPORT_PATH', 'The output file is required.');
    const file = resolve(outFile);
    await rejectSymlink(file);
    const { document } = await readGuide(this.guidePath);
    const images: ZipEntry[] = [];
    for (const asset of document.assets) {
      const image = asset.src.startsWith('data:')
        ? readDataImage(asset.src)
        : await readImage(await resolveAssetPath(this.guidePath, asset.src));
      assertAssetMetadata(asset, image);
      asset.src = `assets/${image.hash}.${image.extension}`;
      if (!images.some(({ name }) => name === asset.src))
        images.push({ name: asset.src, data: image.bytes });
    }
    const json = `${JSON.stringify(validateGuide(document), null, 2)}\n`;
    const archive = createZip([
      { name: 'guide.json', data: new TextEncoder().encode(json) },
      ...images,
    ]);
    await mkdir(dirname(file), { recursive: true });
    try {
      await writeFile(file, archive, { flag: 'wx' });
    } catch (error) {
      if (isNodeError(error, 'EEXIST'))
        throw new RecorderError(
          'EXPORT_EXISTS',
          'The output file already exists. Choose a new name.',
        );
      throw error;
    }
    return { file, assetCount: document.assets.length, stepCount: document.steps.length };
  }

  async export(options: ExportGuideOptions): Promise<ExportGuideResult> {
    if (!options.outDirectory.trim())
      throw new RecorderError('INVALID_EXPORT_PATH', 'The output folder is required.');
    const directory = resolve(options.outDirectory);
    await rejectSymlink(directory);
    try {
      await lstat(directory);
      throw new RecorderError(
        'EXPORT_EXISTS',
        'The output folder already exists. Choose a new folder.',
      );
    } catch (error) {
      if (!isNodeError(error, 'ENOENT')) throw error;
    }
    const { document } = await readGuide(this.guidePath);
    // Resolve every asset first. Missing or escaping assets cannot create a partial export.
    const images = [];
    for (const asset of document.assets) {
      const image = asset.src.startsWith('data:')
        ? readDataImage(asset.src)
        : await readImage(await resolveAssetPath(this.guidePath, asset.src));
      assertAssetMetadata(asset, image);
      images.push({ asset, image });
    }
    await mkdir(dirname(directory), { recursive: true });
    const staging = await mkdtemp(resolve(dirname(directory), `.${basename(directory)}.staging-`));
    try {
      if (!options.embed && images.length) await mkdir(resolve(staging, 'assets'));
      for (const { asset, image } of images) {
        if (options.embed) {
          asset.src = `data:${image.mimeType};base64,${image.bytes.toString('base64')}`;
        } else {
          asset.src = `assets/${image.hash}.${image.extension}`;
          try {
            await writeFile(resolve(staging, asset.src), image.bytes, { flag: 'wx' });
          } catch (error) {
            if (!isNodeError(error, 'EEXIST')) throw error;
          }
        }
      }
      await writeGuideAtomically(resolve(staging, 'guide.json'), document);
      // A second check avoids replacing an output created while assets were being read.
      try {
        await lstat(directory);
        throw new RecorderError(
          'EXPORT_EXISTS',
          'The output folder was created during this operation.',
        );
      } catch (error) {
        if (!isNodeError(error, 'ENOENT')) throw error;
      }
      await rename(staging, directory);
      return {
        directory,
        manifestPath: resolve(directory, 'guide.json'),
        assetCount: document.assets.length,
        stepCount: document.steps.length,
        embedded: options.embed ?? false,
      };
    } catch (error) {
      const cleanupPath = resolve(staging);
      const cleanupRelative = relative(resolve(dirname(directory)), cleanupPath);
      if (
        !isAbsolute(cleanupRelative) &&
        !cleanupRelative.startsWith(`..${sep}`) &&
        cleanupRelative !== '..' &&
        basename(cleanupPath).startsWith(`.${basename(directory)}.staging-`)
      ) {
        await rm(cleanupPath, { recursive: true, force: true });
      }
      throw error;
    }
  }
}
