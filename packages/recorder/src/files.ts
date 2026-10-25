import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import {
  copyFile,
  link,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  unlink,
} from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { validateGuide } from '@interactive-learning/protocol';
import type { GuideDocument } from '@interactive-learning/protocol';
import { isNodeError, RecorderError } from './errors.js';

export function resolveGuidePath(input: string): string {
  if (!input || extname(input).toLowerCase() !== '.json') {
    throw new RecorderError('INVALID_GUIDE_PATH', 'The guide must be a .json file.');
  }
  return resolve(input);
}

export async function rejectSymlink(path: string): Promise<void> {
  try {
    if ((await lstat(path)).isSymbolicLink()) {
      throw new RecorderError('UNSAFE_PATH', 'A symbolic link cannot be used as a destination.');
    }
  } catch (error) {
    if (!isNodeError(error, 'ENOENT')) throw error;
  }
}

export async function readGuide(path: string): Promise<{ document: GuideDocument; raw: string }> {
  await rejectSymlink(path);
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (error) {
    if (isNodeError(error, 'ENOENT')) {
      throw new RecorderError('GUIDE_NOT_FOUND', 'The guide file was not found.', {
        cause: error,
      });
    }
    throw error;
  }
  try {
    return { document: validateGuide(JSON.parse(raw)), raw };
  } catch (error) {
    throw new RecorderError('INVALID_GUIDE', 'The file does not contain a valid guide.', {
      cause: error,
    });
  }
}

export async function withGuideLock<T>(path: string, action: () => Promise<T>): Promise<T> {
  await mkdir(dirname(path), { recursive: true });
  await rejectSymlink(path);
  const lockPath = resolve(dirname(path), `.${basename(path)}.lock`);
  let handle;
  try {
    handle = await open(lockPath, 'wx');
  } catch (error) {
    if (isNodeError(error, 'EEXIST')) {
      throw new RecorderError(
        'GUIDE_BUSY',
        'Another operation is using this guide. Try again once it ends.',
      );
    }
    throw error;
  }
  try {
    await handle.writeFile(
      JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
    );
    return await action();
  } finally {
    await handle.close();
    await unlink(lockPath).catch(() => undefined);
  }
}

export async function writeGuideAtomically(
  path: string,
  document: GuideDocument,
  expectedRaw?: string,
): Promise<void> {
  const validated = validateGuide(document);
  const tempPath = resolve(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  const handle = await open(tempPath, 'wx');
  try {
    await handle.writeFile(`${JSON.stringify(validated, null, 2)}\n`, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rejectSymlink(path);
    if (expectedRaw === undefined) {
      // A hard link is an atomic create-if-absent on the same filesystem.
      try {
        try {
          await link(tempPath, path);
        } catch (error) {
          // Restricted Windows filesystems may disallow hard links. Exclusive copy
          // still guarantees that an existing document can never be replaced.
          if (!['EPERM', 'EACCES', 'ENOTSUP', 'EXDEV'].some((code) => isNodeError(error, code)))
            throw error;
          await copyFile(tempPath, path, constants.COPYFILE_EXCL);
        }
      } catch (error) {
        if (isNodeError(error, 'EEXIST')) {
          throw new RecorderError(
            'GUIDE_EXISTS',
            'The destination already exists and will not be replaced.',
          );
        }
        throw error;
      }
    } else {
      const current = await readFile(path, 'utf8');
      if (current !== expectedRaw) {
        throw new RecorderError(
          'GUIDE_CHANGED',
          'The guide changed during this operation. Run the command again.',
        );
      }
      await rename(tempPath, path);
    }
  } finally {
    await unlink(tempPath).catch(() => undefined);
  }
}

export async function resolveAssetPath(guidePath: string, src: string): Promise<string> {
  if (
    !src ||
    isAbsolute(src) ||
    src.includes('\\') ||
    src.includes('\0') ||
    /^[a-z][a-z\d+.-]*:/i.test(src) ||
    src.split('/').some((part) => part === '..')
  ) {
    throw new RecorderError('UNSAFE_ASSET_PATH', 'Images must stay inside the guide folder.');
  }
  const root = await realpath(dirname(guidePath));
  let target: string;
  try {
    target = await realpath(resolve(root, src));
  } catch (error) {
    if (isNodeError(error, 'ENOENT'))
      throw new RecorderError('ASSET_NOT_FOUND', 'An image of the guide was not found.');
    throw error;
  }
  const fromRoot = relative(root, target);
  if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw new RecorderError('UNSAFE_ASSET_PATH', 'An image points outside the guide folder.');
  }
  if (!(await lstat(target)).isFile())
    throw new RecorderError('INVALID_ASSET', 'An image must be a file.');
  return target;
}
