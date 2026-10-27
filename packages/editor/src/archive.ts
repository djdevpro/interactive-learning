import {
  readZip,
  validateGuide,
  type GuideDocument,
  type ZipEntry,
} from '@interactive-learning/protocol';

const extensions: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeBase64(data: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < data.length; index += 0x8000) {
    binary += String.fromCharCode(...data.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

/**
 * Files of the exported archive. Screenshots kept as data URIs during the recording become files
 * in `assets/`, and `guide.json` points to them with relative paths, so the player loads a small
 * JSON and then each image on its own.
 */
export function guideArchive(guide: GuideDocument): ZipEntry[] {
  const images: ZipEntry[] = [];
  const assets = guide.assets.map((asset, index) => {
    const match = /^data:(image\/(?:png|jpeg|webp));base64,(.*)$/i.exec(asset.src);
    if (!match?.[1] || match[2] === undefined) return asset;
    const name = `assets/${String(index + 1).padStart(3, '0')}.${extensions[match[1].toLowerCase()]}`;
    images.push({ name, data: decodeBase64(match[2]) });
    return { ...asset, src: name };
  });
  const json = JSON.stringify({ ...guide, assets }, null, 2);
  return [{ name: 'guide.json', data: new TextEncoder().encode(`${json}\n`) }, ...images];
}

function parse(data: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(data));
  } catch {
    throw new Error('guide.json is not valid JSON.');
  }
}

/**
 * The reverse of `guideArchive`: the images of the archive become data URIs again, so the guide
 * can be edited and exported like a recorded one. `guide.json` may sit in a folder of the archive.
 */
export function guideFromArchive(entries: readonly ZipEntry[]): GuideDocument {
  const manifest = entries
    .filter(({ name }) => name === 'guide.json' || name.endsWith('/guide.json'))
    .sort((a, b) => a.name.length - b.name.length)[0];
  if (!manifest) throw new Error('This archive has no guide.json.');
  const folder = manifest.name.slice(0, -'guide.json'.length);
  const files = new Map(entries.map((entry) => [entry.name, entry.data]));
  const raw = parse(manifest.data) as { assets?: unknown };
  const assets = Array.isArray(raw.assets) ? raw.assets : [];
  return validateGuide({
    ...raw,
    assets: assets.map((asset: { src?: unknown; mimeType?: unknown }) => {
      if (typeof asset?.src !== 'string' || asset.src.startsWith('data:')) return asset;
      const path = asset.src.replace(/^(\.\/)+/, '');
      const data = path.split('/').includes('..') ? undefined : files.get(folder + path);
      if (!data) throw new Error(`The image ${asset.src} is missing from the archive.`);
      return { ...asset, src: `data:${String(asset.mimeType)};base64,${encodeBase64(data)}` };
    }),
  });
}

/** A ZIP exported by the extension or the command line, or a guide.json with embedded images. */
export async function guideFromFile(file: Blob & { name: string }): Promise<GuideDocument> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (/\.json$/i.test(file.name)) {
    const guide = validateGuide(parse(bytes));
    if (guide.assets.some((asset) => !asset.src.startsWith('data:'))) {
      throw new Error('This guide.json points to separate images. Import the ZIP that holds them.');
    }
    return guide;
  }
  return guideFromArchive(await readZip(bytes));
}
