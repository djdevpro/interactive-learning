import { describe, expect, it } from 'vitest';
import { crc32, createGuide, createZip, validateGuide } from '@interactive-learning/protocol';
import { guideArchive, guideFromArchive, guideFromFile } from './guide-archive';

const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aR1UAAAAASUVORK5CYII=';

/** Reads the central directory, the way unzip tools do. */
function listZip(archive: Uint8Array): { name: string; size: number; crc: number }[] {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const end = archive.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let position = view.getUint32(end + 16, true);
  const entries = [];
  for (let index = 0; index < count; index++) {
    expect(view.getUint32(position, true)).toBe(0x02014b50);
    const nameLength = view.getUint16(position + 28, true);
    entries.push({
      name: new TextDecoder().decode(archive.subarray(position + 46, position + 46 + nameLength)),
      size: view.getUint32(position + 24, true),
      crc: view.getUint32(position + 16, true),
    });
    position += 46 + nameLength;
  }
  return entries;
}

describe('guide archive', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('hello'))).toBe(0x3610a686);
  });

  it('writes a readable ZIP with a JSON file and its screenshots', () => {
    const guide = createGuide('Archive');
    guide.assets.push({
      id: 'asset-1',
      src: `data:image/png;base64,${png}`,
      mimeType: 'image/png',
      width: 1,
      height: 1,
    });
    guide.steps.push({
      id: 'step-1',
      title: 'Open',
      description: '',
      durationMs: 2500,
      assetId: 'asset-1',
      annotations: [],
    });

    const files = guideArchive(validateGuide(guide));
    const entries = listZip(createZip(files));

    expect(entries.map(({ name }) => name)).toEqual(['guide.json', 'assets/001.png']);
    const json = JSON.parse(new TextDecoder().decode(files[0]?.data));
    expect(json.assets[0].src).toBe('assets/001.png');
    expect(validateGuide(json).steps[0]?.assetId).toBe('asset-1');
    expect(entries[1]?.size).toBe(files[1]?.data.length);
    expect(entries[1]?.crc).toBe(crc32(files[1]!.data));
  });
});

describe('guide import', () => {
  function recorded() {
    const guide = createGuide('Imported');
    guide.assets.push({
      id: 'asset-1',
      src: `data:image/png;base64,${png}`,
      mimeType: 'image/png',
      width: 1,
      height: 1,
    });
    guide.steps.push({
      id: 'step-1',
      title: 'Open',
      description: '',
      durationMs: 2500,
      assetId: 'asset-1',
      annotations: [{ id: 'marker-1', x: 0.5, y: 0.5, title: 'Here', body: '' }],
      source: { capturedAt: new Date().toISOString(), url: 'https://demo.example/projects' },
    });
    return validateGuide(guide);
  }

  it('reads back an exported archive with its screenshots embedded', async () => {
    const guide = recorded();
    const file = Object.assign(new Blob([createZip(guideArchive(guide))]), { name: 'guide.zip' });
    expect(await guideFromFile(file)).toEqual(guide);
  });

  it('finds guide.json inside a folder of the archive', () => {
    const files = guideArchive(recorded()).map((entry) => ({
      ...entry,
      name: `sign-up/${entry.name}`,
    }));
    expect(guideFromArchive(files).assets[0]?.src).toBe(`data:image/png;base64,${png}`);
  });

  it('names a missing image', () => {
    const [manifest] = guideArchive(recorded());
    expect(() => guideFromArchive([manifest!])).toThrow('assets/001.png is missing');
  });

  it('asks for the ZIP when a JSON file points to separate images', async () => {
    const [manifest] = guideArchive(recorded());
    const file = Object.assign(new Blob([manifest!.data as Uint8Array<ArrayBuffer>]), {
      name: 'guide.json',
    });
    await expect(guideFromFile(file)).rejects.toThrow('Import the ZIP');
  });
});
