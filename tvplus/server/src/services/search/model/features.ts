/**
 * Tahmin modelinin öznitelikleri. Her öznitelik 0–1 aralığına ölçeklenir; hepsi saf işlevlerdir.
 *
 *   metin       Metin eşleşme puanı / 100 (match.ts: tam ad 100 · önek 85 · kelime başı 56–62 · kelime içi 25).
 *               Metinle eşleşmeyen (tahminle gelen) öğede 0.
 *   begeni      Başlığın özellik vektörüyle profilin zevk vektörü arasındaki kosinüs benzerliği
 *               (discovery/similarity: tür 2 · ruh hâli 1.5 · kişi 1 · anahtar kelime 0.5; izlenenler, Listem,
 *               beğenilenler +, beğenilmeyenler −). Negatif çıkarsa 0.
 *   populerlik  0.7 × katalog popülerliği/100 + 0.3 × (son 24 saat oynatma / en çok oynatılanınki).
 *               Son 24 saatte hiç oynatma yoksa yalnız katalog popülerliği.
 *   tiklanma    Bu sorgu (ağırlık 1) ve 2–4 harflik önekleri (ağırlık 0.5) için bu başlığın yumuşatılmış tıklanma
 *               oranı: (olumlu + A·μ) / (olumlu + olumsuz + A), μ = 0.1, A = 4. Hiç görülmemiş çift tam μ'dür;
 *               bu yüzden sıralamada nötrdür (herkese aynı katkı). Boş sorguda genel sayaç ('') kullanılır, A = 20.
 *   yenilik     Kataloğa eklenme tarihinden bu yana geçen gün sayısıyla üstel sönüm: e^(−gün/90).
 *   devam       Profilde yarım kalmışsa 1, yalnız Listem'deyse 0.5, değilse 0.
 */
import { norm } from '../../../../../shared/text'

export const FEATURE_NAMES = ['metin', 'begeni', 'populerlik', 'tiklanma', 'yenilik', 'devam'] as const
export type FeatureName = (typeof FEATURE_NAMES)[number]
export type FeatureVector = Record<FeatureName, number>

/** Tıklanma oranının ön dağılımı: ortalama ve gücü (sanal gösterim sayısı). */
export const CTR_PRIOR_MEAN = 0.1
export const CTR_PRIOR_STRENGTH = 4
/**
 * Genel (sorgudan bağımsız, '') sayacın ön gücü daha büyüktür: tüm aramaların tepkisi orada toplanır; birkaç tıklama
 * "Sana özel öneriler"i herkes için ele geçirmesin.
 */
export const GLOBAL_PRIOR_STRENGTH = 20
/** Önek sayaçlarının tam sorguya göre ağırlığı. */
export const PREFIX_KEY_WEIGHT = 0.5
export const PREFIX_MIN = 2
export const PREFIX_MAX = 4
/** Yenilik sönüm sabiti (gün). */
export const RECENCY_DAYS = 90
/** Popülerlikte son 24 saat oynatmanın payı. */
export const PLAYS_SHARE = 0.3

/** Hiçbir sinyal yokken özniteliklerin değeri (gerekçe seçerken "kaldıraç" buna göre ölçülür). */
export const NEUTRAL: FeatureVector = {
  metin: 0,
  begeni: 0,
  populerlik: 0,
  tiklanma: CTR_PRIOR_MEAN,
  yenilik: 0,
  devam: 0,
}

export const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0)

/** metin: eşleşme puanı (0–100) → 0–1 */
export const textFeature = (matchScore: number) => clamp01(matchScore / 100)

/** Sayaç anahtarı: düzleştirilmiş sorgu. Boş sorgu ('') genel (sorgudan bağımsız) sayaçtır. */
export const queryKey = (term: string) => norm(term)

export interface WeightedKey {
  key: string
  weight: number
}

/**
 * Bir sorgunun sayaç anahtarları: sorgunun kendisi (1) + kendisinden kısa 2–4 harflik önekleri (0.5).
 * "sintel" → sintel, si, sin, sint · "si" → si · "" → '' (genel).
 */
export function queryKeys(term: string): WeightedKey[] {
  const q = queryKey(term)
  if (!q) return [{ key: '', weight: 1 }]
  const out: WeightedKey[] = [{ key: q, weight: 1 }]
  for (let n = PREFIX_MIN; n <= Math.min(PREFIX_MAX, q.length - 1); n++) {
    const p = q.slice(0, n).trimEnd()
    if (p.length >= PREFIX_MIN && !out.some((k) => k.key === p)) out.push({ key: p, weight: PREFIX_KEY_WEIGHT })
  }
  return out
}

/** Sayaç tablosu: sorgu anahtarı → varlık kimliği → [olumlu, olumsuz] (ağırlıklı sayılar). */
export type PairCounters = Record<string, Record<string, [number, number]>>

/** tiklanma: anahtarların ağırlıklı toplamından Bayes-yumuşatılmış tıklanma oranı. */
export function smoothedCtr(pairs: PairCounters, keys: readonly WeightedKey[], entityId: string): number {
  let pos = 0
  let neg = 0
  for (const k of keys) {
    const c = pairs[k.key]?.[entityId]
    if (!c) continue
    pos += k.weight * c[0]
    neg += k.weight * c[1]
  }
  const a = keys.length === 1 && keys[0]?.key === '' ? GLOBAL_PRIOR_STRENGTH : CTR_PRIOR_STRENGTH
  return clamp01((pos + a * CTR_PRIOR_MEAN) / (pos + neg + a))
}

/** begeni: zevk vektörüyle kosinüs benzerliği (0–1). */
export function affinity(taste: ReadonlyMap<string, number>, tasteNorm: number, features: ReadonlyMap<string, number>) {
  if (tasteNorm <= 0) return 0
  let dot = 0
  let fNorm2 = 0
  for (const [k, w] of features) {
    dot += (taste.get(k) ?? 0) * w
    fNorm2 += w * w
  }
  if (fNorm2 <= 0) return 0
  return clamp01(dot / (Math.sqrt(fNorm2) * tasteNorm))
}

export function vectorNorm(v: ReadonlyMap<string, number>): number {
  let s = 0
  for (const w of v.values()) s += w * w
  return Math.sqrt(s)
}

/** populerlik: katalog popülerliği (0–100) + son 24 saat oynatma payı. */
export function popularityFeature(catalogPopularity: number, plays: number, maxPlays: number): number {
  const base = clamp01(catalogPopularity / 100)
  if (maxPlays <= 0) return base
  return clamp01((1 - PLAYS_SHARE) * base + PLAYS_SHARE * clamp01(plays / maxPlays))
}

/** yenilik: e^(−gün/90); gelecekteki tarih 1, okunamayan tarih 0. */
export function recencyFeature(addedAt: string | null | undefined, now: Date): number {
  if (!addedAt) return 0
  const t = Date.parse(addedAt)
  if (!Number.isFinite(t)) return 0
  const days = Math.max(0, (now.getTime() - t) / 86_400_000)
  return clamp01(Math.exp(-days / RECENCY_DAYS))
}

/** devam: yarım kalmış 1 · Listem 0.5 · değil 0 */
export function continueFeature(inProgress: boolean, inMyList: boolean): number {
  return inProgress ? 1 : inMyList ? 0.5 : 0
}
