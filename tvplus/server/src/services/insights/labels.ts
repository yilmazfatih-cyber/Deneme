/**
 * Kırılım anahtarlarının Türkçe adları ve başlıkların sınıflandırılması (köken, dil, edinim, yerli mi).
 */
import type { ContentSource, ContentTitle } from '../../../../shared/content-schema'
import type { Acquisition } from '../../../../shared/intelligence'
import { GENRES, MATURITY } from '../../../../shared/taxonomy'

export const UNKNOWN_COUNTRY = 'ZZ'
export const UNKNOWN_LANGUAGE = 'und'

const COUNTRY_NAMES: Record<string, string> = {
  TR: 'Türkiye',
  US: 'ABD',
  GB: 'Birleşik Krallık',
  IE: 'İrlanda',
  CA: 'Kanada',
  AU: 'Avustralya',
  NZ: 'Yeni Zelanda',
  FR: 'Fransa',
  DE: 'Almanya',
  AT: 'Avusturya',
  CH: 'İsviçre',
  NL: 'Hollanda',
  BE: 'Belçika',
  IT: 'İtalya',
  ES: 'İspanya',
  PT: 'Portekiz',
  GR: 'Yunanistan',
  SE: 'İsveç',
  NO: 'Norveç',
  DK: 'Danimarka',
  FI: 'Finlandiya',
  IS: 'İzlanda',
  PL: 'Polonya',
  CZ: 'Çekya',
  HU: 'Macaristan',
  RO: 'Romanya',
  BG: 'Bulgaristan',
  RU: 'Rusya',
  UA: 'Ukrayna',
  AZ: 'Azerbaycan',
  GE: 'Gürcistan',
  IR: 'İran',
  IL: 'İsrail',
  EG: 'Mısır',
  SA: 'Suudi Arabistan',
  AE: 'Birleşik Arap Emirlikleri',
  IN: 'Hindistan',
  PK: 'Pakistan',
  CN: 'Çin',
  HK: 'Hong Kong',
  TW: 'Tayvan',
  JP: 'Japonya',
  KR: 'Güney Kore',
  TH: 'Tayland',
  ID: 'Endonezya',
  PH: 'Filipinler',
  MX: 'Meksika',
  BR: 'Brezilya',
  AR: 'Arjantin',
  CO: 'Kolombiya',
  CL: 'Şili',
  ZA: 'Güney Afrika',
  NG: 'Nijerya',
  [UNKNOWN_COUNTRY]: 'Bilinmiyor',
}

const LANGUAGE_NAMES: Record<string, string> = {
  tr: 'Türkçe',
  en: 'İngilizce',
  fr: 'Fransızca',
  de: 'Almanca',
  es: 'İspanyolca',
  it: 'İtalyanca',
  pt: 'Portekizce',
  nl: 'Felemenkçe',
  sv: 'İsveççe',
  no: 'Norveççe',
  nb: 'Norveççe',
  da: 'Danca',
  fi: 'Fince',
  is: 'İzlandaca',
  pl: 'Lehçe',
  cs: 'Çekçe',
  hu: 'Macarca',
  ro: 'Romence',
  el: 'Yunanca',
  ru: 'Rusça',
  uk: 'Ukraynaca',
  az: 'Azerbaycan Türkçesi',
  ka: 'Gürcüce',
  ku: 'Kürtçe',
  fa: 'Farsça',
  ar: 'Arapça',
  he: 'İbranice',
  hi: 'Hintçe',
  ur: 'Urduca',
  zh: 'Çince',
  ja: 'Japonca',
  ko: 'Korece',
  th: 'Tayca',
  id: 'Endonezyaca',
  zxx: 'Sözsüz',
  [UNKNOWN_LANGUAGE]: 'Bilinmiyor',
}

export const ACQUISITION_NAMES: Record<Acquisition, string> = {
  ORIGINAL: 'Kendi yapımı',
  LICENSED: 'Lisanslı kütüphane',
  OPEN: 'Açık lisans / kamu malı',
  EMBED: 'Üçüncü taraf gömme',
}

export const TYPE_NAMES: Record<ContentTitle['type'], string> = { MOVIE: 'Filmler', SHOW: 'Diziler' }

export const countryName = (code: string): string => COUNTRY_NAMES[code] ?? code
export const languageName = (code: string): string => LANGUAGE_NAMES[code] ?? code
export const genreName = (key: string): string => (key in GENRES ? GENRES[key as keyof typeof GENRES].name : key)
export const maturityName = (key: string): string =>
  key in MATURITY ? MATURITY[key as keyof typeof MATURITY].certificationValue : key

export const countryOf = (t: ContentTitle): string => t.origin?.countries[0] ?? UNKNOWN_COUNTRY
export const languageOf = (t: ContentTitle): string => t.origin?.languages[0] ?? UNKNOWN_LANGUAGE

/** Başlığın (ya da ilk bölümünün) oynatma kaynakları */
function sourcesOf(t: ContentTitle): ContentSource[] {
  if (t.sources.length > 0) return t.sources
  return t.seasons.flatMap((s) => s.episodes.flatMap((e) => e.sources))
}

const OPEN_LICENSE_RE = /\b(cc[ -]?by|cc0|creative commons|public domain)\b|kamu malı/i

/**
 * Edinim türü: içerikteki açık alan önce gelir; yoksa türetilir — üçüncü taraf gömme kaynağı (YouTube) → EMBED,
 * açık lisans / kamu malı → OPEN, aksi hâlde LICENSED. ORIGINAL yalnız açıkça yazılırsa.
 */
export function acquisitionOf(t: ContentTitle): Acquisition {
  if (t.acquisition) return t.acquisition
  if (sourcesOf(t).some((s) => s.type === 'YOUTUBE' || s.type === 'YOUTUBE_LIVE')) return 'EMBED'
  if (OPEN_LICENSE_RE.test(t.license.name)) return 'OPEN'
  return 'LICENSED'
}

/** Yerli içerik: köken yazılıysa ülkeler arasında TR; köken yoksa "Yerli Yapımlar" türü. */
export function isLocal(t: ContentTitle): boolean {
  if (t.origin && t.origin.countries.length > 0) return t.origin.countries.includes('TR')
  return t.genres.includes('yerli')
}

/** Türkçe ondalık: 1.8 → "1,8" */
export function trNumber(x: number, digits = 1): string {
  return x.toFixed(digits).replace('.', ',')
}

/** Yüzde: 0.284 → "%28" */
export function trPercent(x: number): string {
  return `%${Math.round(x * 100)}`
}

export function round4(x: number): number {
  return Math.round(x * 10000) / 10000
}

/** İstanbul saati (2016'dan beri sabit UTC+3) */
export const ISTANBUL_OFFSET_MS = 3 * 3600_000

export function monthOf(ts: number): string {
  return new Date(ts + ISTANBUL_OFFSET_MS).toISOString().slice(0, 7)
}

export function dayOf(ts: number): string {
  return new Date(ts + ISTANBUL_OFFSET_MS).toISOString().slice(0, 10)
}

/** 'YYYY-MM-DD' (İstanbul) gün başı → epoch ms */
export function dayStart(day: string): number {
  return Date.parse(`${day}T00:00:00+03:00`)
}
