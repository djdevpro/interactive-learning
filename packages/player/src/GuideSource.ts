import { validateGuide, type GuideDocument } from '@interactive-learning/protocol';

export interface LoadedGuide {
  guide: GuideDocument;
  assetBaseUrl: string;
}

/** Why a guide URL could not be read. The element turns it into a localized message. */
export class GuideSourceError extends Error {
  constructor(
    readonly reason: 'protocol' | 'network' | 'format',
    readonly status?: number,
  ) {
    super(`Guide source failed: ${reason}${status ? ` (HTTP ${status})` : ''}.`);
    this.name = 'GuideSourceError';
  }
}

/** One source per player; superseded fetches never replace the current guide. */
export class GuideSource {
  private request: AbortController | undefined;

  cancel(): void {
    this.request?.abort();
    this.request = undefined;
  }

  async load(src: string, baseUrl: string): Promise<LoadedGuide> {
    this.cancel();
    const url = new URL(src, baseUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new GuideSourceError('protocol');
    const request = new AbortController();
    this.request = request;
    const response = await fetch(url, { signal: request.signal, credentials: 'same-origin' }).catch(
      () => {
        request.signal.throwIfAborted();
        throw new GuideSourceError('network');
      },
    );
    if (!response.ok) throw new GuideSourceError('network', response.status);
    const json: unknown = await response.json().catch(() => {
      request.signal.throwIfAborted();
      throw new GuideSourceError('format');
    });
    const guide = validateGuide(json);
    request.signal.throwIfAborted();
    return { guide, assetBaseUrl: new URL('.', response.url || url).href };
  }
}
