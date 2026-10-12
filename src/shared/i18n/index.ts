import { de } from './de';
import { en } from './en';
import { es } from './es';

/** Languages of the app. English is the main language and the fallback. */
export type Lang = 'en' | 'de' | 'es';
export const LANGS: Lang[] = ['en', 'de', 'es'];
export const LANG_NAMES: Record<Lang, string> = { en: 'English', de: 'Deutsch', es: 'Español' };

/** A text in all languages (curated list). */
export type Text = Record<Lang, string>;

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;
type PluralKey = MessageKey extends infer K ? (K extends `${infer B}_one` ? B : never) : never;

const CATALOGS: Record<Lang, Messages> = { en, de, es };

/** Locale for numbers and dates. German uses Swiss conventions (104'213, 12.10.2026). */
export const LOCALES: Record<Lang, string> = { en: 'en-US', de: 'de-CH', es: 'es-ES' };

let current: Lang = 'en';

export function isLang(v: unknown): v is Lang {
  return v === 'en' || v === 'de' || v === 'es';
}

export function setLang(lang: Lang) {
  current = lang;
}

export function getLang(): Lang {
  return current;
}

export function locale(lang: Lang = current): string {
  return LOCALES[lang];
}

/** First supported language from the system's preferred languages, else English. */
export function detectLang(preferred: readonly string[]): Lang {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split(/[-_]/)[0];
    if (isLang(base)) return base;
  }
  return 'en';
}

function fill(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

/** Translated message with {placeholders}. */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  return fill(CATALOGS[current][key] ?? en[key], vars);
}

/** Plural message: uses `<key>_one` or `<key>_other`; {count} is formatted for the language. */
export function tn(key: PluralKey, count: number, vars?: Record<string, string | number>): string {
  const form = new Intl.PluralRules(LOCALES[current]).select(count) === 'one' ? 'one' : 'other';
  return t(`${key}_${form}` as MessageKey, { count: formatNumber(count), ...vars });
}

/** Picks the current language from a curated text (or returns a plain string as is). */
export function tx(text: Text | string): string;
export function tx(text: Text | string | undefined): string | undefined;
export function tx(text: Text | string | undefined): string | undefined {
  if (text === undefined || typeof text === 'string') return text;
  return text[current] || text.en;
}

/** Whole numbers with grouping: 104,213 / 104'213 / 104.213. */
export function formatNumber(n: number, lang: Lang = current): string {
  const rounded = Math.round(n);
  // de-CH uses a typographic apostrophe; the plain one reads better in the UI.
  if (lang === 'de') return rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  return rounded.toLocaleString(LOCALES[lang]);
}

/** One decimal, e.g. ratings: 4.3 / 4,3. */
export function formatDecimal(n: number, lang: Lang = current): string {
  return n.toLocaleString(LOCALES[lang], { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
