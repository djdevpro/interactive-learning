import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, resolve } from 'node:path';
import { RecordingSession } from '../src/recording-session.js';
import { startStudio, type Studio } from '../src/studio-server.js';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aR1UAAAAASUVORK5CYII=',
  'base64',
);
// A 2 x 1 PNG, so it is a different image from the first one.
const wide = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAADklEQVR4nGP4z8AAQv8BD/kD/YURmXYAAAAASUVORK5CYII=',
  'base64',
);

let directory: string;
let guidePath: string;
let studio: Studio;
let origin: string;
let token: string;
let cookie: string;

beforeEach(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'interactive-learning-studio-'));
  const app = resolve(directory, 'app');
  await mkdir(app);
  await writeFile(resolve(app, 'index.html'), '<!doctype html><head></head><body>Studio</body>');
  await writeFile(resolve(app, 'main.js'), 'console.log(1)');
  guidePath = resolve(directory, 'guides', 'demo', 'guide.json');
  await writeFile(resolve(directory, 'capture.png'), png);
  const session = await RecordingSession.create({ filePath: guidePath, title: 'Demo' });
  await session.addCapture({ imagePath: resolve(directory, 'capture.png'), title: 'Open' });
  studio = await startStudio({ guidePath, appDirectory: app });
  const url = new URL(studio.url);
  origin = url.origin;
  token = url.searchParams.get('token')!;
  cookie = `il_studio=${token}`;
});

afterEach(async () => {
  await studio.close();
  if (!basename(directory).startsWith('interactive-learning-studio-'))
    throw new Error('Refusing to clean a path outside the test directory.');
  await rm(directory, { recursive: true, force: true });
});

const api = (path: string, init: RequestInit = {}) =>
  fetch(`${origin}${path}`, {
    ...init,
    headers: { 'x-studio-token': token, ...(init.headers as Record<string, string>) },
  });

describe('studio server', () => {
  it('opens only with the token of this run, then keeps it in a cookie', async () => {
    expect((await fetch(`${origin}/`)).status).toBe(403);
    const opened = await fetch(studio.url, { redirect: 'manual' });
    expect(opened.status).toBe(303);
    expect(opened.headers.get('set-cookie')).toContain('HttpOnly; SameSite=Strict');
    const page = await fetch(`${origin}/`, { headers: { cookie } });
    expect(await page.text()).toContain(`<meta name="il-studio-token" content="${token}" />`);
    expect((await fetch(`${origin}/main.js`)).status).toBe(200);
    expect((await fetch(`${origin}/api/guide`)).status).toBe(403);
  });

  it('refuses another host name', async () => {
    const status = await new Promise<number>((resolveStatus, reject) => {
      const request = httpRequest(
        `${origin}/api/guide`,
        { headers: { host: 'attacker.test', 'x-studio-token': token } },
        (response) => resolveStatus(response.statusCode ?? 0),
      );
      request.on('error', reject);
      request.end();
    });
    expect(status).toBe(403);
  });

  it('saves the guide in place and refuses a version that changed on disk', async () => {
    const loaded = await (await api('/api/guide')).json();
    expect(loaded.file).toMatch(/guide\.json$/);
    const guide = { ...loaded.guide, title: 'Renamed' };
    const saved = await api('/api/guide', {
      method: 'PUT',
      headers: { 'if-match': loaded.version },
      body: JSON.stringify(guide),
    });
    expect(saved.status).toBe(200);
    const result = await saved.json();
    expect(result.version).not.toBe(loaded.version);
    expect(JSON.parse(await readFile(guidePath, 'utf8')).title).toBe('Renamed');

    const stale = await api('/api/guide', {
      method: 'PUT',
      headers: { 'if-match': loaded.version },
      body: JSON.stringify({ ...guide, title: 'Lost' }),
    });
    expect(stale.status).toBe(409);
    expect(JSON.parse(await readFile(guidePath, 'utf8')).title).toBe('Renamed');
  });

  it('rejects an invalid guide without touching the file', async () => {
    const loaded = await (await api('/api/guide')).json();
    const before = await readFile(guidePath, 'utf8');
    const response = await api('/api/guide', {
      method: 'PUT',
      headers: { 'if-match': loaded.version },
      body: JSON.stringify({
        ...loaded.guide,
        steps: [{ ...loaded.guide.steps[0], assetId: 'x' }],
      }),
    });
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('INVALID_GUIDE');
    expect(await readFile(guidePath, 'utf8')).toBe(before);
  });

  it('stores a new image, and deletes the old one once no step uses it', async () => {
    const loaded = await (await api('/api/guide')).json();
    const [oldAsset] = loaded.guide.assets;
    const uploaded = await api('/api/images', { method: 'POST', body: wide });
    expect(uploaded.status).toBe(201);
    const { asset } = await uploaded.json();
    expect(asset).toMatchObject({ mimeType: 'image/png', width: 2, height: 1 });
    expect(asset.src).toMatch(/^assets\/[0-9a-f]{64}\.png$/);

    const guide = {
      ...loaded.guide,
      assets: [asset],
      steps: [{ ...loaded.guide.steps[0], assetId: asset.id }],
    };
    const saved = await api('/api/guide', {
      method: 'PUT',
      headers: { 'if-match': loaded.version },
      body: JSON.stringify(guide),
    });
    expect(saved.status).toBe(200);
    const folder = resolve(guidePath, '..');
    await expect(access(resolve(folder, oldAsset.src))).rejects.toThrow();
    await expect(access(resolve(folder, asset.src))).resolves.toBeUndefined();
  });

  it('serves the images of the guide and nothing else', async () => {
    const { guide } = await (await api('/api/guide')).json();
    const image = await fetch(`${origin}/guide/${guide.assets[0].src}`, { headers: { cookie } });
    expect(image.status).toBe(200);
    expect(image.headers.get('content-type')).toBe('image/png');
    expect((await fetch(`${origin}/guide/${guide.assets[0].src}`)).status).toBe(403);
    expect((await fetch(`${origin}/guide/guide.json`, { headers: { cookie } })).status).toBe(404);
    expect(
      (await fetch(`${origin}/guide/%2e%2e%2f%2e%2e%2fcapture.png`, { headers: { cookie } }))
        .status,
    ).toBeGreaterThanOrEqual(400);
  });
});
