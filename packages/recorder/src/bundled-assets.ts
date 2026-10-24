import { access, cp, lstat, mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isNodeError, RecorderError } from './errors.js';

export function bundledAssetPath(kind: 'skill' | 'extension'): string {
  const base = dirname(fileURLToPath(import.meta.url));
  return kind === 'skill' ? resolve(base, 'skill') : resolve(base, 'extension', 'chrome-mv3');
}

export async function assetAvailable(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function installSkill(sourceDirectory: string, outDirectory: string): Promise<string> {
  const destination = resolve(outDirectory);
  if (!(await assetAvailable(resolve(sourceDirectory, 'SKILL.md')))) {
    throw new RecorderError('SKILL_NOT_FOUND', 'Le skill n’est pas présent dans la distribution.');
  }
  const assertAbsent = async () => {
    try {
      await lstat(destination);
      throw new RecorderError(
        'DESTINATION_EXISTS',
        'Le dossier de destination existe déjà. Aucun fichier ne sera remplacé.',
      );
    } catch (error) {
      if (!isNodeError(error, 'ENOENT')) throw error;
    }
  };
  await assertAbsent();
  await mkdir(dirname(destination), { recursive: true });
  const staging = await mkdtemp(resolve(dirname(destination), `.${basename(destination)}.skill-`));
  try {
    await cp(sourceDirectory, staging, { recursive: true, force: false, errorOnExist: true });
    await assertAbsent();
    await rename(staging, destination);
    return destination;
  } catch (error) {
    const cleanup = resolve(staging);
    const fromParent = relative(resolve(dirname(destination)), cleanup);
    if (
      !isAbsolute(fromParent) &&
      fromParent !== '..' &&
      !fromParent.startsWith(`..${sep}`) &&
      basename(cleanup).startsWith(`.${basename(destination)}.skill-`)
    ) {
      await rm(cleanup, { recursive: true, force: true });
    }
    throw error;
  }
}
