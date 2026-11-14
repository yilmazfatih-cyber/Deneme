/**
 * Yazarken tamamlama tahminleri (saf). Adaylar: başlıklar, kişiler, türler, koleksiyonlar, kanal adları ve
 * daha önce tıklamayla sonuçlanmış sorgular. Her aday aynı lojistik modelle puanlanır:
 *   metin      ad öneki (tam ad 1 · önek 0.85) ya da kelime başı (0.6) — Türkçe duyarsız (norm)
 *   begeni     profilin zevkiyle benzerlik (kişi/tür/koleksiyonda en benzer başlığı)
 *   populerlik katalog + son 24 saat
 *   tiklanma   bu ÖNEK için öğrenilmiş tıklanma ("sin" yazanlar Sintel'i seçti)
 * Öğrenilmiş sorguda tiklanma = sorgunun olumlu tepki sayısından yumuşatılmış oran.
 * Boş önek: profilin son aramaları, yarım kalan başlıklar, sonra çok tıklananlar/popülerler.
 * Sonuç: en iyi önce, metne göre tekilleştirilmiş, en çok `first`.
 */
import { norm } from '../../../../../shared/text'
import type { SearchDoc } from '../searchIndex'
import type { SearchPredictionResult as BasePrediction } from '../types'
import { NEUTRAL, queryKeys, PREFIX_MAX, type WeightedKey } from './features'
import { learnedQueryCtr, type LearnedQuery } from './model'
import type { SearchRanker } from './ranker'

export type PredictionKind = 'TITLE' | 'PERSON' | 'GENRE' | 'COLLECTION' | 'CHANNEL' | 'QUERY'

export interface SearchPredictionResult extends BasePrediction {
  kind: PredictionKind
}

export const DEFAULT_COMPLETIONS = 8
export const MAX_COMPLETIONS = 30
/** Boş önekte son aramaların puanı: 0.5, 0.5·0.85, … (model dışı; yazmadan önce en olası arama budur) */
const RECENT_BASE = 0.5
const RECENT_DECAY = 0.85

export const MATCH = { exact: 100, prefix: 85, wordPrefix: 60 } as const

const KIND_OF: Partial<Record<SearchDoc['type'], PredictionKind>> = {
  video: 'TITLE',
  person: 'PERSON',
  genre: 'GENRE',
  collection: 'COLLECTION',
  channel: 'CHANNEL',
}

/** Önek eşleşme puanı (match.ts ölçeğinde): tam 100 · ad öneki 85 · kelime başı 60 · yoksa 0. */
export function prefixMatch(text: string, prefix: string): number {
  const t = norm(text)
  if (!prefix || !t) return 0
  if (t === prefix) return MATCH.exact
  if (t.startsWith(prefix)) return MATCH.prefix
  if (t.includes(` ${prefix}`)) return MATCH.wordPrefix
  return 0
}

/** Bir belgenin adlarıyla (ad + özgün ad) en iyi önek eşleşmesi. */
function docPrefixMatch(doc: SearchDoc, prefix: string): number {
  let best = prefixMatch(doc.displayString, prefix)
  for (const f of doc.fields) if (f.kind === 'alt') best = Math.max(best, prefixMatch(f.text, prefix))
  return best
}

/**
 * Önek sayaç anahtarı: yazılan önek (tam ağırlık); 4 harften uzunsa en yakın saklanan önek (4 harf) de yarım ağırlıkla.
 */
export function completionKeys(prefix: string): WeightedKey[] {
  const p = norm(prefix)
  if (!p) return [{ key: '', weight: 1 }]
  const keys: WeightedKey[] = [{ key: p, weight: 1 }]
  if (p.length > PREFIX_MAX) keys.push({ key: p.slice(0, PREFIX_MAX).trimEnd(), weight: 0.5 })
  return keys
}

export interface CompletionInput {
  prefix: string
  first: number
  /** Profilin görebildiği belgeler (yayınlar hariç tutulur) */
  docs: readonly SearchDoc[]
  ranker: SearchRanker
  /** Öğrenilmiş sorgular (görünürlüğü süzülmüş) */
  learned: readonly LearnedQuery[]
  recentSearches: readonly string[]
}

const r4 = (n: number) => Math.round(n * 10_000) / 10_000

function dedupe(cands: SearchPredictionResult[], first: number): SearchPredictionResult[] {
  const best = new Map<string, SearchPredictionResult>()
  for (const c of cands) {
    const k = norm(c.text)
    if (!k) continue
    const cur = best.get(k)
    if (!cur) {
      best.set(k, c)
      continue
    }
    // Aynı metin tek kez: puan en yükseği; varlığı olan sürüm (TITLE/PERSON…) sorgu sürümüne yeğlenir.
    const curHas = cur.unifiedEntityId !== null
    const cHas = c.unifiedEntityId !== null
    const pick = curHas === cHas ? (c.score > cur.score ? c : cur) : cHas ? c : cur
    best.set(k, { ...pick, score: Math.max(cur.score, c.score) })
  }
  return [...best.values()]
    .sort((a, b) => b.score - a.score || a.text.localeCompare(b.text, 'tr'))
    .slice(0, first)
    .map((c) => ({ ...c, score: r4(c.score) }))
}

export function predictCompletionsPure(input: CompletionInput): SearchPredictionResult[] {
  const first = Math.max(1, Math.min(MAX_COMPLETIONS, Math.floor(input.first || DEFAULT_COMPLETIONS)))
  const prefix = norm(input.prefix)
  const { ranker } = input
  const cands: SearchPredictionResult[] = []

  if (!prefix) {
    input.recentSearches.forEach((q, i) => {
      if (norm(q))
        cands.push({ text: q, kind: 'QUERY', unifiedEntityId: null, score: RECENT_BASE * Math.pow(RECENT_DECAY, i) })
    })
    const empty = queryKeys('')
    for (const doc of input.docs) {
      if (doc.type !== 'video' || ranker.isDisliked(doc.videoId ?? 0)) continue
      // Yarım kalanlar devam özniteliğiyle, diğerleri genel tıklanma ve popülerlikle öne çıkar.
      const s = ranker.scoreEntity(doc, 0, empty)
      cands.push({ text: doc.displayString, kind: 'TITLE', unifiedEntityId: doc.key, score: s.score })
    }
    return dedupe(cands, first)
  }

  const keys = completionKeys(prefix)
  for (const doc of input.docs) {
    const kind = KIND_OF[doc.type]
    if (!kind) continue
    if (doc.type === 'video' && ranker.isDisliked(doc.videoId ?? 0)) continue
    const m = docPrefixMatch(doc, prefix)
    if (m <= 0) continue
    const s = ranker.scoreEntity(doc, m, keys)
    cands.push({ text: doc.displayString, kind, unifiedEntityId: doc.key, score: s.score })
  }
  for (const q of input.learned) {
    const m = prefixMatch(q.text, prefix)
    // Yazılanın aynısı olan sorgu tamamlama değildir
    if (m <= 0 || norm(q.text) === prefix) continue
    const score = ranker.scoreVector({ ...NEUTRAL, metin: m / 100, tiklanma: learnedQueryCtr(q) })
    cands.push({ text: q.text, kind: 'QUERY', unifiedEntityId: null, score })
  }
  return dedupe(cands, first)
}
