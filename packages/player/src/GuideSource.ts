import { validateGuide, type GuideDocument } from '@interactive-learning/protocol';

export interface LoadedGuide {
  guide: GuideDocument;
  assetBaseUrl: string;
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
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('Le guide doit être servi depuis une URL HTTP ou HTTPS.');
    }
    const request = new AbortController();
    this.request = request;
    const response = await fetch(url, { signal: request.signal, credentials: 'same-origin' });
    if (!response.ok) throw new Error(`Chargement du guide impossible (${response.status}).`);
    const guide = validateGuide(await response.json());
    request.signal.throwIfAborted();
    return { guide, assetBaseUrl: new URL('.', response.url || url).href };
  }
}
