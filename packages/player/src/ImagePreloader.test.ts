import { describe, expect, it } from 'vitest';
import { ImagePreloader, preloadOrder } from './ImagePreloader';

/** The part of an image element the preloader uses. The test ends each download by hand. */
class FakeImage {
  src = '';
  fetchPriority = 'auto';
  decodes = 0;
  private readonly listeners = new Map<string, () => void>();

  addEventListener(type: string, listener: () => void): void {
    this.listeners.set(type, listener);
  }

  decode(): Promise<void> {
    this.decodes += 1;
    return Promise.resolve();
  }

  finish(type: 'load' | 'error'): void {
    this.listeners.get(type)?.();
  }
}

function setup() {
  const images: FakeImage[] = [];
  const settled: string[] = [];
  const preloader = new ImagePreloader(
    (source) => settled.push(source),
    () => {
      const image = new FakeImage();
      images.push(image);
      return image as unknown as HTMLImageElement;
    },
  );
  const requested = () => images.map((image) => image.src);
  const finish = (source: string, type: 'load' | 'error' = 'load') =>
    images
      .filter((image) => image.src === source)
      .at(-1)
      ?.finish(type);
  return { preloader, images, settled, requested, finish };
}

describe('preloadOrder', () => {
  it('puts the screenshot on screen first, then the next ones, then the one before', () => {
    expect(preloadOrder(['a', 'b', 'c', 'd', 'e'], 1, 2)).toEqual(['b', 'c', 'd', 'a']);
  });

  it('counts a screenshot shared by several steps once', () => {
    expect(preloadOrder(['a', 'a', 'b', 'b', 'c', 'd'], 1, 2)).toEqual(['a', 'b', 'c']);
  });

  it('skips steps without a usable screenshot and stops at the last step', () => {
    expect(preloadOrder(['a', '', 'b'], 0, 3)).toEqual(['a', 'b']);
    expect(preloadOrder(['a', 'b'], 1, 3)).toEqual(['b', 'a']);
  });
});

describe('ImagePreloader', () => {
  it('loads the screenshot on screen alone, before any other', () => {
    const { preloader, images } = setup();
    preloader.request(['a', 'b', 'c']);
    expect(images.map(({ src, fetchPriority }) => [src, fetchPriority])).toEqual([['a', 'high']]);
    expect(preloader.status('a')).toBe('loading');
    expect(preloader.image('a')).toBeUndefined();
  });

  it('then loads the next ones in order, two at a time', () => {
    const { preloader, images, requested, finish } = setup();
    const order = ['a', 'b', 'c', 'd'];
    preloader.request(order);
    finish('a');
    preloader.request(order);
    expect(requested()).toEqual(['a', 'b', 'c']);
    expect(images[1]?.fetchPriority).toBe('low');
    finish('c');
    preloader.request(order);
    expect(requested()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('reports each download that ends and hands over the loaded image', () => {
    const { preloader, images, settled, finish } = setup();
    preloader.request(['a', 'b']);
    finish('a');
    preloader.request(['a', 'b']);
    finish('b', 'error');
    expect(settled).toEqual(['a', 'b']);
    expect(preloader.image('a')).toBe(images[0]);
    expect(preloader.status('b')).toBe('error');
    expect(preloader.image('b')).toBeUndefined();
  });

  it('requests a new screenshot on screen at once, even while others load', () => {
    const { preloader, requested, finish } = setup();
    preloader.request(['a', 'b', 'c']);
    finish('a');
    preloader.request(['a', 'b', 'c']);
    preloader.request(['x', 'y']);
    expect(requested()).toEqual(['a', 'b', 'c', 'x']);
  });

  it('decodes the next screenshot once, as soon as it has loaded', () => {
    const { preloader, images, finish } = setup();
    const order = ['a', 'b', 'c'];
    preloader.request(order);
    finish('a');
    preloader.request(order);
    expect(images[1]?.decodes).toBe(0);
    finish('b');
    preloader.request(order);
    preloader.request(order);
    expect(images.map(({ decodes }) => decodes)).toEqual([0, 1, 0]);
  });

  it('downloads a failed screenshot again on retry and ignores the old download', () => {
    const { preloader, images, settled, requested } = setup();
    preloader.request(['a']);
    images[0]?.finish('error');
    preloader.request(['a']);
    expect(requested()).toEqual(['a']);
    preloader.retry('a');
    images[0]?.finish('load');
    expect(preloader.status('a')).toBe('loading');
    images[1]?.finish('load');
    expect(preloader.image('a')).toBe(images[1]);
    expect(settled).toEqual(['a', 'a']);
  });

  it('forgets the screenshots no step shows any more, even on their way', () => {
    const { preloader, settled, finish } = setup();
    preloader.request(['a', 'b']);
    finish('a');
    preloader.request(['a', 'b']);
    preloader.keep(new Set(['c']));
    finish('b');
    expect(preloader.status('a')).toBeUndefined();
    expect(preloader.status('b')).toBeUndefined();
    expect(settled).toEqual(['a']);
  });
});
