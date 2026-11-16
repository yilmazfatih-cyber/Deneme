/**
 * Niyet çözümleyici (saf): Türkçe sorgu → niyetler + kalan serbest metin.
 *
 *   "kısa düşündürücü bilim kurgu" → DURATION(kısa) · MOOD(düşündürücü) · GENRE(bilim kurgu), kalan ''
 *   "90 dakikadan kısa komedi"     → DURATION(< 90 dk) · GENRE(komedi)
 *   "80lerden korku filmi"         → ERA(1980'ler) · GENRE(korku) · TYPE(film)
 *
 * Her konumda sırayla denenir: sayılı süre ("90 dakikadan kısa", "en fazla 2 saat", "yarım saatlik", "1,5 saat"),
 * dönem ("90'lar", "80lerden", "1980'li yıllar", "2010 sonrası", "2000'den önce"), sonra sözlük ifadeleri en uzun önce
 * (sözcük sonu ekleri kökle eşleşir: "komediler", "dizisi", "çocuklar için"). Kalan sözcüklerden dolgu sözcükleri
 * ("izlenecek", "bir", "için") atılır; geri kalanı metin eşleşmesine gider.
 */
import { tokenize } from '../match'
import { decadeName, fold, stemsOf, type IntentKind, type IntentLexicon, type IntentSpec } from './lexicon'

export interface ParsedIntent {
  kind: IntentKind
  /** Sorguda eşleşen parça, yazıldığı gibi */
  matched: string
  /** "Süre: 40 dakikadan kısa" */
  label: string
  /** Gerekçe için kısa ad: "Kısa" */
  short: string
  /** Bu parça çıkarılınca kalan sorgu (boşluklar düzeltilmiş; boş olabilir) */
  without: string
  spec: IntentSpec
  /** Tekilleştirme anahtarı */
  key: string
}

export interface ParsedQuery {
  /** Sorgudaki sırayla */
  intents: ParsedIntent[]
  /** Niyet ve dolgu sözcükleri dışında kalanlar, yazıldığı gibi ('' olabilir) */
  remainder: string
  /** remainder'ın metin eşleşmesi kelimeleri (match.tokenize) */
  remainderTokens: string[]
}

interface Tok {
  raw: string
  fold: string
  stems: string[]
  start: number
  end: number
}

interface Found {
  len: number
  spec: IntentSpec
  label: string
  short: string
  key: string
}

/* ───────────── Sözcüklere ayırma ───────────── */

const WORD = /[\p{L}\p{N}'’‘`´]+/gu
/** "90dk", "2saatlik": sayı ile birim bitişik yazılmışsa iki sözcük sayılır */
const GLUED_UNIT = /^(\d+)((?:dk|dakika|saat)[a-z]*)$/

function lex(term: string): Tok[] {
  const out: Tok[] = []
  const push = (raw: string, f: string, start: number, end: number) =>
    out.push({ raw, fold: f, stems: stemsOf(f), start, end })
  for (const m of term.matchAll(WORD)) {
    const raw = m[0]
    const start = m.index
    const end = start + raw.length
    for (const f of fold(raw).split(' ')) {
      if (!f) continue
      const g = GLUED_UNIT.exec(f)
      if (g?.[1] && g[2]) {
        push(raw, g[1], start, end)
        push(raw, g[2], start, end)
      } else push(raw, f, start, end)
    }
  }
  return out
}

const has = (t: Tok | undefined, words: readonly string[]) => !!t && t.stems.some((s) => words.includes(s))

/* ───────────── Süre ───────────── */

const NUMBER_WORDS: Record<string, number> = {
  yarim: 0.5,
  bir: 1,
  iki: 2,
  uc: 3,
  dort: 4,
  bes: 5,
  on: 10,
  yirmi: 20,
  otuz: 30,
  kirk: 40,
  elli: 50,
  altmis: 60,
  doksan: 90,
}
const ABLATIVE = ['dan', 'den', 'tan', 'ten']
const UNIT_RESTS = new Set(['', 'lik', 'luk', ...ABLATIVE])
const SHORTER = ['kisa', 'az', 'asagi', 'dusuk']
const LONGER = ['uzun', 'fazla', 'cok', 'yukari']
const UNDER = ['alti', 'altinda', 'altindaki', 'asagisi']
const OVER = ['ustu', 'uzeri', 'ustunde', 'ustundeki', 'fazlasi']
/** Süre üst sınırı (dk): bunun üstü süre sayılmaz ("2400 yıllık" gibi) */
const MAX_MINUTES = 600

function readNumber(toks: Tok[], i: number, term: string): { value: number; len: number } | null {
  const t = toks[i]
  if (!t) return null
  let value: number
  let len = 1
  if (/^\d+$/.test(t.fold)) {
    value = Number(t.fold)
    const next = toks[i + 1]
    // "1,5 saat" / "1.5 saat"
    if (next && /^\d+$/.test(next.fold) && /^[.,]$/.test(term.slice(t.end, next.start))) {
      value = Number(`${t.fold}.${next.fold}`)
      len = 2
    }
  } else {
    const w = NUMBER_WORDS[t.fold]
    if (w === undefined) return null
    value = w
  }
  if (toks[i + len]?.fold === 'bucuk') {
    value += 0.5
    len++
  }
  return value > 0 ? { value, len } : null
}

function readUnit(t: Tok | undefined): { unit: 'dakika' | 'saat'; rest: string } | null {
  if (!t) return null
  for (const [prefix, unit] of [
    ['dakika', 'dakika'],
    ['dk', 'dakika'],
    ['saat', 'saat'],
  ] as const) {
    if (!t.fold.startsWith(prefix)) continue
    const rest = t.fold.slice(prefix.length)
    return UNIT_RESTS.has(rest) ? { unit, rest } : null
  }
  return null
}

function matchDuration(toks: Tok[], i: number, term: string): Found | null {
  let j = i
  let bound: 'le' | 'ge' | null = null
  if (toks[j]?.fold === 'en') {
    const w = toks[j + 1]?.fold
    if (w === 'fazla' || w === 'cok') bound = 'le'
    else if (w === 'az') bound = 'ge'
    else return null
    j += 2
  }
  const num = readNumber(toks, j, term)
  if (!num) return null
  j += num.len
  const u = readUnit(toks[j])
  if (!u) return null
  j++
  // Ayrı yazılmış ek: "90 dk dan kısa"
  if (u.rest === '' && ABLATIVE.includes(toks[j]?.fold ?? '')) {
    u.rest = toks[j]?.fold ?? ''
    j++
  }
  const minutes = num.value * (u.unit === 'saat' ? 60 : 1)
  if (minutes > MAX_MINUTES) return null

  let cmp: 'lt' | 'gt' | 'le' | 'ge' | 'approx' = bound ?? 'approx'
  if (!bound) {
    const c = toks[j]
    if (ABLATIVE.includes(u.rest)) {
      if (has(c, SHORTER)) cmp = 'lt'
      else if (has(c, LONGER)) cmp = 'gt'
      if (cmp !== 'approx') j++
    } else if (c && UNDER.includes(c.fold)) {
      cmp = 'lt'
      j++
    } else if (c && OVER.includes(c.fold)) {
      cmp = 'ge'
      j++
    } else if (c?.fold === 've' && toks[j + 1] && OVER.includes(toks[j + 1]?.fold ?? '')) {
      cmp = 'ge'
      j += 2
    }
  }

  const amount = u.unit === 'saat' && num.value === 0.5 ? 'yarım' : String(num.value).replace('.', ',')
  const abl = u.unit === 'saat' ? 'saatten' : 'dakikadan'
  const unit = u.unit
  const text = {
    lt: `${amount} ${abl} kısa`,
    gt: `${amount} ${abl} uzun`,
    le: `en fazla ${amount} ${unit}`,
    ge: `${amount} ${unit} ve üzeri`,
    approx: `yaklaşık ${amount} ${unit}`,
  }[cmp]
  const eps = 0.01
  const range = {
    lt: [null, minutes],
    gt: [minutes + eps, null],
    le: [null, minutes + eps],
    ge: [minutes, null],
    approx: [minutes * 0.75, minutes * 1.25 + eps],
  }[cmp]
  return {
    len: j - i,
    spec: { kind: 'DURATION', min: range[0] ?? null, max: range[1] ?? null, bare: null },
    label: `Süre: ${text}`,
    short: text[0]?.toLocaleUpperCase('tr-TR') + text.slice(1),
    key: `DURATION:${cmp}:${minutes}`,
  }
}

/* ───────────── Dönem ───────────── */

const DECADE = /^(\d{2}|\d{4})(l[aeiu][a-z]*)$/
const YEAR = /^(\d{4})(dan|den|tan|ten)?$/
const AFTER = ['sonrasi', 'sonra', 'sonrasinda', 'sonrasindaki', 'itibaren']
const BEFORE = ['oncesi', 'once', 'oncesinde', 'oncesindeki']

function matchEra(toks: Tok[], i: number): Found | null {
  const t = toks[i]
  if (!t) return null
  const d = DECADE.exec(t.fold)
  if (d?.[1]) {
    const n = Number(d[1])
    if (n % 10 !== 0) return null
    const year = d[1].length === 2 ? (n <= 20 ? 2000 + n : 1900 + n) : n
    if (year < 1880 || year > 2090) return null
    const len = toks[i + 1]?.fold.startsWith('yil') ? 2 : 1
    const name = decadeName(year)
    return {
      len,
      spec: { kind: 'ERA', from: year, to: year + 9 },
      label: `Dönem: ${name}`,
      short: name,
      key: `ERA:${year}s`,
    }
  }
  const y = YEAR.exec(t.fold)
  if (!y?.[1]) return null
  const year = Number(y[1])
  if (year < 1888 || year > 2100) return null
  let j = i + 1
  if (toks[j]?.fold === 've') j++
  const w = toks[j]
  if (has(w, AFTER))
    return {
      len: j + 1 - i,
      spec: { kind: 'ERA', from: year, to: null },
      label: `Dönem: ${year} ve sonrası`,
      short: `${year} ve sonrası`,
      key: `ERA:>=${year}`,
    }
  if (j === i + 1 && has(w, BEFORE))
    return {
      len: 2,
      spec: { kind: 'ERA', from: null, to: year - 1 },
      label: `Dönem: ${year} öncesi`,
      short: `${year} öncesi`,
      key: `ERA:<${year}`,
    }
  return null
}

/* ───────────── Sözlük ───────────── */

function matchLexicon(toks: Tok[], i: number, lexicon: IntentLexicon): Found | null {
  const t = toks[i]
  if (!t) return null
  let best: { len: number; e: NonNullable<ReturnType<IntentLexicon['byFirst']['get']>>[number] } | null = null
  for (const stem of t.stems) {
    for (const e of lexicon.byFirst.get(stem) ?? []) {
      const n = e.words.length
      if (best && best.len >= n) break
      let ok = true
      for (let k = 1; k < n && ok; k++) ok = !!toks[i + k]?.stems.includes(e.words[k] ?? '')
      if (ok) best = { len: n, e }
    }
  }
  if (!best) return null
  const { e } = best
  return { len: best.len, spec: e.spec, label: e.label, short: e.short, key: e.key }
}

/* ───────────── Çözümleme ───────────── */

const squash = (s: string) => s.replace(/\s+/g, ' ').trim()

/** Sorguyu çözümler. Hiç niyet bulunmazsa `intents` boştur ve kalan metin sorgunun kendisidir. */
export function parseQuery(term: string, lexicon: IntentLexicon): ParsedQuery {
  const toks = lex(term)
  const found: (Found & { start: number; end: number })[] = []
  const rest: Tok[] = []
  const stop: Tok[] = []
  let i = 0
  while (i < toks.length) {
    const f = matchDuration(toks, i, term) ?? matchEra(toks, i) ?? matchLexicon(toks, i, lexicon)
    if (f) {
      const first = toks[i]
      const last = toks[i + f.len - 1]
      if (first && last) found.push({ ...f, start: first.start, end: last.end })
      i += f.len
      continue
    }
    const t = toks[i]
    if (t) (lexicon.stopwords.has(t.fold) ? stop : rest).push(t)
    i++
  }
  if (found.length === 0) {
    const remainder = squash(term)
    return { intents: [], remainder, remainderTokens: tokenize(remainder) }
  }

  const keys = new Set<string>()
  const intents: ParsedIntent[] = []
  for (const f of found) {
    if (keys.has(f.key)) continue
    keys.add(f.key)
    intents.push({
      kind: f.spec.kind,
      matched: term.slice(f.start, f.end),
      label: f.label,
      short: f.short,
      without: squash(`${term.slice(0, f.start)} ${term.slice(f.end)}`),
      spec: f.spec,
      key: f.key,
    })
  }
  // Bitişik yazılıp ikiye bölünen sözcük ("90dk") kalanda bir kez görünür.
  const words: string[] = []
  let lastStart = -1
  for (const t of rest) {
    if (t.start === lastStart) continue
    lastStart = t.start
    words.push(t.raw)
  }
  const remainder = words.join(' ')
  return { intents, remainder, remainderTokens: tokenize(remainder) }
}
