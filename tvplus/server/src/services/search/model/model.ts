/**
 * Arama tahmin modeli: lojistik regresyon, p(tıklama | sorgu, profil, başlık) = σ(w · x + b).
 *
 * - Ağırlıklar elle seçilmiş ön değerlerden (PRIOR_WEIGHTS) başlar: metin varken baskındır.
 * - Her geri bildirim bir SGD adımıdır: olumlu (CLICK 1 · ADD_TO_LIST 1.2 · PLAY 1.5), aynı yanıtta tıklananın
 *   üstünde gösterilenler zayıf olumsuz (0.3), DISMISS olumsuz (1).
 * - Öğrenme hızı küçüktür, L2 terimi ağırlıkları ön değerlere çeker ve her ağırlık sınırları içinde kırpılır
 *   (WEIGHT_BOUNDS). metin ağırlığının alt sınırı pozitiftir: diğer öznitelikler eşitken metin puanı yüksek olan
 *   hiçbir zaman aşağıda kalmaz.
 * - Puanlamada rastgelelik yoktur: aynı durum + aynı girdi → aynı puan.
 *
 * Durum (ağırlıklar, sorgu/önek sayaçları, öğrenilen sorgular, güncelleme sayısı) `.data/search-model.json`.
 */
import {
  CTR_PRIOR_MEAN,
  FEATURE_NAMES,
  NEUTRAL,
  type FeatureName,
  type FeatureVector,
  type PairCounters,
  type WeightedKey,
} from './features'

export const MODEL_ID = 'lr-1'
export const STATE_VERSION = 1

export const PRIOR_WEIGHTS: FeatureVector = {
  metin: 6,
  begeni: 1.6,
  populerlik: 1.4,
  tiklanma: 3,
  yenilik: 0.5,
  devam: 1.2,
}
export const PRIOR_BIAS = -4.6

export const WEIGHT_BOUNDS: Record<FeatureName, readonly [number, number]> = {
  metin: [3, 10],
  begeni: [0, 4],
  populerlik: [0, 3],
  tiklanma: [0.5, 6],
  yenilik: [0, 1.5],
  devam: [0, 3],
}
export const BIAS_BOUNDS = [-8, -1] as const

export const LEARNING_RATE = 0.08
export const L2_TO_PRIOR = 0.02

export type FeedbackAction = 'CLICK' | 'PLAY' | 'ADD_TO_LIST' | 'DISMISS'
export const FEEDBACK_ACTIONS: readonly FeedbackAction[] = ['CLICK', 'PLAY', 'ADD_TO_LIST', 'DISMISS']

/** Geri bildirimin hedefi (y) ve gücü (SGD adımının ve sayaç artışının çarpanı). */
export const ACTION_SIGNAL: Record<FeedbackAction, { y: 0 | 1; strength: number }> = {
  CLICK: { y: 1, strength: 1 },
  ADD_TO_LIST: { y: 1, strength: 1.2 },
  PLAY: { y: 1, strength: 1.5 },
  DISMISS: { y: 0, strength: 1 },
}
export const WEAK_NEGATIVE_STRENGTH = 0.3

/** Depo sınırları (prototip ölçeği; en az kullanılanlar budanır). */
export const MAX_KEYS = 3000
export const MAX_ENTITIES_PER_KEY = 200
export const MAX_QUERIES = 500
/** Tamamlamalar için hatırlanan sorgunun en kısa uzunluğu */
export const MIN_QUERY_LENGTH = 2

export interface LearnedQuery {
  /** Kullanıcının yazdığı biçim (gösterim için) */
  text: string
  /** Bu sorgudan sonra gelen olumlu tepki sayısı (ağırlıklı) */
  clicks: number
  /** Son olumlu tepkinin varlığı (görünürlük denetimi için) */
  entityId: string
  /** ISO zaman */
  last: string
}

export interface ModelState {
  version: number
  weights: FeatureVector
  bias: number
  /** Kaydedilen geri bildirim sayısı */
  updates: number
  pairs: PairCounters
  /** Düzleştirilmiş sorgu → öğrenilen (başarılı) sorgu */
  queries: Record<string, LearnedQuery>
}

export function initialModelState(): ModelState {
  return { version: STATE_VERSION, weights: { ...PRIOR_WEIGHTS }, bias: PRIOR_BIAS, updates: 0, pairs: {}, queries: {} }
}

const finite = (n: unknown, fallback: number) => (typeof n === 'number' && Number.isFinite(n) ? n : fallback)
const clampTo = (n: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, n))

/** Diskten okunan durumu doğrular; bozuk alanlar ön değere döner (eksik dosya sunucuyu düşürmez). */
export function sanitizeModelState(raw: unknown): ModelState {
  const base = initialModelState()
  if (!raw || typeof raw !== 'object') return base
  const r = raw as Partial<ModelState>
  const weights = { ...base.weights }
  for (const f of FEATURE_NAMES) weights[f] = clampTo(finite(r.weights?.[f], PRIOR_WEIGHTS[f]), WEIGHT_BOUNDS[f])
  const pairs: PairCounters = {}
  if (r.pairs && typeof r.pairs === 'object') {
    for (const [k, byEntity] of Object.entries(r.pairs)) {
      if (!byEntity || typeof byEntity !== 'object') continue
      const row: Record<string, [number, number]> = {}
      for (const [e, c] of Object.entries(byEntity)) {
        if (Array.isArray(c)) row[e] = [Math.max(0, finite(c[0], 0)), Math.max(0, finite(c[1], 0))]
      }
      pairs[k] = row
    }
  }
  const queries: Record<string, LearnedQuery> = {}
  if (r.queries && typeof r.queries === 'object') {
    for (const [k, q] of Object.entries(r.queries)) {
      if (q && typeof q.text === 'string' && typeof q.entityId === 'string')
        queries[k] = {
          text: q.text,
          clicks: Math.max(0, finite(q.clicks, 0)),
          entityId: q.entityId,
          last: String(q.last),
        }
    }
  }
  return {
    version: STATE_VERSION,
    weights,
    bias: clampTo(finite(r.bias, PRIOR_BIAS), BIAS_BOUNDS),
    updates: Math.max(0, Math.floor(finite(r.updates, 0))),
    pairs,
    queries,
  }
}

export const modelVersionOf = (s: Pick<ModelState, 'updates'>) => `${MODEL_ID} · ${s.updates} güncelleme`

export const sigmoid = (z: number) => 1 / (1 + Math.exp(-z))

export function logit(s: Pick<ModelState, 'weights' | 'bias'>, x: FeatureVector): number {
  let z = s.bias
  for (const f of FEATURE_NAMES) z += s.weights[f] * x[f]
  return z
}

/** Tıklanma olasılığı (0–1). */
export const predict = (s: Pick<ModelState, 'weights' | 'bias'>, x: FeatureVector) => sigmoid(logit(s, x))

export interface FeatureContribution {
  name: FeatureName
  value: number
  weight: number
  contribution: number
}

const r4 = (n: number) => Math.round(n * 10_000) / 10_000

/** Puanın bileşenleri (Kaputun altı): değer, ağırlık, katkı = ağırlık · değer. */
export function explain(s: Pick<ModelState, 'weights'>, x: FeatureVector): FeatureContribution[] {
  return FEATURE_NAMES.map((name) => ({
    name,
    value: r4(x[name]),
    weight: r4(s.weights[name]),
    contribution: r4(s.weights[name] * x[name]),
  }))
}

/**
 * Nötre göre kaldıraç: (değer − nötr değer) · ağırlık. Gerekçe seçerken kullanılır; tiklanma'nın ön ortalaması
 * herkeste aynı olduğundan katkı sayılmaz.
 */
export function lift(s: Pick<ModelState, 'weights'>, x: FeatureVector, f: FeatureName): number {
  return (x[f] - NEUTRAL[f]) * s.weights[f]
}

export const REASONS = {
  personal: 'Sana özel',
  popular: 'Çok arananlar',
  afterSearch: 'Bu aramadan sonra izlenenler',
  related: (name: string) => `${name} ile ilgili`,
} as const

/** Galeride gerekçe yalnız işe yararsa: begeni en çok katkıyı veriyorsa "Sana özel". */
export const GALLERY_REASON_MIN_LIFT = 0.25
export function galleryReason(s: Pick<ModelState, 'weights'>, x: FeatureVector): string | null {
  const b = lift(s, x, 'begeni')
  if (b < GALLERY_REASON_MIN_LIFT) return null
  for (const f of ['populerlik', 'tiklanma', 'devam', 'yenilik'] as const) if (lift(s, x, f) > b) return null
  return REASONS.personal
}

/** Tahmini sonucun gerekçesi: en büyük kaldıracı veren sinyal. */
export function predictedReason(s: Pick<ModelState, 'weights'>, x: FeatureVector, hasTerm: boolean): string {
  const cands: [string, number][] = [
    [REASONS.personal, Math.max(lift(s, x, 'begeni'), lift(s, x, 'devam'))],
    [hasTerm ? REASONS.afterSearch : REASONS.popular, lift(s, x, 'tiklanma')],
    [REASONS.popular, lift(s, x, 'populerlik')],
  ]
  let best = cands[cands.length - 1] as [string, number]
  for (const c of cands) if (c[1] > best[1]) best = c
  return best[0]
}

/**
 * Tek SGD adımı (yerinde): w ← kırp(w − η · (güç · (p − y) · x + λ · (w − w₀))).
 * Dönen değer adımdan önceki olasılıktır.
 */
export function sgdStep(s: ModelState, x: FeatureVector, y: 0 | 1, strength: number): number {
  const p = predict(s, x)
  const g = strength * (p - y)
  for (const f of FEATURE_NAMES) {
    const w = s.weights[f]
    s.weights[f] = clampTo(w - LEARNING_RATE * (g * x[f] + L2_TO_PRIOR * (w - PRIOR_WEIGHTS[f])), WEIGHT_BOUNDS[f])
  }
  s.bias = clampTo(s.bias - LEARNING_RATE * (g + L2_TO_PRIOR * (s.bias - PRIOR_BIAS)), BIAS_BOUNDS)
  return p
}

/** Sayaçları artırır: her anahtar için ağırlığıyla çarpılmış olumlu/olumsuz tepki. */
export function bumpCounters(
  s: ModelState,
  keys: readonly WeightedKey[],
  entityId: string,
  positive: number,
  negative: number,
): void {
  for (const k of keys) {
    const row = (s.pairs[k.key] ??= {})
    const c = (row[entityId] ??= [0, 0])
    // Önek sayaçları da TAM artar; okurken ağırlıklandırılır (smoothedCtr). Böylece "si" tek başına sorgulandığında
    // "sintel" aramalarından gelen tıklamalar tam güçle görünür.
    c[0] += positive
    c[1] += negative
  }
}

/** Başarılı (tıklamayla sonuçlanan) sorguyu tamamlamalar için hatırlar. */
export function rememberQuery(s: ModelState, key: string, text: string, entityId: string, weight: number, now: Date) {
  // Tek harflik sorgu tamamlama olarak işe yaramaz
  if (key.length < MIN_QUERY_LENGTH) return
  const q = s.queries[key]
  if (q) {
    q.clicks += weight
    q.entityId = entityId
    q.last = now.toISOString()
    q.text = text
  } else s.queries[key] = { text, clicks: weight, entityId, last: now.toISOString() }
}

const total = (c: [number, number]) => c[0] + c[1]

/** Büyümeyi sınırlar: en az tepki alan anahtarlar / varlıklar / sorgular atılır. */
export function pruneState(s: ModelState): void {
  for (const [k, row] of Object.entries(s.pairs)) {
    const ids = Object.keys(row)
    if (ids.length <= MAX_ENTITIES_PER_KEY) continue
    ids
      .sort((a, b) => total(row[b] ?? [0, 0]) - total(row[a] ?? [0, 0]) || a.localeCompare(b))
      .slice(MAX_ENTITIES_PER_KEY)
      .forEach((id) => delete row[id])
    s.pairs[k] = row
  }
  const keys = Object.keys(s.pairs)
  if (keys.length > MAX_KEYS) {
    const weight = (k: string) => Object.values(s.pairs[k] ?? {}).reduce((n, c) => n + total(c), 0)
    keys
      .filter((k) => k !== '')
      .sort((a, b) => weight(b) - weight(a) || a.localeCompare(b))
      .slice(MAX_KEYS - 1)
      .forEach((k) => delete s.pairs[k])
  }
  const qs = Object.keys(s.queries)
  if (qs.length > MAX_QUERIES) {
    qs.sort(
      (a, b) =>
        (s.queries[b]?.clicks ?? 0) - (s.queries[a]?.clicks ?? 0) ||
        (s.queries[b]?.last ?? '').localeCompare(s.queries[a]?.last ?? ''),
    )
      .slice(MAX_QUERIES)
      .forEach((k) => delete s.queries[k])
  }
}

/** Öğrenilmiş sorgunun "tıklanma" özniteliği: olumlu tepki sayısından yumuşatılmış oran. */
export function learnedQueryCtr(q: Pick<LearnedQuery, 'clicks'>): number {
  return (q.clicks + 4 * CTR_PRIOR_MEAN) / (q.clicks + 4)
}
