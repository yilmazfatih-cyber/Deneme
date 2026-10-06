/**
 * i18n (docs/TECH_DESIGN.md §11.5; STORY §0-9…§0-11; D-017, D-033).
 *
 * - Texts live in `src/i18n/tr.json` and `en.json` (nested keys, written verbatim from STORY / UX / OBSTACLES; tone is
 *   design-lead's). `I18nKey` is derived from tr.json, so `t()` with an unknown key does not compile; en.json must have
 *   exactly the same keys (compile-time check below + tests/services/i18n.test.ts).
 * - `t(key, params)` fills `{name}` placeholders from `params` (numbers are formatted with the locale's
 *   `Intl.NumberFormat`: TR "1.350", EN "1,350"). Plural nodes `{ one, other }` are chosen with `Intl.PluralRules`.
 * - Global placeholders are filled without caller params and the caller cannot pass them: `{town}` = `t('town.name')`
 *   (STORY §0-10), `{company}` = the in-game company name per language (NAMING §5.2: TR "Minik Usta İnşaat",
 *   EN "Tuna & Co.").
 * - Inline icon placeholders (`{coin}`, `{ok}`, STORY §0-11) stay in the text; `splitInline` cuts a text into text and
 *   icon runs for the label renderer.
 * - Upper case only through `upper()` = `toLocaleUpperCase(locale)` (TR: i → İ).
 */
import trDict from '../i18n/tr.json' with { type: 'json' };
import enDict from '../i18n/en.json' with { type: 'json' };

export const LOCALES = ['tr', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'tr';

/** BCP 47 tags for `Intl` and `toLocaleUpperCase` (CLAUDE.md: `toLocaleUpperCase('tr-TR')`). */
export const LOCALE_TAGS: Readonly<Record<Locale, string>> = { tr: 'tr-TR', en: 'en-US' };

/** In-game company name per language (NAMING §5.2, STORY §0-6/§0-10); not a store name. */
export const COMPANY_NAME: Readonly<Record<Locale, string>> = { tr: 'Minik Usta İnşaat', en: 'Tuna & Co.' };

/** Placeholders `t()` fills by itself; callers must not pass them (STORY §0-10). */
export const GLOBAL_PLACEHOLDERS = ['town', 'company'] as const;
/** Inline icon placeholders drawn as 1 em images by the label renderer (STORY §0-11). */
export const INLINE_ICONS = ['coin', 'ok'] as const;
export type InlineIcon = (typeof INLINE_ICONS)[number];

export interface Dictionary {
  readonly [key: string]: string | Dictionary;
}

type PluralNode = { readonly one: string; readonly other: string };

/** Dotted paths of every text in a dictionary; a `{ one, other }` node is one (plural) key. */
export type TextKeys<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? `${P}${K}`
    : T[K] extends PluralNode
      ? `${P}${K}`
      : TextKeys<T[K], `${P}${K}.`>;
}[keyof T & string];

export type I18nKey = TextKeys<typeof trDict>;

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
/** Compile-time guard: en.json has exactly the keys of tr.json. */
export const EN_KEYS_MATCH_TR: Equal<I18nKey, TextKeys<typeof enDict>> = true;

/** Caller parameters; `town` and `company` are global and cannot be given. */
export type I18nParams = { readonly [name: string]: string | number } & {
  readonly town?: never;
  readonly company?: never;
};

export const DICTIONARIES: Readonly<Record<Locale, Dictionary>> = { tr: trDict, en: enDict };

const PLACEHOLDER_RE = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

function lookup(dict: Dictionary, key: string): string | Dictionary | undefined {
  let node: string | Dictionary | undefined = dict;
  for (const part of key.split('.')) {
    if (node === undefined || typeof node === 'string') return undefined;
    node = node[part];
  }
  return node;
}

export interface Translator {
  readonly locale: Locale;
  t(key: I18nKey, params?: I18nParams): string;
  /** Same as `t` for keys that are not statically typed (level data `textKey`); unknown key → the key itself. */
  tDynamic(key: string, params?: I18nParams): string;
  has(key: string): boolean;
  upper(text: string): string;
  formatNumber(n: number): string;
}

/** Builds a translator over the given dictionaries (tests inject their own). */
export function createTranslator(
  locale: Locale,
  dicts: Readonly<Record<Locale, Dictionary>> = DICTIONARIES,
): Translator {
  const dict = dicts[locale];
  const tag = LOCALE_TAGS[locale];
  const numberFormat = new Intl.NumberFormat(tag, { maximumFractionDigits: 2 });
  const plural = new Intl.PluralRules(tag);

  const formatNumber = (n: number): string => numberFormat.format(n);

  const resolveText = (key: string, params: I18nParams | undefined): string | undefined => {
    const node = lookup(dict, key);
    if (typeof node === 'string') return node;
    if (node !== undefined && typeof node.other === 'string') {
      const n = params?.['n'];
      const form = typeof n === 'number' ? plural.select(n) : 'other';
      const text = node[form];
      return typeof text === 'string' ? text : node.other;
    }
    return undefined;
  };

  const fill = (text: string, params: I18nParams | undefined): string =>
    text.replace(PLACEHOLDER_RE, (whole, name: string) => {
      if (name === 'town') return resolveText('town.name', undefined) ?? whole;
      if (name === 'company') return COMPANY_NAME[locale];
      const value = params?.[name];
      if (value === undefined) return whole; // inline icons ({coin}, {ok}) and anything the caller left open
      return typeof value === 'number' ? formatNumber(value) : value;
    });

  const translate = (key: string, params: I18nParams | undefined): string => {
    if (params !== undefined) {
      for (const g of GLOBAL_PLACEHOLDERS) {
        if (Object.hasOwn(params, g))
          throw new Error(`i18n: "{${g}}" is global and cannot be passed (${key})`);
      }
    }
    const text = resolveText(key, params);
    return text === undefined ? key : fill(text, params);
  };

  return {
    locale,
    t: (key, params) => translate(key, params),
    tDynamic: (key, params) => translate(key, params),
    has: (key) => resolveText(key, undefined) !== undefined,
    upper: (text) => text.toLocaleUpperCase(tag),
    formatNumber,
  };
}

let current: Translator = createTranslator(DEFAULT_LOCALE);

export function setLocale(locale: Locale): void {
  if (locale !== current.locale) current = createTranslator(locale);
}

export function getLocale(): Locale {
  return current.locale;
}

/** Text for a key in the current locale. */
export function t(key: I18nKey, params?: I18nParams): string {
  return current.t(key, params);
}

/** Text for an untyped key (level `tutorial[].textKey`); returns the key itself when missing. */
export function tDynamic(key: string, params?: I18nParams): string {
  return current.tDynamic(key, params);
}

export function hasKey(key: string): boolean {
  return current.has(key);
}

/** Locale-aware upper case (TR: i → İ, ı → I). */
export function upper(text: string): string {
  return current.upper(text);
}

export type InlineRun =
  { readonly kind: 'text'; readonly text: string } | { readonly kind: 'icon'; readonly icon: InlineIcon };

/** Splits a translated text into text runs and inline icon runs (`{coin}`, `{ok}`). */
export function splitInline(text: string): InlineRun[] {
  const runs: InlineRun[] = [];
  let last = 0;
  for (const m of text.matchAll(PLACEHOLDER_RE)) {
    const name = m[1] as string;
    if (!(INLINE_ICONS as readonly string[]).includes(name)) continue;
    const at = m.index;
    if (at > last) runs.push({ kind: 'text', text: text.slice(last, at) });
    runs.push({ kind: 'icon', icon: name as InlineIcon });
    last = at + m[0].length;
  }
  if (last < text.length) runs.push({ kind: 'text', text: text.slice(last) });
  return runs;
}

/** Every text key of a dictionary in dotted form (plural nodes count once). */
export function flattenKeys(dict: Dictionary, prefix = ''): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(dict)) {
    const path = prefix + k;
    if (typeof v === 'string') out.push(path);
    else if (typeof v.other === 'string' && typeof v.one === 'string') out.push(path);
    else out.push(...flattenKeys(v, path + '.'));
  }
  return out;
}
