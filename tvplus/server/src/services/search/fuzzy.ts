/**
 * Yazım hatası toleransı. Sonuç yoksa ya da en iyi puan zayıfsa (< 50) sorgu düzeltilip yeniden çalıştırılır.
 *   - Damerau–Levenshtein (yer değiştirme = 1 düzenleme), dizindeki kelime sözlüğüne karşı.
 *   - İzinli düzenleme: ≤ 3 harf 0 · 4–7 harf 1 · ≥ 8 harf 2.
 *   - İlk harf aynı olmalı; rakam içeren ve sözlükte zaten olan kelimeler asla "düzeltilmez".
 *   - Son kelimede önek toleransı (yazı sürüyor): "mastrc" → "masterchef".
 *   - Boşluk onarımı: "kanald" → "kanal d".
 */
import type { Vocabulary } from './searchIndex'

/** Sonuç bu puanın altındaysa düzeltme denenir. */
export const WEAK_SCORE = 50

export function allowedEdits(len: number): number {
  if (len <= 3) return 0
  if (len <= 7) return 1
  return 2
}

/**
 * Kısıtlı Damerau–Levenshtein (optimal string alignment): ekleme, silme, değiştirme ve
 * komşu iki harfin yer değiştirmesi 1'er düzenlemedir. `max` verilirse erken çıkar (max + 1 döner).
 */
export function damerauLevenshtein(a: string, b: string, max = Infinity): number {
  if (a === b) return 0
  const n = a.length
  const m = b.length
  if (Math.abs(n - m) > max) return max + 1
  if (n === 0) return m
  if (m === 0) return n
  // Üç satır yeterli: i-2, i-1, i
  let prev2 = new Array<number>(m + 1).fill(0)
  let prev = Array.from({ length: m + 1 }, (_, j) => j)
  let cur = new Array<number>(m + 1).fill(0)
  for (let i = 1; i <= n; i++) {
    cur[0] = i
    let rowMin = i
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let v = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, (prev2[j - 2] ?? 0) + 1)
      cur[j] = v
      if (v < rowMin) rowMin = v
    }
    if (rowMin > max) return max + 1
    const t = prev2
    prev2 = prev
    prev = cur
    cur = t
  }
  return prev[m] ?? 0
}

/** Kelimenin herhangi bir önekine en küçük uzaklık (yalnız token uzunluğu ± izin aralığındaki önekler). */
export function prefixDistance(token: string, word: string, max: number): number {
  let best = max + 1
  const lo = Math.max(1, token.length - max)
  const hi = Math.min(word.length, token.length + max)
  for (let len = lo; len <= hi; len++) {
    const d = damerauLevenshtein(token, word.slice(0, len), max)
    if (d < best) best = d
    if (best === 0) break
  }
  return best
}

const hasDigit = (s: string) => /\d/.test(s)

/** Kelime dizinde doğrudan eşleşir mi: sözlükte var ya da (en az 2 harfle) bir sözlük kelimesinin öneki. */
export function isKnownToken(token: string, vocab: Vocabulary): boolean {
  if (vocab.words.has(token)) return true
  if (token.length < 2) return false
  const list = vocab.byFirst.get(token[0] ?? '') ?? []
  return list.some((w) => w.startsWith(token))
}

export type CorrectionKind = 'none' | 'split' | 'edit' | 'prefix'

export interface TokenCorrection {
  /** Düzeltilmiş hâli; boşluk onarımında iki kelime ("kanal d") */
  value: string
  kind: CorrectionKind
  distance: number
}

const freq = (vocab: Vocabulary, w: string) => vocab.words.get(w) ?? 0

/** Boşluk onarımı. strong: ikili bir adda gerçekten yan yana geçiyor; weak: iki yarı da sözlükte ve ≥ 3 harf. */
function splitRepair(token: string, vocab: Vocabulary): { strong: string | null; weak: string | null } {
  let strong: string | null = null
  let weak: string | null = null
  // En uzun sol yarıdan başla: "kanald" → "kanal d"
  for (let i = token.length - 1; i >= 1; i--) {
    const left = token.slice(0, i)
    const right = token.slice(i)
    if (!vocab.words.has(left) || !vocab.words.has(right)) continue
    const pair = `${left} ${right}`
    if (!strong && vocab.bigrams.has(pair)) strong = pair
    if (!weak && left.length >= 3 && right.length >= 3) weak = pair
  }
  return { strong, weak }
}

/** Tek kelimeyi düzeltir; düzeltme yoksa kind 'none' ve değer aynen döner. */
export function correctToken(token: string, vocab: Vocabulary, isLast: boolean): TokenCorrection {
  const keep: TokenCorrection = { value: token, kind: 'none', distance: 0 }
  if (!token || hasDigit(token) || isKnownToken(token, vocab)) return keep

  const split = splitRepair(token, vocab)
  if (split.strong) return { value: split.strong, kind: 'split', distance: 1 }

  const max = allowedEdits(token.length)
  if (max > 0) {
    const candidates = vocab.byFirst.get(token[0] ?? '') ?? []
    let editBest: { w: string; d: number } | null = null
    let prefixBest: { w: string; d: number } | null = null
    for (const w of candidates) {
      const d = damerauLevenshtein(token, w, max)
      if (d <= max && (!editBest || d < editBest.d || (d === editBest.d && freq(vocab, w) > freq(vocab, editBest.w)))) {
        editBest = { w, d }
      }
      if (isLast && w.length > token.length - max) {
        const pd = prefixDistance(token, w, max)
        if (
          pd <= max &&
          (!prefixBest || pd < prefixBest.d || (pd === prefixBest.d && freq(vocab, w) > freq(vocab, prefixBest.w)))
        ) {
          prefixBest = { w, d: pd }
        }
      }
    }
    if (editBest && (!prefixBest || editBest.d <= prefixBest.d))
      return { value: editBest.w, kind: 'edit', distance: editBest.d }
    if (prefixBest) return { value: prefixBest.w, kind: 'prefix', distance: prefixBest.d }
  }

  if (split.weak) return { value: split.weak, kind: 'split', distance: 1 }
  return keep
}

export interface QueryCorrection {
  tokens: string[]
  changed: boolean
  corrections: TokenCorrection[]
}

/** Sorgunun tüm kelimelerini düzeltir; boşluk onarımı kelime sayısını artırabilir. */
export function correctQuery(tokens: readonly string[], vocab: Vocabulary): QueryCorrection {
  const out: string[] = []
  const corrections: TokenCorrection[] = []
  let changed = false
  tokens.forEach((t, i) => {
    const c = correctToken(t, vocab, i === tokens.length - 1)
    corrections.push(c)
    if (c.kind !== 'none') changed = true
    out.push(...c.value.split(' '))
  })
  return { tokens: out, changed, corrections }
}
