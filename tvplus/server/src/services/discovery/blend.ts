/**
 * Harman benzerlik — "Buna benzer" (`similars`, `similarsWithReason`) ve "… adlı içeriği izlediğin için" satırları.
 * Ağırlıkların TEK yeri burasıdır (docs/ICERIK_ZEKASI.md §9, docs/MIMARI.md §10.1):
 *
 *   puan = w_künye · künye + w_mikrotür · mikrotür + w_gömme · gömme          (her işaret 0–1)
 *
 *   künye    — mevcut künye benzerliği (similarity.ts: ağırlıklı Jaccard + koleksiyon desteği), 0–1'e ölçeklenir
 *   mikrotür — ortak mikro türlerin nadirlikle ağırlıklı örtüşmesi (`microgenres.similarTitles`)
 *   gömme    — başlık vektörlerinin kosinüs benzerliği (`embeddings.similarTitles`), −1…1 → 0–1
 *
 * Bir çift için bir işaret yoksa (servis boş / hazır değil / başlığın vektörü ya da mikro türü yok) o işaretin ağırlığı
 * diğerlerine orantılı dağıtılır. Yeni servisler boşken puan yalnız künyedir ve sıralama eskisinin aynısıdır.
 * Eşitlikte: ham künye benzerliği, popülerlik, kimlik (kararlı).
 */
import type { ContentTitle } from '../../../../shared/content-schema'
import type { Services } from '../../kernel/services'
import { intelligenceView, type IntelligenceView } from './intel'
import { SAME_COLLECTION_BOOST, similarity } from './similarity'

export const BLEND_WEIGHTS = { kunye: 0.5, mikrotur: 0.3, gomme: 0.2 } as const
export type SignalName = keyof typeof BLEND_WEIGHTS
export const SIGNAL_NAMES: readonly SignalName[] = ['kunye', 'mikrotur', 'gomme']

export interface BlendSignal {
  name: SignalName
  /** 0–1; işaret yoksa 0 */
  value: number
  /** Etkin ağırlık (dağıtımdan sonra); işaret yoksa 0 */
  weight: number
}

export interface BlendedSimilar {
  titleId: number
  /** 0–1 harman puanı */
  score: number
  signals: BlendSignal[]
  /** Ortak mikro tür kimlikleri (mikro tür servisinin sırasıyla: en ağır önce) */
  shared: string[]
  /** "Ortak: ‹en dar ortak mikro tür›" ya da null */
  reason: string | null
}

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0)

/**
 * Saf harman: `null`/eksik işaret yok sayılır, ağırlığı kalanlara dağıtılır. Hiç işaret yoksa puan 0.
 * Sinyaller her zaman üç adın sırasıyla döner (Kaputun altı için).
 */
export function blendScore(
  values: Partial<Record<SignalName, number | null>>,
  weights: Record<SignalName, number> = BLEND_WEIGHTS,
): { score: number; signals: BlendSignal[] } {
  let total = 0
  for (const name of SIGNAL_NAMES) if (values[name] !== null && values[name] !== undefined) total += weights[name]
  let score = 0
  const signals = SIGNAL_NAMES.map((name): BlendSignal => {
    const v = values[name]
    if (v === null || v === undefined || total <= 0) return { name, value: 0, weight: 0 }
    const value = clamp01(v)
    const weight = weights[name] / total
    score += weight * value
    return { name, value, weight }
  })
  return { score: clamp01(score), signals }
}

/** Künye benzerliği (koleksiyon desteğiyle en çok 1 + destek) → 0–1 */
export const kunyeValue = (raw: number) => clamp01(raw / (1 + SAME_COLLECTION_BOOST))
/** Kosinüs (−1…1) → 0–1 */
export const cosineValue = (cos: number) => clamp01((cos + 1) / 2)

function cosine(a: Float32Array, b: Float32Array): number | null {
  if (a.length !== b.length || a.length === 0) return null
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!
    na += a[i]! * a[i]!
    nb += b[i]! * b[i]!
  }
  return na > 0 && nb > 0 ? dot / Math.sqrt(na * nb) : null
}

/** Ortak mikro türlerden en darı: yuva sayısı çok → küçük → servisin sırası */
export function narrowestMicrogenre(view: IntelligenceView, ids: string[]): { id: string; name: string } | null {
  let best: { id: string; name: string; specificity: number; size: number; order: number } | null = null
  ids.forEach((id, order) => {
    const m = view.byId.get(id)
    if (!m) return
    const better =
      !best ||
      m.specificity > best.specificity ||
      (m.specificity === best.specificity && (m.size < best.size || (m.size === best.size && order < best.order)))
    if (better) best = { id: m.id, name: m.name, specificity: m.specificity, size: m.size, order }
  })
  return best
}

export const reasonText = (name: string) => `Ortak: ${name}`

function computeBlend(services: Partial<Services>, view: IntelligenceView, base: ContentTitle): BlendedSimilar[] {
  const catalog = services.catalog!
  const titles = catalog.allTitles()
  const limit = titles.length

  // Mikro tür işareti: kaynak bir mikro türe giriyorsa, mikro türü olan her aday için (paylaşmıyorsa 0)
  const srcCovered = view.covered.has(base.videoId)
  const mg = new Map<number, { score: number; shared: string[] }>()
  if (srcCovered) for (const x of view.microgenreNeighbors(base.videoId, limit)) mg.set(x.titleId, x)
  // Sözleşme puanın aralığını söylemiyor: 0–1 dışında gelirse en büyüğe bölünür
  let mgMax = 0
  for (const x of mg.values()) mgMax = Math.max(mgMax, x.score)
  const mgScale = mgMax > 1 ? mgMax : 1

  // Gömme işareti: vektörler hazır ve iki başlığın da vektörü varsa
  const srcVec = view.embeddingsReady ? view.vector(base.videoId) : null
  const emb = new Map<number, number>()
  if (srcVec) for (const x of view.embeddingNeighbors(base.videoId, limit)) emb.set(x.titleId, x.score)

  const out: (BlendedSimilar & { raw: number; popularity: number })[] = []
  for (const t of titles) {
    if (t.videoId === base.videoId) continue
    const raw = similarity(catalog, base, t)
    const hit = mg.get(t.videoId)
    const mikrotur = srcCovered && view.covered.has(t.videoId) ? clamp01((hit?.score ?? 0) / mgScale) : null
    let cos: number | null = null
    if (srcVec) {
      cos = emb.get(t.videoId) ?? null
      if (cos === null) {
        const v = view.vector(t.videoId)
        cos = v ? cosine(srcVec, v) : null
      }
    }
    // Aday ancak bir işaret gerçekten benzerlik gösteriyorsa listeye girer (eskisi: künye > 0)
    if (!(raw > 0 || (mikrotur ?? 0) > 0 || (cos ?? 0) > 0)) continue
    const { score, signals } = blendScore({
      kunye: kunyeValue(raw),
      mikrotur,
      gomme: cos === null ? null : cosineValue(cos),
    })
    const shared = hit?.shared ?? []
    const narrow = narrowestMicrogenre(view, shared)
    out.push({
      titleId: t.videoId,
      score,
      signals,
      shared,
      reason: narrow ? reasonText(narrow.name) : null,
      raw,
      popularity: t.popularity,
    })
  }
  out.sort(
    (a, b) => b.score - a.score || b.raw - a.raw || b.popularity - a.popularity || a.titleId - b.titleId,
  )
  return out.map(({ titleId, score, signals, shared, reason }) => ({ titleId, score, signals, shared, reason }))
}

/**
 * Kaynağa benzer başlıklar (kendisi hariç), harman puanıyla sıralı. Sonuç servis sürümlerine (revision) bağlı
 * önbellekten gelir; görünürlük süzgeci çağıranındır (`filter`).
 */
export function blendedSimilars(
  services: Partial<Services>,
  titleId: number,
  filter: (titleId: number) => boolean = () => true,
): BlendedSimilar[] {
  const catalog = services.catalog
  const base = catalog?.getTitle(titleId)
  if (!catalog || !base) return []
  const view = intelligenceView(services)
  let list = view.blendCache.get(titleId)
  if (!list) {
    list = computeBlend(services, view, base)
    view.blendCache.set(titleId, list)
  }
  return list.filter((x) => filter(x.titleId))
}

/**
 * Satır gerekçesi: satırdaki öğelerin en çoğunun paylaştığı mikro türün adı (en az iki öğe paylaşmalı);
 * eşitlikte daha dar olan.
 */
export function rowReason(services: Partial<Services>, items: BlendedSimilar[]): string | null {
  const view = intelligenceView(services)
  const count = new Map<string, number>()
  for (const it of items) for (const id of new Set(it.shared)) count.set(id, (count.get(id) ?? 0) + 1)
  let best: { id: string; n: number } | null = null
  for (const [id, n] of count) {
    const m = view.byId.get(id)
    if (!m || n < 2) continue
    if (!best || n > best.n) best = { id, n }
    else if (n === best.n) {
      const cur = view.byId.get(best.id)!
      if (
        m.specificity > cur.specificity ||
        (m.specificity === cur.specificity && (m.size < cur.size || (m.size === cur.size && m.id < cur.id)))
      )
        best = { id, n }
    }
  }
  return best ? view.byId.get(best.id)!.name : null
}
