import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { lstat, readFile, readdir, unlink } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, extname, relative, resolve, sep, isAbsolute } from 'node:path';
import { MAX_IMAGE_BYTES, validateGuide, type GuideDocument } from '@interactive-learning/protocol';
import { isNodeError, RecorderError } from './errors.js';
import {
  readGuide,
  resolveAssetPath,
  resolveGuidePath,
  withGuideLock,
  writeGuideAtomically,
} from './files.js';
import { assertAssetMetadata, readImage } from './images.js';
import { RecordingSession } from './recording-session.js';

export interface StudioOptions {
  guidePath: string;
  /** Built studio application: `index.html` and its files. */
  appDirectory: string;
  /** 0 picks a free port. */
  port?: number;
}

export interface Studio {
  /** Address to open, with the access token of this run. */
  url: string;
  port: number;
  close(): Promise<void>;
  /** Settles when the server stops. */
  closed: Promise<void>;
}

const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};
const statuses: Record<string, number> = {
  GUIDE_CHANGED: 409,
  GUIDE_BUSY: 409,
  GUIDE_NOT_FOUND: 404,
  ASSET_NOT_FOUND: 404,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  TOO_LARGE: 413,
};
/** Guides with embedded images can be large; a guide of separate files stays far below. */
const MAX_GUIDE_BYTES = 120 * 1024 * 1024;
const COOKIE = 'il_studio';
/** Names the recorder gives to the images it copies. Only those are ever deleted. */
const STORED_IMAGE = /^assets\/[0-9a-f]{64}\.(?:png|jpg|webp)$/;

const versionOf = (raw: string) => createHash('sha256').update(raw).digest('hex');

async function readBody(request: IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new RecorderError('TOO_LARGE', 'The request is too large.');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response
    .writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    })
    .end(JSON.stringify(value));
}

function fail(response: ServerResponse, error: unknown): void {
  if (error instanceof RecorderError) {
    sendJson(response, statuses[error.code] ?? 400, {
      error: { code: error.code, message: error.message },
    });
    return;
  }
  sendJson(response, 500, {
    error: { code: 'STUDIO_ERROR', message: 'The studio could not complete this request.' },
  });
}

/**
 * Local server of the studio. It serves the built application, the images of one guide, and
 * an API that reads and writes that guide in place. It listens on 127.0.0.1 only and answers
 * nothing without the token of this run, so another site open in the browser cannot use it.
 */
export async function startStudio(options: StudioOptions): Promise<Studio> {
  const guidePath = resolveGuidePath(options.guidePath);
  await readGuide(guidePath);
  const appDirectory = resolve(options.appDirectory);
  const session = new RecordingSession(guidePath);
  const token = randomBytes(24).toString('base64url');
  let port = 0;

  const hasToken = (value: unknown): boolean => {
    if (typeof value !== 'string' || value.length !== token.length) return false;
    return timingSafeEqual(Buffer.from(value), Buffer.from(token));
  };
  const hasCookie = (request: IncomingMessage): boolean =>
    (request.headers.cookie ?? '').split(';').some((part) => {
      const [name, ...value] = part.trim().split('=');
      return name === COOKIE && hasToken(value.join('='));
    });
  const forbidden = () =>
    new RecorderError('FORBIDDEN', 'Open the address that the studio command printed.');

  async function load() {
    const { document, raw } = await readGuide(guidePath);
    return {
      guide: document,
      version: versionOf(raw),
      file: relative(process.cwd(), guidePath).split(sep).join('/'),
    };
  }

  /** Deletes the images the previous version stored and nothing uses any more. */
  async function removeUnusedImages(previous: GuideDocument, next: GuideDocument): Promise<void> {
    const kept = new Set(next.assets.map((asset) => asset.src));
    const folder = dirname(guidePath);
    // Another guide of the same folder may share an image: it is kept then.
    const others = await Promise.all(
      (await readdir(folder))
        .filter((name) => name.endsWith('.json') && resolve(folder, name) !== guidePath)
        .map((name) => readFile(resolve(folder, name), 'utf8').catch(() => '')),
    );
    for (const { src } of previous.assets) {
      if (kept.has(src) || !STORED_IMAGE.test(src) || others.some((text) => text.includes(src)))
        continue;
      await unlink(resolve(folder, src)).catch((error: unknown) => {
        if (!isNodeError(error, 'ENOENT')) throw error;
      });
    }
  }

  async function save(body: Buffer, expected: unknown) {
    return withGuideLock(guidePath, async () => {
      const { document: previous, raw } = await readGuide(guidePath);
      if (expected !== versionOf(raw)) {
        throw new RecorderError(
          'GUIDE_CHANGED',
          'The guide changed on disk since it was opened. Reload it to get the latest version.',
        );
      }
      let next: GuideDocument;
      try {
        next = validateGuide(JSON.parse(body.toString('utf8')));
      } catch (error) {
        throw new RecorderError(
          'INVALID_GUIDE',
          error instanceof Error ? error.message : 'The guide is not valid.',
        );
      }
      if (next.id !== previous.id) {
        throw new RecorderError('INVALID_GUIDE', 'The studio cannot change the guide identifier.');
      }
      for (const asset of next.assets) {
        if (asset.src.startsWith('data:')) continue;
        assertAssetMetadata(asset, await readImage(await resolveAssetPath(guidePath, asset.src)));
      }
      next.updatedAt = new Date().toISOString();
      await writeGuideAtomically(guidePath, next, raw);
      await removeUnusedImages(previous, next);
      return load();
    });
  }

  async function serveFile(response: ServerResponse, file: string, cache: boolean) {
    const type = types[extname(file).toLowerCase()];
    if (!type) throw new RecorderError('NOT_FOUND', 'This file does not exist.');
    response
      .writeHead(200, {
        'content-type': type,
        'cache-control': cache ? 'max-age=3600' : 'no-store',
        'x-content-type-options': 'nosniff',
      })
      .end(await readFile(file));
  }

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    // A foreign host name means DNS rebinding or a proxy: neither may reach the guide.
    const host = request.headers.host;
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) throw forbidden();
    const url = new URL(request.url ?? '/', `http://${host}`);
    let path: string;
    try {
      path = decodeURIComponent(url.pathname);
    } catch {
      throw new RecorderError('NOT_FOUND', 'This file does not exist.');
    }
    const method = request.method ?? 'GET';

    if (path.startsWith('/api/')) {
      if (!hasToken(request.headers['x-studio-token'])) throw forbidden();
      if (path === '/api/guide' && method === 'GET') return sendJson(response, 200, await load());
      if (path === '/api/guide' && method === 'PUT') {
        const body = await readBody(request, MAX_GUIDE_BYTES);
        return sendJson(response, 200, await save(body, request.headers['if-match']));
      }
      if (path === '/api/images' && method === 'POST') {
        const asset = await session.importImage(await readBody(request, MAX_IMAGE_BYTES));
        return sendJson(response, 201, { asset });
      }
      throw new RecorderError('NOT_FOUND', 'This request does not exist.');
    }
    if (method !== 'GET' && method !== 'HEAD') throw new RecorderError('NOT_FOUND', 'Not found.');

    if (path.startsWith('/guide/')) {
      if (!hasCookie(request)) throw forbidden();
      const file = await resolveAssetPath(guidePath, path.slice('/guide/'.length));
      if (!types[extname(file).toLowerCase()]?.startsWith('image/'))
        throw new RecorderError('NOT_FOUND', 'Only images of the guide are served.');
      return serveFile(response, file, false);
    }

    if (path === '/' || path === '/index.html') {
      if (hasToken(url.searchParams.get('token'))) {
        // The cookie carries the token from now on, and the address loses it.
        response
          .writeHead(303, {
            location: '/',
            'set-cookie': `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/`,
            'cache-control': 'no-store',
          })
          .end();
        return;
      }
      if (!hasCookie(request)) throw forbidden();
      const page = await readFile(resolve(appDirectory, 'index.html'), 'utf8');
      response
        .writeHead(200, {
          'content-type': types['.html']!,
          'cache-control': 'no-store',
          'x-frame-options': 'DENY',
        })
        .end(
          page.replace('</head>', `<meta name="il-studio-token" content="${token}" />\n</head>`),
        );
      return;
    }

    const file = resolve(appDirectory, `.${path}`);
    const inside = relative(appDirectory, file);
    if (!inside || inside.startsWith('..') || isAbsolute(inside))
      throw new RecorderError('NOT_FOUND', 'This file does not exist.');
    try {
      if (!(await lstat(file)).isFile()) throw new Error('not a file');
    } catch {
      throw new RecorderError('NOT_FOUND', 'This file does not exist.');
    }
    return serveFile(response, file, true);
  }

  const server = createServer((request, response) => {
    handle(request, response).catch((error: unknown) => {
      if (response.headersSent) response.destroy();
      else fail(response, error);
    });
  });
  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, '127.0.0.1', () => {
      server.off('error', reject);
      resolveListen();
    });
  });
  port = (server.address() as AddressInfo).port;
  const closed = new Promise<void>((resolveClosed) => server.once('close', resolveClosed));
  return {
    url: `http://127.0.0.1:${port}/?token=${token}`,
    port,
    closed,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    },
  };
}
