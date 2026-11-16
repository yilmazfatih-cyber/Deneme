/**
 * Niyet sözlüğü: sorgudaki Türkçe sözcüklerin hangi niyete karşılık geldiği (saf; dizinle birlikte bir kez kurulur).
 *
 * Sözlük olabildiğince veriden türetilir:
 *   GENRE    shared/taxonomy GENRES adları ve anahtarları ("Bilim Kurgu", "bilim-kurgu") + aşağıdaki kısa eş anlamlılar.
 *            'yerli' türü ORIGIN sayılır (yerli = TR kökenli ya da Yerli Yapımlar türünde).
 *   MOOD     taxonomy MOODS adları ve anahtarları + etiket sözlüğünün (content/tagging/vocabulary.json) ölçek
 *            niteleyicileri (Düşündürücü, Komik, Ağır Tempolu…) ve ADJECTIVE yuvalı yüz değerleri (Eğlenceli, Dinlendirici…).
 *            Aynı okunuşa düşenler tek kavramda birleşir: "Düşündürücü" = ruh hâli etiketi VEYA karmaşıklık ≥ 4.
 *   ORIGIN   katalogdaki `origin.countries` değerleri için ülke adları (aşağıdaki tablo) + etiket sözlüğünün bölge sıfatları.
 *   DURATION "kısa" (< 40 dk; sözlükteki "kısa film" tanımı), "uzun" (≥ 60 dk; "uzun metraj" tanımı). Sayılı biçimler
 *            ("90 dakikadan kısa", "2 saatlik") parse.ts'te çözülür.
 *   ERA      "eski" (2000 öncesi), "yeni" (son 5 yıl). On yıllar ve "2010 sonrası" parse.ts'te çözülür.
 *   TYPE, AUDIENCE, LIVE  aşağıdaki kısa listeler.
 * Elle yazılan eş anlamlılar, durak sözcükleri ve ekler YALNIZ bu dosyadadır.
 */
import { GENRES, MOODS, type GenreKey, type MoodKey } from '../../../../../shared/taxonomy'
import type { TagVocabulary } from '../../../../../shared/tagging-schema'
import { norm } from '../../../../../shared/text'

export type IntentKind = 'GENRE' | 'MOOD' | 'DURATION' | 'ERA' | 'TYPE' | 'ORIGIN' | 'AUDIENCE' | 'LIVE'

export type Audience = 'children' | 'family'

/** Niyetin neyi süzdüğü (başlık olgularıyla karşılaştırılır: facts.ts). Süre dakikadır: min dahil, max hariç. */
export type IntentSpec =
  | { kind: 'GENRE'; genres: GenreKey[] }
  | { kind: 'MOOD'; moods: MoodKey[]; tags: string[] }
  | { kind: 'DURATION'; min: number | null; max: number | null; bare: 'short' | 'long' | null }
  | { kind: 'ERA'; from: number | null; to: number | null }
  | { kind: 'TYPE'; type: 'MOVIE' | 'SHOW' }
  | { kind: 'ORIGIN'; countries: string[] }
  | { kind: 'AUDIENCE'; audience: Audience }
  | { kind: 'LIVE'; when: 'now' | 'tonight' }

export interface LexEntry {
  /** fold() uygulanmış sözcükler */
  words: string[]
  spec: IntentSpec
  /** "Tür: Bilim Kurgu" */
  label: string
  /** Gerekçede kullanılan kısa ad: "Bilim Kurgu" */
  short: string
  /** Aynı anlamdaki niyetleri tekilleştirir */
  key: string
}

export interface IntentLexicon {
  /** İlk sözcük → girdiler (çok sözcüklü önce; eşit uzunlukta önce eklenen kazanır) */
  byFirst: Map<string, LexEntry[]>
  stopwords: ReadonlySet<string>
}

/* ───────────── Elle yazılan listeler (tek yer) ───────────── */

/** Kısa süre eşiği (dk, hariç): etiket sözlüğündeki "Kısa film (40 dk'dan kısa)" tanımı */
export const SHORT_MAX_MIN = 40
/** Uzun süre eşiği (dk, dahil): "Uzun metraj (60 dk ve üzeri film)" tanımı */
export const LONG_MIN_MIN = 60
/** "eski": bu yıldan önce yapılanlar */
export const OLD_BEFORE_YEAR = 2000
/** "yeni": son kaç yıl (bu yıl dahil) */
export const RECENT_YEARS = 5

/**
 * Sözcük sonu ekleri (fold() sonrası): çoğul, iyelik, belirtme, yönelme, bulunma, ayrılma, ilgi, vasıta, -li.
 * "komediler", "filmleri", "dizisi", "çocuklara", "belgesellerden", "drama" kökü bulunur. Kök en az 3 harf olmalı.
 */
export const SUFFIXES: readonly string[] = [
  'lar',
  'ler',
  'lari',
  'leri',
  'larin',
  'lerin',
  'lardan',
  'lerden',
  'larda',
  'lerde',
  'lara',
  'lere',
  'lardaki',
  'lerdeki',
  'i',
  'u',
  'si',
  'su',
  'yi',
  'yu',
  'in',
  'un',
  'nin',
  'nun',
  'a',
  'e',
  'ya',
  'ye',
  'da',
  'de',
  'ta',
  'te',
  'dan',
  'den',
  'tan',
  'ten',
  'la',
  'le',
  'yla',
  'yle',
  'li',
  'lu',
]

/** Niyet çözüldüğünde kalan metinden atılan dolgu sözcükleri ("ailece izlenecek animasyon" → kalan boş). */
const STOPWORDS = [
  've',
  'ile',
  'için',
  'icin',
  'bir',
  'bi',
  'bana',
  'bize',
  'izle',
  'izlemek',
  'izlemelik',
  'izlenecek',
  'izlenebilecek',
  'izlenir',
  'izleyelim',
  'öner',
  'önerir',
  'öneri',
  'öneriler',
  'misin',
  'gibi',
  'tarzı',
  'tarzında',
  'türü',
  'türünde',
  'olan',
  'şey',
  'şeyler',
  'yapım',
  'yapımı',
  'yapımlar',
  'yapımları',
  'içerik',
  'içerikler',
  'en',
  'çok',
  'güzel',
  'iyi',
  'tavsiye',
  'lütfen',
  'istiyorum',
  'arıyorum',
  'var',
  'mı',
  'mi',
  'mu',
  'ne',
  'neler',
  'hangi',
  'olsun',
  'ki',
  'de',
  'da',
  'süreli',
  'uygun',
]

/** Tür eş anlamlıları ve yaygın yazımlar (taksonomi adları ve anahtarları ayrıca otomatik eklenir) */
const GENRE_SYNONYMS: [string, GenreKey][] = [
  ['bilimkurgu', 'bilim-kurgu'],
  ['sci fi', 'bilim-kurgu'],
  ['scifi', 'bilim-kurgu'],
  ['çizgi film', 'animasyon'],
  ['anime', 'animasyon'],
  ['polisiye', 'suc'],
  ['fantezi', 'fantastik'],
  ['thriller', 'gerilim'],
  ['aşk', 'romantik'],
  ['drama', 'dram'],
  ['müzikal', 'muzik'],
  ['sessiz film', 'sessiz-sinema'],
  ['doğa', 'doga-bilim'],
  ['bilim', 'doga-bilim'],
  ['kültür', 'yasam'],
]

/** Ton eş anlamlıları: sözcük → birleşik kavram adları (bulunmayan kavram yok sayılır) */
const MOOD_SYNONYMS: [string, string[]][] = [
  ['hafif', ['Kolay İzlenen', 'Eğlenceli', 'Sakin', 'Dinlendirici']],
  ['rahatlatıcı', ['Sakin', 'Dinlendirici']],
  ['hüzünlü', ['Duygusal']],
  ['neşeli', ['Eğlenceli']],
  ['korkutucu', ['Ürkütücü']],
  ['gergin', ['Gerilimli']],
  ['derin', ['Düşündürücü']],
  ['ilham', ['İlham Verici']],
]
/** Ton sözlüğüne alınmayan MOODS anahtarları: başka niyetin işi ya da izleyici niyeti değil */
const MOOD_EXCLUDED: ReadonlySet<string> = new Set(['aile-boyu', 'kisa-ve-oz', 'acik-kaynak'])

/** Ülke adları (yalnız katalogda geçen ülkeler sözlüğe girer; TR her zaman) */
const COUNTRY_NAMES: Record<string, { name: string; words: string[] }> = {
  TR: { name: 'Yerli', words: ['yerli', 'türk', 'türkiye'] },
  US: { name: 'ABD', words: ['amerika', 'abd', 'amerikan', 'hollywood'] },
  GB: { name: 'İngiltere', words: ['ingiltere', 'ingiliz', 'britanya'] },
  DE: { name: 'Almanya', words: ['almanya', 'alman'] },
  FR: { name: 'Fransa', words: ['fransa', 'fransız'] },
  NL: { name: 'Hollanda', words: ['hollanda', 'hollandalı'] },
  IT: { name: 'İtalya', words: ['italya', 'italyan'] },
  ES: { name: 'İspanya', words: ['ispanya', 'ispanyol'] },
  JP: { name: 'Japonya', words: ['japonya', 'japon'] },
  KR: { name: 'Kore', words: ['kore', 'güney kore'] },
  IN: { name: 'Hindistan', words: ['hindistan', 'hint'] },
  RU: { name: 'Rusya', words: ['rusya', 'rus'] },
  IR: { name: 'İran', words: ['iran'] },
  CN: { name: 'Çin', words: ['çin'] },
}

const TYPE_WORDS: [string, 'MOVIE' | 'SHOW'][] = [
  ['film', 'MOVIE'],
  ['dizi', 'SHOW'],
]

const AUDIENCE_WORDS: [string, Audience][] = [
  ['çocuk', 'children'],
  ['çocuk için', 'children'],
  ['küçükler için', 'children'],
  ['aile', 'family'],
  ['ailece', 'family'],
  ['ailecek', 'family'],
  ['aile için', 'family'],
  ['aile boyu', 'family'],
  ['ailemle', 'family'],
]
/** İzleyici niyetini karşılayan etiket yüz değerleri (`yüz:değer`, etiket sözlüğünün 'yas-grubu' yüzü) */
export const AUDIENCE_TAGS: Record<Audience, readonly string[]> = {
  children: ['yas-grubu:2-5', 'yas-grubu:6-7', 'yas-grubu:8-10', 'yas-grubu:11-12', 'yas-grubu:cocuk'],
  family: ['yas-grubu:aile'],
}
const AUDIENCE_TEXT: Record<Audience, { label: string; short: string }> = {
  children: { label: 'İzleyici: Çocuklar', short: 'Çocuklar için' },
  family: { label: 'İzleyici: Aile', short: 'Ailece' },
}

const LIVE_WORDS: [string, 'now' | 'tonight'][] = [
  ['canlı', 'now'],
  ['canlı yayın', 'now'],
  ['şimdi', 'now'],
  ['şimdi yayında', 'now'],
  ['şu an', 'now'],
  ['şu anda', 'now'],
  ['yayında', 'now'],
  ['bu akşam', 'tonight'],
  ['bu gece', 'tonight'],
]

/* ───────────── Normalleştirme ───────────── */

const APOSTROPHES = /['’‘`´]/g

/** Türkçe küçük harf + kesme işaretini sil + ASCII düzleştirme: "80'lerden" → "80lerden", "Düşündürücü" → "dusundurucu" */
export function fold(s: string): string {
  return norm(s.toLocaleLowerCase('tr-TR').replace(APOSTROPHES, ''))
}

const UNSOFTEN: Record<string, string> = { g: 'k', d: 't', b: 'p' }

/** Sözcüğün olası kökleri (kendisi dahil): "cocuklara" → [cocuklara, cocuk, …], "cocugu" → [cocugu, cocug, cocuk] */
export function stemsOf(word: string): string[] {
  const out = [word]
  for (const s of SUFFIXES) {
    if (word.length - s.length < 3 || !word.endsWith(s)) continue
    const stem = word.slice(0, -s.length)
    out.push(stem)
    const last = stem[stem.length - 1] ?? ''
    const hard = UNSOFTEN[last]
    if (hard) out.push(stem.slice(0, -1) + hard)
  }
  return out
}

const capitalize = (s: string) => (s ? s[0]?.toLocaleUpperCase('tr-TR') + s.slice(1) : s)

/** On yıl adı: 1980 → "1980'ler", 1990 → "1990'lar" (okunuşun son hecesine göre ünlü uyumu) */
export function decadeName(year: number): string {
  const tens = Math.floor((year % 100) / 10)
  const lar = [1, 3, 4, 6, 9].includes(tens)
  return `${year}'${lar ? 'lar' : 'ler'}`
}

/* ───────────── Kurulum ───────────── */

interface MoodConcept {
  label: string
  tone: boolean
  moods: Set<MoodKey>
  tags: Set<string>
  phrases: Set<string>
}

/** Ton kavramları: aynı okunuşa (fold) düşen ruh hâli etiketleri, ölçek niteleyicileri ve yüz değerleri birleşir. */
function moodConcepts(vocabulary: TagVocabulary | null): Map<string, MoodConcept> {
  const concepts = new Map<string, MoodConcept>()
  const add = (label: string, tone: boolean, phrases: string[], mood?: MoodKey, tag?: string) => {
    const key = fold(label)
    let c = concepts.get(key)
    if (!c) concepts.set(key, (c = { label, tone, moods: new Set(), tags: new Set(), phrases: new Set() }))
    for (const p of phrases) if (fold(p)) c.phrases.add(fold(p))
    if (mood) c.moods.add(mood)
    if (tag) c.tags.add(tag)
  }
  for (const key of Object.keys(MOODS) as MoodKey[]) {
    if (MOOD_EXCLUDED.has(key)) continue
    const m = MOODS[key]
    add(m.displayName, m.isMood, [m.displayName, key.replace(/-/g, ' ')], key)
  }
  if (vocabulary) {
    for (const s of vocabulary.scales) {
      if (s.advisory?.reason === 'cinsellik') continue
      for (const d of s.descriptors) add(d.adjective, s.group !== 'FORM', [d.adjective], undefined, `d:${d.key}`)
    }
    for (const f of vocabulary.facets) {
      if (f.slot !== 'ADJECTIVE') continue
      for (const v of f.values) add(v.name, true, [v.name], undefined, `f:${f.key}:${v.key}`)
    }
  }
  return concepts
}

export interface LexiconInput {
  /** Etiket sözlüğü (etiketleme servisi yoksa null: yalnız taksonomi) */
  vocabulary: TagVocabulary | null
  /** Katalogdaki köken ülkeleri (ISO 3166-1 alpha-2) */
  countries: ReadonlySet<string>
  /** "yeni" için içinde bulunulan yıl */
  year: number
}

/** Niyet sözlüğünü kurar. Aynı sözcük dizisi iki kez eklenmez: önce eklenen tür kazanır (sıra aşağıda). */
export function buildIntentLexicon(input: LexiconInput): IntentLexicon {
  const entries: LexEntry[] = []
  const seen = new Set<string>()
  const add = (phrase: string, spec: IntentSpec, label: string, short: string, key: string) => {
    const words = fold(phrase).split(' ').filter(Boolean)
    const id = words.join(' ')
    if (!id || seen.has(id)) return
    seen.add(id)
    entries.push({ words, spec, label, short, key })
  }

  for (const [p, when] of LIVE_WORDS)
    add(
      p,
      { kind: 'LIVE', when },
      when === 'now' ? 'Yayın: Şu an canlı' : 'Yayın: Bu akşam',
      when === 'now' ? 'Canlı' : 'Bu akşam',
      `LIVE:${when}`,
    )
  for (const [p, type] of TYPE_WORDS) {
    const name = type === 'MOVIE' ? 'Film' : 'Dizi'
    add(p, { kind: 'TYPE', type }, `Biçim: ${name}`, name, `TYPE:${type}`)
  }
  for (const [p, audience] of AUDIENCE_WORDS) {
    const t = AUDIENCE_TEXT[audience]
    add(p, { kind: 'AUDIENCE', audience }, t.label, t.short, `AUDIENCE:${audience}`)
  }

  const countries = new Set(input.countries)
  countries.add('TR')
  for (const [code, c] of Object.entries(COUNTRY_NAMES)) {
    if (!countries.has(code)) continue
    for (const w of c.words) add(w, { kind: 'ORIGIN', countries: [code] }, `Köken: ${c.name}`, c.name, `ORIGIN:${code}`)
  }
  for (const r of input.vocabulary?.naming.regions ?? []) {
    const codes = r.countries.filter((c) => countries.has(c))
    if (codes.length === 0) continue
    const single = r.countries.length === 1 ? COUNTRY_NAMES[r.countries[0] ?? ''] : undefined
    const name = single?.name ?? r.adjective
    add(
      r.adjective,
      { kind: 'ORIGIN', countries: [...r.countries] },
      `Köken: ${name}`,
      name,
      `ORIGIN:${r.countries.join(',')}`,
    )
  }

  const genre = (phrase: string, g: GenreKey) =>
    add(phrase, { kind: 'GENRE', genres: [g] }, `Tür: ${GENRES[g].name}`, GENRES[g].name, `GENRE:${g}`)
  for (const g of Object.keys(GENRES) as GenreKey[]) {
    if (g === 'yerli') continue
    genre(GENRES[g].name, g)
    genre(g.replace(/-/g, ' '), g)
  }
  for (const [p, g] of GENRE_SYNONYMS) genre(p, g)

  const short = { kind: 'DURATION', min: null, max: SHORT_MAX_MIN, bare: 'short' } as const
  const long = { kind: 'DURATION', min: LONG_MIN_MIN, max: null, bare: 'long' } as const
  const shortLabel = `Süre: ${SHORT_MAX_MIN} dakikadan kısa`
  const longLabel = `Süre: ${LONG_MIN_MIN / 60} saat ve üzeri`
  for (const p of ['kısa', 'kısa ve öz']) add(p, { ...short }, shortLabel, 'Kısa', 'DURATION:short')
  for (const p of ['uzun', 'uzun metraj']) add(p, { ...long }, longLabel, 'Uzun', 'DURATION:long')

  add(
    'eski',
    { kind: 'ERA', from: null, to: OLD_BEFORE_YEAR - 1 },
    `Dönem: ${OLD_BEFORE_YEAR} öncesi`,
    'Eski',
    'ERA:old',
  )
  const recent = input.year - RECENT_YEARS + 1
  add('yeni', { kind: 'ERA', from: recent, to: null }, `Dönem: ${recent} ve sonrası`, 'Yeni', 'ERA:new')

  const concepts = moodConcepts(input.vocabulary)
  const moodEntry = (phrase: string, display: string, list: MoodConcept[]) => {
    if (list.length === 0) return
    const moods = [...new Set(list.flatMap((c) => [...c.moods]))]
    const tags = [...new Set(list.flatMap((c) => [...c.tags]))]
    const tone = list.some((c) => c.tone)
    const key = `MOOD:${fold(display)}`
    add(phrase, { kind: 'MOOD', moods, tags }, `${tone ? 'Ton' : 'Nitelik'}: ${display}`, display, key)
  }
  for (const c of concepts.values()) for (const p of c.phrases) moodEntry(p, capitalize(c.label), [c])
  for (const [p, names] of MOOD_SYNONYMS) {
    const list = names.map((n) => concepts.get(fold(n))).filter((c): c is MoodConcept => c !== undefined)
    moodEntry(p, capitalize(p), list)
  }

  const byFirst = new Map<string, LexEntry[]>()
  for (const e of entries) {
    const first = e.words[0] ?? ''
    const list = byFirst.get(first)
    if (list) list.push(e)
    else byFirst.set(first, [e])
  }
  for (const list of byFirst.values()) list.sort((a, b) => b.words.length - a.words.length)
  return { byFirst, stopwords: new Set(STOPWORDS.map(fold)) }
}
