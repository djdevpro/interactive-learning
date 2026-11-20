import type { GuideDocument } from '@interactive-learning/protocol';

/**
 * The tutorial on the disk, as this editor last read or wrote it.
 *
 * An agent or a script may rewrite a tutorial while it is open in the editor, such as a test that
 * captures its screens again. The editor used to keep its own copy and save it over the new one at
 * the next change, and closing it then removed the screenshots that only the new version used.
 * Every write of a guide gives it a new `updatedAt`: before each save, the guard reads the disk
 * again, and a version it does not know is kept and handed back instead of being overwritten.
 */
export function createDiskGuard(
  read: () => Promise<GuideDocument>,
  write: (guide: GuideDocument) => Promise<void>,
) {
  /** `updatedAt` of the version this editor last read or wrote. */
  let known: string | null = null;

  /** The version on the disk when it is not the one this editor knows, once. */
  async function changed(): Promise<GuideDocument | null> {
    const disk = await read().catch(() => null);
    if (!disk || known === null || disk.updatedAt === known) return null;
    known = disk.updatedAt;
    return disk;
  }

  return {
    async read(): Promise<GuideDocument> {
      const guide = await read();
      known = guide.updatedAt;
      return guide;
    },

    /** Writes `guide`, unless the disk holds a version written elsewhere: that one comes back. */
    async write(guide: GuideDocument): Promise<GuideDocument | null> {
      const elsewhere = await changed();
      if (elsewhere) return elsewhere;
      await write(guide);
      known = guide.updatedAt;
      return null;
    },

    changed,
  };
}
