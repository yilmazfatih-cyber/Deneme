/**
 * Benzerlik ve zevk vektörü. Özellikler ağırlıklıdır:
 *   tür 2 · ruh hali/nitelik 1.5 · oyuncu+yönetmen 1 · anahtar sözcük 0.5
 * Benzerlik = ağırlıklı Jaccard (kesişim ağırlığı / birleşim ağırlığı) + aynı koleksiyon desteği.
 */
import type { ContentTitle } from '../../../../shared/content-schema'
import { norm } from '../../../../shared/text'
import type { CatalogService } from '../../kernel/services'

export const FEATURE_WEIGHTS = { genre: 2, mood: 1.5, person: 1, keyword: 0.5 } as const
export const SAME_COLLECTION_BOOST = 0.15

const featureCache = new WeakMap<ContentTitle, Map<string, number>>()

/** Başlığın ağırlıklı özellik kümesi: 'g:aksiyon' → 2 */
export function featuresOf(t: ContentTitle): Map<string, number> {
  const hit = featureCache.get(t)
  if (hit) return hit
  const f = new Map<string, number>()
  for (const g of t.genres) f.set(`g:${g}`, FEATURE_WEIGHTS.genre)
  for (const m of t.moods) f.set(`m:${m}`, FEATURE_WEIGHTS.mood)
  for (const p of [...t.cast, ...t.directors]) f.set(`p:${norm(p)}`, FEATURE_WEIGHTS.person)
  for (const k of t.keywords) {
    const key = norm(k)
    if (key) f.set(`k:${key}`, FEATURE_WEIGHTS.keyword)
  }
  featureCache.set(t, f)
  return f
}

export function weightedJaccard(a: Map<string, number>, b: Map<string, number>): number {
  let inter = 0
  let union = 0
  for (const [k, w] of a) {
    union += w
    if (b.has(k)) inter += w
  }
  for (const [k, w] of b) if (!a.has(k)) union += w
  return union > 0 ? inter / union : 0
}

export function similarity(catalog: CatalogService, a: ContentTitle, b: ContentTitle): number {
  let s = weightedJaccard(featuresOf(a), featuresOf(b))
  const ca = new Set(catalog.collectionsOf(a.videoId).map((c) => c.collectionId))
  if (catalog.collectionsOf(b.videoId).some((c) => ca.has(c.collectionId))) s += SAME_COLLECTION_BOOST
  return s
}

/** Benzer başlıklar (kendisi hariç), puan sırasıyla; eşitlikte popülerlik */
export function similarTitles(catalog: CatalogService, titleId: number, filter: (t: ContentTitle) => boolean = () => true): ContentTitle[] {
  const base = catalog.getTitle(titleId)
  if (!base) return []
  return catalog
    .allTitles()
    .filter((t) => t.videoId !== titleId && filter(t))
    .map((t) => ({ t, s: similarity(catalog, base, t) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || b.t.popularity - a.t.popularity || a.t.videoId - b.t.videoId)
    .map((x) => x.t)
}

/**
 * Zevk vektörü: izlenen (+1, en yeni daha ağır), Listem (+1), beğenilen (+2), beğenilmeyen (−2) başlıkların
 * özellik ağırlıklarının toplamı.
 */
export function tasteVector(catalog: CatalogService, signals: { titleId: number; weight: number }[]): Map<string, number> {
  const v = new Map<string, number>()
  for (const { titleId, weight } of signals) {
    const t = catalog.getTitle(titleId)
    if (!t) continue
    for (const [k, w] of featuresOf(t)) v.set(k, (v.get(k) ?? 0) + w * weight)
  }
  return v
}

/** Başlığın zevk vektörüne yakınlığı (özellik sayısıyla normalize) */
export function tasteScore(taste: Map<string, number>, t: ContentTitle): number {
  const f = featuresOf(t)
  let s = 0
  let norm2 = 0
  for (const [k, w] of f) {
    s += (taste.get(k) ?? 0) * w
    norm2 += w * w
  }
  return norm2 > 0 ? s / Math.sqrt(norm2) : 0
}
