/**
 * Eşleştirme ve puanlama (ürünün mevcut kuralları):
 *   tam ad 100 · ad öneki 85 · kelime başı ≈ 56–62 · kelime içi 25
 * İkincil alanlar (anahtar kelime, kişi, tür, ruh hâli, özet) ağırlıklarıyla çarpılır.
 * Çok kelimeli sorguda her kelime bir yerde eşleşmelidir (VE); puan, kelimelerin en iyi alan puanlarının
 * toplamının kelime sayısına bölümüdür (aynı sorgu için sıralama toplamla aynıdır, eşikler tek kelimeyle kıyaslanabilir).
 * Bütün ifade bir adla tam/önek eşleşirse o puan da aday olur.
 */
import { norm } from '../../../../shared/text'
import { FIELD_WEIGHTS, TITLE_FIELDS, type IndexedField, type SearchDoc } from './searchIndex'

export const SCORE = {
  EXACT: 100,
  PREFIX: 85,
  WORD_START_MAX: 62,
  WORD_START_MIN: 56,
  INSIDE: 25,
  /** Özette tam kelime / kelime başı (ağırlıktan önce) */
  SYNOPSIS_WORD: 40,
  SYNOPSIS_PREFIX: 30,
} as const

/** Kelime içi eşleşme için en kısa kelime (1–2 harf her şeyin içinde geçer). */
const MIN_INSIDE_LEN = 3

/** Tek kelimenin bir alandaki ham puanı (ağırlıksız). */
export function scoreTokenInField(token: string, f: IndexedField): number {
  if (!token) return 0
  if (f.kind === 'number') return f.text === token ? SCORE.EXACT : 0
  if (f.kind === 'synopsis') {
    let best = 0
    for (const w of f.words) {
      if (w === token) return SCORE.SYNOPSIS_WORD
      if (token.length >= MIN_INSIDE_LEN && w.startsWith(token)) best = SCORE.SYNOPSIS_PREFIX
    }
    return best
  }
  if (f.text === token) return SCORE.EXACT
  const first = f.words[0] ?? ''
  if (first.startsWith(token)) return SCORE.PREFIX
  for (let i = 1; i < f.words.length; i++) {
    if ((f.words[i] ?? '').startsWith(token))
      return SCORE.WORD_START_MAX - Math.min(i - 1, SCORE.WORD_START_MAX - SCORE.WORD_START_MIN)
  }
  if (token.length >= MIN_INSIDE_LEN && f.text.includes(token)) return SCORE.INSIDE
  return 0
}

/** Bütün ifadenin (çok kelimeli sorgu) bir alandaki ham puanı. */
export function scorePhraseInField(phrase: string, f: IndexedField): number {
  if (f.kind === 'synopsis' || f.kind === 'number' || !phrase) return 0
  if (f.text === phrase) return SCORE.EXACT
  if (f.text.startsWith(phrase)) return SCORE.PREFIX
  if (f.text.includes(` ${phrase}`)) return SCORE.WORD_START_MAX
  return 0
}

export interface DocMatch {
  doc: SearchDoc
  score: number
  /** Eşleşme başlık/ad üzerinden mi (BOXART) yoksa kişi/anahtar kelime/tür üzerinden mi (STORY_ART) */
  onTitle: boolean
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Bir belgeyi kelimelere göre puanlar; herhangi bir kelime hiçbir alanda eşleşmezse null (VE kuralı). */
export function matchDoc(doc: SearchDoc, tokens: readonly string[]): DocMatch | null {
  if (tokens.length === 0) return null
  let sum = 0
  let allOnTitle = true
  for (const token of tokens) {
    let best = 0
    let bestOnTitle = false
    for (const f of doc.fields) {
      const s = scoreTokenInField(token, f) * FIELD_WEIGHTS[f.kind]
      if (s > best || (s === best && s > 0 && TITLE_FIELDS.has(f.kind))) {
        best = s
        bestOnTitle = TITLE_FIELDS.has(f.kind)
      }
    }
    if (best <= 0) return null
    sum += best
    if (!bestOnTitle) allOnTitle = false
  }
  const tokenScore = sum / tokens.length

  let phraseScore = 0
  let phraseOnTitle = false
  if (tokens.length > 1) {
    const phrase = tokens.join(' ')
    for (const f of doc.fields) {
      const s = scorePhraseInField(phrase, f) * FIELD_WEIGHTS[f.kind]
      if (s > phraseScore) {
        phraseScore = s
        phraseOnTitle = TITLE_FIELDS.has(f.kind)
      }
    }
  }
  if (phraseScore > tokenScore) return { doc, score: round2(phraseScore), onTitle: phraseOnTitle }
  return { doc, score: round2(tokenScore), onTitle: allOnTitle }
}

/** Sorgu metnini kelimelere ayırır (norm ile). */
export function tokenize(term: string): string[] {
  const n = norm(term)
  return n ? n.split(' ') : []
}

/** Eşitlikte popülerlik, sonra ad (Türkçe sıralama). */
const collator = new Intl.Collator('tr', { sensitivity: 'base' })
export function compareMatches(a: DocMatch, b: DocMatch): number {
  return (
    b.score - a.score ||
    b.doc.popularity - a.doc.popularity ||
    collator.compare(a.doc.displayString, b.doc.displayString)
  )
}

/** Verilen belgeler içinde eşleşenleri puan sırasıyla döndürür. */
export function matchAll(docs: readonly SearchDoc[], tokens: readonly string[]): DocMatch[] {
  const out: DocMatch[] = []
  for (const d of docs) {
    const m = matchDoc(d, tokens)
    if (m) out.push(m)
  }
  return out.sort(compareMatches)
}
