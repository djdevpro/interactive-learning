import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, relative, resolve, sep } from 'node:path';
import { RecordingSession } from '../src/recording-session.js';
import { GuideExporter } from '../src/guide-exporter.js';
import { runCli } from '../src/cli-command.js';
import { installSkill } from '../src/bundled-assets.js';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aR1UAAAAASUVORK5CYII=',
  'base64',
);
let directory: string;
let imagePath: string;
let guidePath: string;

beforeEach(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'interactive-learning-recorder-'));
  imagePath = resolve(directory, 'private-original-name.png');
  guidePath = resolve(directory, 'source', 'guide.json');
  await writeFile(imagePath, png);
});

afterEach(async () => {
  const cleanup = resolve(directory);
  const fromTemp = relative(resolve(tmpdir()), cleanup);
  if (
    isAbsolute(fromTemp) ||
    fromTemp === '..' ||
    fromTemp.startsWith(`..${sep}`) ||
    !basename(cleanup).startsWith('interactive-learning-recorder-')
  ) {
    throw new Error('Refusing to clean a path outside the test directory.');
  }
  await rm(cleanup, { recursive: true, force: true });
});

describe('RecordingSession', () => {
  it('imports real image dimensions, keeps relative assets, annotates and deduplicates captures', async () => {
    const session = await RecordingSession.create({
      filePath: guidePath,
      title: 'Inscription',
      description: 'Guide public',
    });
    const step = await session.addCapture({
      imagePath,
      title: 'Ajouter',
      cursor: { x: 0.75, y: 0.25, action: 'click' },
    });
    await session.addAnnotation(step.id, {
      x: 0.7,
      y: 0.2,
      title: 'Nouveau dossier',
      body: 'Commencez ici.',
    });
    await session.addCapture({ imagePath, title: 'Confirmer' });

    const guide = await session.validate();
    expect(guide.steps).toHaveLength(2);
    expect(guide.assets).toHaveLength(1);
    expect(guide.assets[0]).toMatchObject({ width: 1, height: 1, mimeType: 'image/png' });
    expect(guide.assets[0].src).toMatch(/^assets\/[a-f0-9]{64}\.png$/);
    expect(guide.steps[0].annotations[0]).toMatchObject({ title: 'Nouveau dossier', x: 0.7 });
    const manifest = await readFile(guidePath, 'utf8');
    expect(manifest).not.toContain(directory);
    expect(manifest).not.toContain('private-original-name');
  });

  it('leaves the manifest intact when an image does not exist', async () => {
    const session = await RecordingSession.create({ filePath: guidePath, title: 'Guide' });
    const before = await readFile(guidePath, 'utf8');
    await expect(
      session.addCapture({ imagePath: resolve(directory, 'missing.png') }),
    ).rejects.toMatchObject({ code: 'IMAGE_NOT_FOUND' });
    expect(await readFile(guidePath, 'utf8')).toBe(before);
    expect(await readdir(resolve(directory, 'source'))).toEqual(['guide.json']);
  });

  it('rejects invalid coordinates before writing a capture', async () => {
    const session = await RecordingSession.create({ filePath: guidePath, title: 'Guide' });
    await expect(
      session.addCapture({ imagePath, cursor: { x: 1.1, y: 0.5 } }),
    ).rejects.toMatchObject({ code: 'INVALID_COORDINATES' });
    expect((await session.read()).steps).toHaveLength(0);
  });

  it('does not replace an existing arbitrary JSON document', async () => {
    await mkdir(resolve(directory, 'source'));
    await writeFile(guidePath, '{"important":"keep me"}');
    await expect(
      RecordingSession.create({ filePath: guidePath, title: 'Guide' }),
    ).rejects.toMatchObject({ code: 'GUIDE_EXISTS' });
    await expect(new RecordingSession(guidePath).addCapture({ imagePath })).rejects.toMatchObject({
      code: 'INVALID_GUIDE',
    });
    expect(await readFile(guidePath, 'utf8')).toBe('{"important":"keep me"}');
  });

  it('preserves another writer lock and refuses a concurrent mutation', async () => {
    const session = await RecordingSession.create({ filePath: guidePath, title: 'Guide' });
    const lockPath = resolve(directory, 'source', '.guide.json.lock');
    await writeFile(lockPath, 'another process');
    await expect(session.addCapture({ imagePath })).rejects.toMatchObject({ code: 'GUIDE_BUSY' });
    expect(await readFile(lockPath, 'utf8')).toBe('another process');
    expect((await session.read()).steps).toHaveLength(0);
  });

  it('detects inconsistent image metadata and refuses traversal before export', async () => {
    const session = await RecordingSession.create({ filePath: guidePath, title: 'Guide' });
    await session.addCapture({ imagePath });
    const guide = await session.read();
    guide.assets[0].width = 10;
    await writeFile(guidePath, JSON.stringify(guide));
    await expect(session.validate()).rejects.toMatchObject({ code: 'ASSET_METADATA_MISMATCH' });
    guide.assets[0].src = '../private-original-name.png';
    guide.assets[0].width = 1;
    await writeFile(guidePath, JSON.stringify(guide));
    await expect(
      new GuideExporter(guidePath).export({ outDirectory: resolve(directory, 'unsafe') }),
    ).rejects.toMatchObject({ code: 'INVALID_GUIDE' });
    expect(await readdir(directory)).not.toContain('unsafe');
  });

  it('removes query strings and credentials from optional source URLs', async () => {
    const session = await RecordingSession.create({ filePath: guidePath, title: 'Guide' });
    await session.addCapture({
      imagePath,
      source: {
        capturedAt: new Date().toISOString(),
        url: 'https://user:password@example.com/form?token=secret#private',
      },
    });
    expect((await session.read()).steps[0].source?.url).toBe('https://example.com/form');
  });

  it('replaces a capture preserving lesson content and requests annotation review', async () => {
    const session = await RecordingSession.create({ filePath: guidePath, title: 'Guide' });
    const step = await session.addCapture({
      imagePath,
      title: 'Ajouter',
      description: 'Texte à garder',
      durationMs: 5000,
      cursor: { x: 0.7, y: 0.3 },
      source: { capturedAt: new Date().toISOString(), viewport: { width: 1200, height: 800 } },
    });
    const annotation = await session.addAnnotation(step.id, { x: 0.7, y: 0.3, title: 'Action' });
    const replacement = resolve(directory, 'replacement.png');
    await writeFile(
      replacement,
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVQIHWP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
        'base64',
      ),
    );
    const result = await session.replaceCapture(step.id, { imagePath: replacement });
    expect(result).toMatchObject({
      annotationsRequireReview: true,
      step: {
        id: step.id,
        title: 'Ajouter',
        description: 'Texte à garder',
        durationMs: 5000,
        annotations: [annotation],
      },
    });
    expect(result.step.assetId).not.toBe(step.assetId);
    expect(result.step.cursor).toBeUndefined();
    expect(result.step.source).toBeUndefined();
    expect((await session.validate()).assets).toHaveLength(1);
    const before = await readFile(guidePath, 'utf8');
    await expect(
      session.replaceCapture(step.id, { imagePath: resolve(directory, 'missing.png') }),
    ).rejects.toMatchObject({ code: 'IMAGE_NOT_FOUND' });
    await expect(session.replaceCapture('unknown-step', { imagePath })).rejects.toMatchObject({
      code: 'STEP_NOT_FOUND',
    });
    expect(await readFile(guidePath, 'utf8')).toBe(before);
  });
});

describe('GuideExporter', () => {
  it('exports portable images and embedded guides without changing the source', async () => {
    const session = await RecordingSession.create({ filePath: guidePath, title: 'Guide' });
    await session.addCapture({ imagePath });
    const before = await readFile(guidePath, 'utf8');
    const exporter = new GuideExporter(guidePath);
    const portable = await exporter.export({ outDirectory: resolve(directory, 'portable') });
    const moved = resolve(directory, 'moved');
    await rename(portable.directory, moved);
    expect(
      (await new RecordingSession(resolve(moved, 'guide.json')).validate()).assets,
    ).toHaveLength(1);
    const embedded = await exporter.export({
      outDirectory: resolve(directory, 'embedded'),
      embed: true,
    });
    const embeddedSession = new RecordingSession(embedded.manifestPath);
    expect((await embeddedSession.validate()).assets[0].src).toBe(
      `data:image/png;base64,${png.toString('base64')}`,
    );
    expect(await readdir(embedded.directory)).toEqual(['guide.json']);
    await new GuideExporter(embedded.manifestPath).export({
      outDirectory: resolve(directory, 'unembedded'),
    });
    expect(
      (await new RecordingSession(resolve(directory, 'unembedded', 'guide.json')).validate()).steps,
    ).toHaveLength(1);
    expect(await readFile(guidePath, 'utf8')).toBe(before);
  });

  it('refuses to overwrite an output directory or leave a partial export', async () => {
    const session = await RecordingSession.create({ filePath: guidePath, title: 'Guide' });
    await session.addCapture({ imagePath });
    const output = resolve(directory, 'output');
    await mkdir(output);
    await writeFile(resolve(output, 'keep.txt'), 'Keep');
    await expect(
      new GuideExporter(guidePath).export({ outDirectory: output }),
    ).rejects.toMatchObject({ code: 'EXPORT_EXISTS' });
    expect(await readFile(resolve(output, 'keep.txt'), 'utf8')).toBe('Keep');
    const guide = await session.read();
    await rm(resolve(directory, 'source', guide.assets[0].src));
    await expect(
      new GuideExporter(guidePath).export({ outDirectory: resolve(directory, 'broken') }),
    ).rejects.toMatchObject({ code: 'ASSET_NOT_FOUND' });
    expect(
      (await readdir(directory)).some((name) => name.includes('staging') || name === 'broken'),
    ).toBe(false);
  });
});

describe('CLI and bundled assets', () => {
  it('installs a skill into an explicit new folder and preserves existing folders', async () => {
    const source = resolve(directory, 'skill-source');
    const destination = resolve(directory, 'project', '.agents', 'skills', 'interactive-learning');
    await mkdir(source);
    await writeFile(resolve(source, 'SKILL.md'), '# Skill');
    await installSkill(source, destination);
    expect(await readFile(resolve(destination, 'SKILL.md'), 'utf8')).toBe('# Skill');
    await writeFile(resolve(destination, 'SKILL.md'), '# Customized');
    await expect(installSkill(source, destination)).rejects.toMatchObject({
      code: 'DESTINATION_EXISTS',
    });
    expect(await readFile(resolve(destination, 'SKILL.md'), 'utf8')).toBe('# Customized');
  });

  it('provides a machine-readable creation, capture and validation workflow', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const io = {
      stdout: (line: string) => stdout.push(line),
      stderr: (line: string) => stderr.push(line),
    };
    expect(await runCli(['create', '--title', 'CLI', '--out', guidePath], io)).toBe(0);
    expect(
      await runCli(
        ['capture', 'add', '--guide', guidePath, '--image', imagePath, '--x', '0.4', '--y', '0.6'],
        io,
      ),
    ).toBe(0);
    const capture = JSON.parse(stdout[1]);
    expect(capture.stepId).toBeTypeOf('string');
    expect(
      await runCli(
        [
          'annotate',
          '--guide',
          guidePath,
          '--step',
          capture.stepId,
          '--x',
          '0.4',
          '--y',
          '0.6',
          '--title',
          'Action',
        ],
        io,
      ),
    ).toBe(0);
    expect(await runCli(['validate', '--guide', guidePath], io)).toBe(0);
    expect(JSON.parse(stdout[3])).toMatchObject({ ok: true, valid: true, stepCount: 1 });
    expect(
      await runCli(
        [
          'capture',
          'replace',
          '--guide',
          guidePath,
          '--step',
          capture.stepId,
          '--image',
          imagePath,
        ],
        io,
      ),
    ).toBe(0);
    expect(JSON.parse(stdout[4])).toMatchObject({
      ok: true,
      command: 'capture.replace',
      annotationsRequireReview: true,
      cursorCleared: true,
    });
    const before = await readFile(guidePath, 'utf8');
    expect(
      await runCli(
        ['capture', 'add', '--guide', guidePath, '--image', imagePath, '--x', '0.4'],
        io,
      ),
    ).toBe(1);
    expect(JSON.parse(stderr[0])).toMatchObject({
      ok: false,
      error: { code: 'INVALID_COORDINATES' },
    });
    expect(await readFile(guidePath, 'utf8')).toBe(before);
  });
});
