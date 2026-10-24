import { describe, expect, it } from 'vitest';
import { sameView, type CaptureContext } from './messages';

const view: CaptureContext = {
  url: 'https://demo.example/form',
  title: 'Formulaire',
  documentToken: 'document-a',
  revision: 3,
  viewport: { width: 1200, height: 800 },
  scroll: { x: 0, y: 200 },
  dpr: 1.5,
};

describe('matching a pointer to a captured view', () => {
  it('accepts an unchanged document with a subpixel scroll difference', () => {
    expect(sameView(view, { ...view, scroll: { x: 0, y: 200.25 } })).toBe(true);
  });

  it.each([
    { url: 'https://demo.example/success' },
    { documentToken: 'document-b' },
    { revision: 4 },
    { viewport: { width: 900, height: 800 } },
    { scroll: { x: 0, y: 240 } },
    { dpr: 2 },
  ])('rejects changed view metadata %j', (change) => {
    expect(sameView(view, { ...view, ...change })).toBe(false);
  });

  it('rejects a new document even if its URL and viewport are identical', () => {
    expect(sameView(view, { ...view, documentToken: 'reloaded-document' })).toBe(false);
  });
});
