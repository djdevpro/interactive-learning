import { afterEach, describe, expect, it } from 'vitest';
import { en } from './en';
import { fr, typeset } from './fr';
import {
  formatMegabytes,
  formatSeconds,
  matchLocale,
  resolveLocale,
  setLocale,
  since,
  t,
} from './index';

/** The no-break spaces of typography, which a line never splits. */
const nbsp = String.fromCodePoint(0xa0);
const narrow = String.fromCodePoint(0x202f);

const parameters = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const texts = (entry: unknown): string[] =>
  typeof entry === 'string' ? [entry] : Object.values(entry as Record<string, string>);

afterEach(() => setLocale('en'));

describe('the catalogs', () => {
  it('give every text in French, with the same parameters', () => {
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
    for (const [key, entry] of Object.entries(en)) {
      const french = (fr as Record<string, unknown>)[key];
      expect(typeof french, key).toBe(typeof entry);
      for (const [index, text] of texts(entry).entries()) {
        expect(parameters(texts(french)[index] ?? ''), key).toEqual(parameters(text));
      }
    }
  });

  it('never leave a text empty', () => {
    for (const catalog of [en, fr]) {
      for (const [key, entry] of Object.entries(catalog)) {
        for (const text of texts(entry)) expect(text.trim(), key).not.toBe('');
      }
    }
  });
});

describe('the language', () => {
  it('follows the computer unless Settings chose one', () => {
    expect(matchLocale('fr-FR')).toBe('fr');
    expect(matchLocale('fr_CA.UTF-8')).toBe('fr');
    expect(matchLocale('en-US')).toBe('en');
    expect(matchLocale('de-DE')).toBe('en');
    expect(matchLocale(undefined)).toBe('en');
    expect(resolveLocale('auto', 'fr-BE')).toBe('fr');
    expect(resolveLocale('en', 'fr-FR')).toBe('en');
    expect(resolveLocale('fr', 'en-GB')).toBe('fr');
  });

  it('counts the way each language counts', () => {
    expect(t('common.steps', { count: 0 })).toBe('0 steps');
    expect(t('common.steps', { count: 1 })).toBe('1 step');
    setLocale('fr');
    // French keeps the singular for zero.
    expect(t('common.steps', { count: 0 })).toBe('0 étape');
    expect(t('common.steps', { count: 1 })).toBe('1 étape');
    expect(t('common.steps', { count: 2 })).toBe('2 étapes');
  });

  it('writes numbers, sizes and times the way each language writes them', () => {
    expect(formatSeconds(4000)).toBe(`4${nbsp}s`);
    expect(formatSeconds(3500)).toBe(`3.5${nbsp}s`);
    expect(formatMegabytes(2_150_000)).toBe(`2.2${nbsp}MB`);
    setLocale('fr');
    expect(formatSeconds(3500)).toBe(`3,5${nbsp}s`);
    expect(formatMegabytes(2_150_000)).toBe(`2,2${nbsp}Mo`);
    expect(since(new Date(Date.now() - 5 * 60_000).toISOString())).toBe('il y a 5 min');
    expect(since(new Date().toISOString())).toBe("à l'instant");
  });

  it('keeps the spaces of French punctuation together with it', () => {
    expect(typeset('Supprimer « Billing » ?')).toBe(`Supprimer «${nbsp}Billing${nbsp}»${narrow}?`);
    expect(typeset('Échec : réseau')).toBe(`Échec${nbsp}: réseau`);
    setLocale('fr');
    expect(t('library.deleteTitle', { name: 'Billing' })).toBe(
      `Supprimer «${nbsp}Billing${nbsp}»${narrow}?`,
    );
  });

  it('fills parameters and leaves unknown ones visible', () => {
    expect(t('library.moved', { theme: 'Billing' })).toBe('Moved to Billing');
    expect(t('library.moved')).toBe('Moved to {theme}');
  });
});
