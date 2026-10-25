import type { GuideAsset, GuideDocument } from '@interactive-learning/protocol';

/** The studio server writes its token of this run into the page it serves. */
const token =
  document.querySelector<HTMLMetaElement>('meta[name="il-studio-token"]')?.content ?? '';

export interface LoadedGuide {
  guide: GuideDocument;
  /** Hash of the file on disk. A save sends it back so a newer file is never overwritten. */
  version: string;
  /** Path of guide.json from the folder where the studio started. */
  file: string;
}

export class StudioError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: { 'x-studio-token': token, ...(init.headers as Record<string, string>) },
    });
  } catch {
    throw new StudioError(
      'The studio server stopped. Run the studio command again, then reload this page.',
      'OFFLINE',
    );
  }
  const body = (await response.json().catch(() => ({}))) as {
    error?: { code: string; message: string };
  };
  if (!response.ok) {
    throw new StudioError(
      body.error?.message ?? 'The studio server could not answer.',
      body.error?.code ?? 'STUDIO_ERROR',
    );
  }
  return body as T;
}

export const loadGuide = () => request<LoadedGuide>('/api/guide');

export const saveGuide = (guide: GuideDocument, version: string) =>
  request<LoadedGuide>('/api/guide', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'if-match': version },
    body: JSON.stringify(guide),
  });

/** Copies an image file into the assets folder of the guide, without listing it yet. */
export const uploadImage = (file: File) =>
  request<{ asset: GuideAsset }>('/api/images', {
    method: 'POST',
    headers: { 'content-type': file.type || 'application/octet-stream' },
    body: file,
  });

/** Images are served from the folder of guide.json, next to the page. */
export function imageUrl(asset: GuideAsset | undefined): string {
  if (!asset) return '';
  if (asset.src.startsWith('data:')) return asset.src;
  return `/guide/${asset.src.split('/').map(encodeURIComponent).join('/')}`;
}
