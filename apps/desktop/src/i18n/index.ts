import { ref } from 'vue';
import { en, type Entry, type MessageKey } from './en';
import { fr } from './fr';

export type { MessageKey } from './en';

/** The languages the studio speaks. */
export type Locale = 'en' | 'fr';
/** What Settings keeps: `auto` speaks the language of the computer. */
export type LanguageChoice = 'auto' | Locale;
export type Params = Record<string, string | number>;

/** Each language in its own words, as language menus show them. */
export const LANGUAGE_NAMES: Record<Locale, string> = { en: 'English', fr: 'Français' };

const catalogs: Record<Locale, Record<MessageKey, Entry>> = { en, fr };

/** The language of the interface. Every `t` of a template reads it, so a change re-renders. */
export const locale = ref<Locale>('en');

/** The language of a BCP 47 tag, such as `fr-CA` or `fr_FR.UTF-8`; English otherwise. */
export function matchLocale(tag: string | null | undefined): Locale {
  return tag?.trim().toLowerCase().split(/[-_.]/)[0] === 'fr' ? 'fr' : 'en';
}

/** The language a choice of Settings gives on this computer. */
export function resolveLocale(choice: LanguageChoice | undefined, system: string): Locale {
  return choice === 'en' || choice === 'fr' ? choice : matchLocale(system);
}

export function setLocale(next: Locale): void {
  locale.value = next;
  // The player of the editor follows the language of the page, like any HTML content.
  if (typeof document !== 'undefined') document.documentElement.lang = next;
}

/** A region for dates: day before month in both languages. */
const region = () => (locale.value === 'fr' ? 'fr-FR' : 'en-GB');

const pluralRules = new Map<Locale, Intl.PluralRules>();
function pluralOf(count: number): 'one' | 'other' {
  let rules = pluralRules.get(locale.value);
  if (!rules) {
    rules = new Intl.PluralRules(locale.value);
    pluralRules.set(locale.value, rules);
  }
  return rules.select(count) === 'one' ? 'one' : 'other';
}

export function formatNumber(value: number, fractionDigits = 0): string {
  return new Intl.NumberFormat(region(), { maximumFractionDigits: fractionDigits }).format(value);
}

/** Whether a text is a key of the catalog, such as a label of the undo history. */
export function isMessageKey(text: unknown): text is MessageKey {
  return typeof text === 'string' && text in en;
}

/**
 * The text of `key` in the language of the interface. `{name}` takes the parameter of that name,
 * numbers written the way the language writes them, and an entry with `one` and `other` follows
 * `count`. A key the catalog lacks reads as itself.
 */
export function t(key: MessageKey, params?: Params): string {
  const entry: Entry | undefined = catalogs[locale.value][key] ?? en[key];
  if (entry === undefined) return key;
  const text = typeof entry === 'string' ? entry : entry[pluralOf(Number(params?.count ?? 0))];
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name];
    if (value === undefined) return whole;
    return typeof value === 'number' ? formatNumber(value) : value;
  });
}

/** `4 s`, `3.5 s` or `3,5 s`: a running time as the inspector and the timeline show it. */
export function formatSeconds(ms: number): string {
  return `${formatNumber(Math.round(ms / 100) / 10, 1)} s`;
}

/** `2.1 MB` or `2,1 Mo`: the size of a download. */
export function formatMegabytes(bytes: number): string {
  return `${formatNumber(bytes / 1_000_000, 1)} ${locale.value === 'fr' ? 'Mo' : 'MB'}`;
}

export function formatDate(
  iso: string | number | Date,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' },
): string {
  return new Date(iso).toLocaleDateString(region(), options);
}

export function formatDateTime(iso: string | number | Date): string {
  return new Date(iso).toLocaleString(region(), { dateStyle: 'medium', timeStyle: 'short' });
}

/** `5 min ago`, `yesterday`, or a date, for when something changed. */
export function since(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '';
  const minutes = Math.round((now - time) / 60_000);
  if (minutes < 1) return t('time.justNow');
  if (minutes < 60) return t('time.minutesAgo', { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t('time.hoursAgo', { count: hours });
  if (hours < 48) return t('time.yesterday');
  return formatDate(time, { day: 'numeric', month: 'short' });
}
