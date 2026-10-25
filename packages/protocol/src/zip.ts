export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = (crcTable[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * A ZIP archive without compression. Screenshots are already compressed, so storing them keeps
 * the archive the same size and the writer small. Names are UTF-8.
 */
export function createZip(
  entries: readonly ZipEntry[],
  date = new Date(),
): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const local = new Uint8Array(30 + name.length);
    const header = new DataView(local.buffer);
    header.setUint32(0, 0x04034b50, true);
    header.setUint16(4, 20, true);
    header.setUint16(6, 0x0800, true);
    header.setUint16(10, time, true);
    header.setUint16(12, day, true);
    header.setUint32(14, crc, true);
    header.setUint32(18, entry.data.length, true);
    header.setUint32(22, entry.data.length, true);
    header.setUint16(26, name.length, true);
    local.set(name, 30);

    const central = new Uint8Array(46 + name.length);
    const record = new DataView(central.buffer);
    record.setUint32(0, 0x02014b50, true);
    record.setUint16(4, 20, true);
    record.setUint16(6, 20, true);
    record.setUint16(8, 0x0800, true);
    record.setUint16(12, time, true);
    record.setUint16(14, day, true);
    record.setUint32(16, crc, true);
    record.setUint32(20, entry.data.length, true);
    record.setUint32(24, entry.data.length, true);
    record.setUint16(28, name.length, true);
    record.setUint32(42, offset, true);
    central.set(name, 46);

    locals.push(local, entry.data);
    centrals.push(central);
    offset += local.length + entry.data.length;
  }

  const directorySize = centrals.reduce((total, part) => total + part.length, 0);
  const end = new Uint8Array(22);
  const footer = new DataView(end.buffer);
  footer.setUint32(0, 0x06054b50, true);
  footer.setUint16(8, entries.length, true);
  footer.setUint16(10, entries.length, true);
  footer.setUint32(12, directorySize, true);
  footer.setUint32(16, offset, true);

  const archive = new Uint8Array(offset + directorySize + end.length);
  let position = 0;
  for (const part of [...locals, ...centrals, end]) {
    archive.set(part, position);
    position += part.length;
  }
  return archive;
}

/** Guide archives stay far below this; it stops an archive that inflates without end. */
const MAX_ARCHIVE_BYTES = 200 * 1024 * 1024;

async function inflate(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Reads a ZIP archive from its central directory. Entries are stored or deflated, the two methods
 * archive tools use; folders are skipped and encrypted entries are refused.
 */
export async function readZip(bytes: Uint8Array): Promise<ZipEntry[]> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  // The end record is the last 22 bytes, followed by a comment of at most 65,535 bytes.
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65_557); offset--) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      end = offset;
      break;
    }
  }
  if (end < 0) throw new Error('This file is not a ZIP archive.');
  const decoder = new TextDecoder();
  const count = view.getUint16(end + 10, true);
  let position = view.getUint32(end + 16, true);
  let total = 0;
  const entries: ZipEntry[] = [];
  for (let index = 0; index < count; index++) {
    if (position + 46 > bytes.length || view.getUint32(position, true) !== 0x02014b50) {
      throw new Error('This ZIP archive is damaged.');
    }
    const flags = view.getUint16(position + 8, true);
    const method = view.getUint16(position + 10, true);
    const crc = view.getUint32(position + 16, true);
    const compressedSize = view.getUint32(position + 20, true);
    const size = view.getUint32(position + 24, true);
    const nameLength = view.getUint16(position + 28, true);
    const local = view.getUint32(position + 42, true);
    const name = decoder.decode(bytes.subarray(position + 46, position + 46 + nameLength));
    position +=
      46 + nameLength + view.getUint16(position + 30, true) + view.getUint16(position + 32, true);
    if (name.endsWith('/')) continue;
    if (flags & 1) throw new Error(`${name} is encrypted.`);
    total += size;
    if (total > MAX_ARCHIVE_BYTES) throw new Error('This ZIP archive is too large.');
    if (local + 30 > bytes.length || view.getUint32(local, true) !== 0x04034b50) {
      throw new Error('This ZIP archive is damaged.');
    }
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const raw = bytes.slice(start, start + compressedSize);
    if (method !== 0 && method !== 8) throw new Error(`${name} uses an unsupported compression.`);
    const data = method === 0 ? raw : await inflate(raw);
    if (data.length !== size || crc32(data) !== crc) throw new Error(`${name} is damaged.`);
    entries.push({ name, data });
  }
  return entries;
}
