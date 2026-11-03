/** Where a screenshot of the preloader is: on its way, ready to show at once, or failed. */
export type ImageStatus = 'loading' | 'ready' | 'error';

/** Screenshots loading at the same time behind the one on screen. */
const PARALLEL = 2;

interface Entry {
  readonly image: HTMLImageElement;
  status: ImageStatus;
  decoded: boolean;
}

/**
 * The screenshots to keep at hand around a step, most urgent first: the one on screen, the next
 * `ahead` ones the viewer will see, then the one before, for a step back. Steps that share a
 * screenshot count once, and a step without a usable screenshot counts for nothing.
 */
export function preloadOrder(sources: readonly string[], index: number, ahead: number): string[] {
  const order: string[] = [];
  const add = (source: string | undefined): void => {
    if (source && !order.includes(source)) order.push(source);
  };
  add(sources[index]);
  for (let next = index + 1; next < sources.length && order.length <= ahead; next++) {
    add(sources[next]);
  }
  add(sources[index - 1]);
  return order;
}

/**
 * Loads screenshots ahead of time and keeps them, so a step shows its screenshot at once and a
 * replay or a step back never downloads it again. Its images are the elements the player puts on
 * screen: once loaded and decoded, an image paints in the next frame, whatever the cache headers of
 * the server. No browser API is touched until a screenshot is requested.
 */
export class ImagePreloader {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly onSettle: (source: string) => void,
    private readonly createImage: () => HTMLImageElement = () => new Image(),
  ) {}

  status(source: string): ImageStatus | undefined {
    return this.entries.get(source)?.status;
  }

  /** The element of a screenshot that has loaded, to put on screen. */
  image(source: string): HTMLImageElement | undefined {
    const entry = this.entries.get(source);
    return entry?.status === 'ready' ? entry.image : undefined;
  }

  /**
   * Requests the screenshots of a `preloadOrder`. The first one loads alone, so nothing slows it
   * down. Once it has, the others follow in order, `PARALLEL` at a time, and the second one is
   * decoded as soon as it has loaded. A screenshot that failed waits for `retry`.
   */
  request(order: readonly string[]): void {
    const [urgent, next] = order;
    if (urgent === undefined) return;
    if (!this.entries.has(urgent)) this.load(urgent, 'high');
    if (this.entries.get(urgent)?.status !== 'ready') return;
    let free = PARALLEL;
    for (const entry of this.entries.values()) if (entry.status === 'loading') free -= 1;
    for (const source of order) {
      if (free <= 0) break;
      if (this.entries.has(source)) continue;
      this.load(source, 'low');
      free -= 1;
    }
    if (next !== undefined) this.decode(next);
  }

  /** Downloads a screenshot again, such as one that failed, before any other. */
  retry(source: string): void {
    this.entries.delete(source);
    this.load(source, 'high');
  }

  /** Forgets the screenshots that no step shows any more. */
  keep(sources: ReadonlySet<string>): void {
    for (const source of this.entries.keys()) {
      if (!sources.has(source)) this.entries.delete(source);
    }
  }

  private load(source: string, priority: 'high' | 'low'): void {
    const image = this.createImage();
    const entry: Entry = { image, status: 'loading', decoded: false };
    this.entries.set(source, entry);
    const settle = (status: ImageStatus): void => {
      // A retry or a new guide replaced this request: how it ends no longer matters.
      if (this.entries.get(source) !== entry) return;
      entry.status = status;
      this.onSettle(source);
    };
    image.addEventListener('load', () => settle('ready'), { once: true });
    image.addEventListener('error', () => settle('error'), { once: true });
    image.fetchPriority = priority;
    image.src = source;
  }

  /** Decodes a loaded screenshot off the main thread, so its first frame on screen never waits. */
  private decode(source: string): void {
    const entry = this.entries.get(source);
    if (entry?.status !== 'ready' || entry.decoded) return;
    entry.decoded = true;
    // An image the browser cannot decode in advance still paints, decoded on the way.
    entry.image.decode().catch(() => undefined);
  }
}
