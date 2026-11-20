import { describe, expect, it } from 'vitest';
import { createGuide, type GuideDocument } from '@interactive-learning/protocol';
import { createDiskGuard } from './disk';

const at = (guide: GuideDocument, updatedAt: string, title = guide.title): GuideDocument => ({
  ...guide,
  title,
  updatedAt,
});

/** A tutorial file that the editor writes and that another program may rewrite. */
function fakeDisk(initial: GuideDocument) {
  let stored = initial;
  const writes: string[] = [];
  return {
    read: async () => stored,
    write: async (guide: GuideDocument) => {
      stored = guide;
      writes.push(guide.title);
    },
    rewriteElsewhere: (guide: GuideDocument) => {
      stored = guide;
    },
    writes,
  };
}

describe('disk guard', () => {
  it('saves over the version the editor read or wrote', async () => {
    const disk = fakeDisk(at(createGuide('Draft'), '2026-01-01T00:00:00.000Z'));
    const guard = createDiskGuard(disk.read, disk.write);
    const opened = await guard.read();
    const first = at(opened, '2026-01-01T00:00:01.000Z', 'First');
    expect(await guard.write(first)).toBeNull();
    expect(await guard.write(at(first, '2026-01-01T00:00:02.000Z', 'Second'))).toBeNull();
    expect(disk.writes).toEqual(['First', 'Second']);
  });

  it('keeps a version written elsewhere instead of saving the copy over it', async () => {
    const disk = fakeDisk(at(createGuide('Draft'), '2026-01-01T00:00:00.000Z'));
    const guard = createDiskGuard(disk.read, disk.write);
    const opened = await guard.read();
    disk.rewriteElsewhere(at(opened, '2026-01-02T00:00:00.000Z', 'Captured again'));

    const kept = await guard.write(at(opened, '2026-01-01T00:00:01.000Z', 'Stale copy'));
    expect(kept?.title).toBe('Captured again');
    expect(disk.writes).toEqual([]);

    // Once the editor holds that version, its changes save again.
    expect(await guard.write(at(kept!, '2026-01-02T00:00:01.000Z', 'Edited'))).toBeNull();
    expect(disk.writes).toEqual(['Edited']);
  });

  it('tells once that the tutorial was rewritten elsewhere', async () => {
    const disk = fakeDisk(at(createGuide('Draft'), '2026-01-01T00:00:00.000Z'));
    const guard = createDiskGuard(disk.read, disk.write);
    const opened = await guard.read();
    expect(await guard.changed()).toBeNull();
    disk.rewriteElsewhere(at(opened, '2026-01-02T00:00:00.000Z', 'Captured again'));
    expect((await guard.changed())?.title).toBe('Captured again');
    expect(await guard.changed()).toBeNull();
  });
});
