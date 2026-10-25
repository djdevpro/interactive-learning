import { describe, expect, it } from 'vitest';
import { sameSite, sameView, siteOf, type CaptureContext } from './messages';

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

describe('sites of the recorded pages', () => {
  it.each([
    ['https://miralomenu.com/', 'https://www.miralomenu.com/carta'],
    ['https://shop.test/', 'http://app.shop.test/login'],
    ['https://www.example.co.uk/', 'https://example.co.uk/basket'],
    ['http://localhost:3000/', 'http://localhost:3000/#/projects'],
  ])('keeps %s and %s together', (a, b) => {
    expect(sameSite(a, b)).toBe(true);
  });

  it.each([
    ['https://miralomenu.com/', 'https://accounts.google.com/'],
    ['https://one.co.uk/', 'https://two.co.uk/'],
    ['http://localhost:3000/', 'http://localhost:5173/'],
    ['https://shop.test/', 'not an address'],
  ])('keeps %s and %s apart', (a, b) => {
    expect(sameSite(a, b)).toBe(false);
  });

  it('names the registrable domain', () => {
    expect(siteOf('https://www.miralomenu.com/carta')).toBe('miralomenu.com');
    expect(siteOf('http://192.168.1.20:8080/')).toBe('192.168.1.20:8080');
  });
});
