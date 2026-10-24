import { lstat, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
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

export class GuideExporter {
  readonly guidePath: string;

  constructor(guidePath: string) {
    this.guidePath = resolveGuidePath(guidePath);
  }

  async export(options: ExportGuideOptions): Promise<ExportGuideResult> {
    if (!options.outDirectory.trim())
      throw new RecorderError('INVALID_EXPORT_PATH', 'Le dossier de sortie est obligatoire.');
    const directory = resolve(options.outDirectory);
    await rejectSymlink(directory);
    try {
      await lstat(directory);
      throw new RecorderError(
        'EXPORT_EXISTS',
        'Le dossier de sortie existe déjà. Choisissez un nouveau dossier.',
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
          'Le dossier de sortie a été créé pendant cette opération.',
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
