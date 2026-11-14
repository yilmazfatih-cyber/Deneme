/** Dil kodu → Türkçe ad (ses ve altyazı menüleri için). */
const NAMES: Record<string, string> = {
  tr: 'Türkçe',
  en: 'İngilizce',
  de: 'Almanca',
  fr: 'Fransızca',
  es: 'İspanyolca',
  it: 'İtalyanca',
  nl: 'Felemenkçe',
  pl: 'Lehçe',
  pt: 'Portekizce',
  ru: 'Rusça',
  vi: 'Vietnamca',
  ar: 'Arapça',
  af: 'Afrikanca',
  az: 'Azerice',
  bg: 'Bulgarca',
  bn: 'Bengalce',
  bs: 'Boşnakça',
  ca: 'Katalanca',
  cs: 'Çekçe',
  cy: 'Galce',
  da: 'Danca',
  el: 'Yunanca',
  eo: 'Esperanto',
  et: 'Estonca',
  eu: 'Baskça',
  fa: 'Farsça',
  fi: 'Fince',
  ga: 'İrlandaca',
  gl: 'Galiçyaca',
  he: 'İbranice',
  hi: 'Hintçe',
  hr: 'Hırvatça',
  hu: 'Macarca',
  hy: 'Ermenice',
  id: 'Endonezce',
  is: 'İzlandaca',
  ja: 'Japonca',
  ka: 'Gürcüce',
  kk: 'Kazakça',
  ko: 'Korece',
  ku: 'Kürtçe',
  lt: 'Litvanca',
  lv: 'Letonca',
  mk: 'Makedonca',
  ms: 'Malayca',
  nb: 'Norveççe',
  no: 'Norveççe',
  ro: 'Romence',
  sk: 'Slovakça',
  sl: 'Slovence',
  sq: 'Arnavutça',
  sr: 'Sırpça',
  sv: 'İsveççe',
  ta: 'Tamilce',
  th: 'Tayca',
  uk: 'Ukraynaca',
  ur: 'Urduca',
  uz: 'Özbekçe',
  zh: 'Çince',
  und: 'Özgün dil',
}

/** ISO 639-2 üç harfli kodlardan sık kullanılanlar → iki harfli. */
const THREE_TO_TWO: Record<string, string> = {
  tur: 'tr',
  eng: 'en',
  ger: 'de',
  deu: 'de',
  fre: 'fr',
  fra: 'fr',
  spa: 'es',
  ita: 'it',
  dut: 'nl',
  nld: 'nl',
  pol: 'pl',
  por: 'pt',
  rus: 'ru',
  vie: 'vi',
  ara: 'ar',
  jpn: 'ja',
  kor: 'ko',
  chi: 'zh',
  zho: 'zh',
}

/** 'en-US' → 'en', 'eng' → 'en'; bilinmeyen kod olduğu gibi (küçük harfle) döner. */
export function normalizeLang(code: string | null | undefined): string {
  if (!code) return 'und'
  const lower = code.trim().toLowerCase().replace(/_/g, '-')
  const base = lower.split('-')[0] ?? lower
  return THREE_TO_TWO[base] ?? base
}

export function languageName(code: string | null | undefined): string {
  const lang = normalizeLang(code)
  return NAMES[lang] ?? lang.toLocaleUpperCase('tr-TR')
}
