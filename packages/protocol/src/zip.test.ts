import { describe, expect, it } from 'vitest';
import { crc32, createZip, readZip } from './zip';

const encoder = new TextEncoder();

async function deflate(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** One deflated entry, as most archive tools write it. */
async function deflatedZip(name: string, data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const packed = await deflate(data);
  const nameBytes = encoder.encode(name);
  const local = new Uint8Array(30 + nameBytes.length + packed.length);
  const header = new DataView(local.buffer);
  header.setUint32(0, 0x04034b50, true);
  header.setUint16(8, 8, true);
  header.setUint32(14, crc32(data), true);
  header.setUint32(18, packed.length, true);
  header.setUint32(22, data.length, true);
  header.setUint16(26, nameBytes.length, true);
  local.set(nameBytes, 30);
  local.set(packed, 30 + nameBytes.length);
  const central = new Uint8Array(46 + nameBytes.length);
  const record = new DataView(central.buffer);
  record.setUint32(0, 0x02014b50, true);
  record.setUint16(10, 8, true);
  record.setUint32(16, crc32(data), true);
  record.setUint32(20, packed.length, true);
  record.setUint32(24, data.length, true);
  record.setUint16(28, nameBytes.length, true);
  central.set(nameBytes, 46);
  const end = new Uint8Array(22);
  const footer = new DataView(end.buffer);
  footer.setUint32(0, 0x06054b50, true);
  footer.setUint16(8, 1, true);
  footer.setUint16(10, 1, true);
  footer.setUint32(12, central.length, true);
  footer.setUint32(16, local.length, true);
  const archive = new Uint8Array(local.length + central.length + end.length);
  archive.set(local);
  archive.set(central, local.length);
  archive.set(end, local.length + central.length);
  return archive;
}

describe('zip archives', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(encoder.encode('hello'))).toBe(0x3610a686);
  });

  it('reads back what it writes', async () => {
    const entries = [
      { name: 'guide.json', data: encoder.encode('{"title":"Écran"}') },
      { name: 'assets/001.png', data: new Uint8Array([137, 80, 78, 71]) },
    ];
    const read = await readZip(createZip(entries));
    expect(read.map(({ name }) => name)).toEqual(['guide.json', 'assets/001.png']);
    expect(new TextDecoder().decode(read[0]?.data)).toBe('{"title":"Écran"}');
    expect([...read[1]!.data]).toEqual([137, 80, 78, 71]);
  });

  it('inflates deflated entries', async () => {
    const text = encoder.encode('step '.repeat(200));
    const [entry] = await readZip(await deflatedZip('sign-up/guide.json', text));
    expect(entry?.name).toBe('sign-up/guide.json');
    expect(new TextDecoder().decode(entry?.data)).toBe('step '.repeat(200));
  });

  it('refuses a file that is not an archive or is damaged', async () => {
    await expect(readZip(encoder.encode('not a zip at all, just text'))).rejects.toThrow(
      'not a ZIP',
    );
    const archive = createZip([{ name: 'guide.json', data: encoder.encode('{}') }]);
    // The data follows the 30-byte local header and the 10-byte name.
    archive[40] = 0x5b;
    await expect(readZip(archive)).rejects.toThrow('damaged');
  });
});
