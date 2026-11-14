/**
 * Keşfin içerik zekâsı servislerine (mikro türler, gömme) güvenli bakışı ve süreç ömürlü önbelleği.
 *
 * - Servisler yoksa, boşsa ya da fırlatırsa her şey boş döner: keşif eskisi gibi çalışır.
 * - Önbellek, katalog nesnesine bağlıdır (her uygulamanın kendi önbelleği) ve damgaya göre tazelenir:
 *   damga = servis nesnelerinin kimliği + `microgenres.revision()` + `embeddings.revision()` + `embeddings.ready()`
 *   + `predictions.revision()` + `predictions.ready()`.
 *   Etiketler değişip mikro türler yeniden üretildiğinde (revision arttığında) bir sonraki istek yeni veriyi görür.
 */
import type { Microgenre, NeighborTitle } from '../../../../shared/intelligence'
import type { Services } from '../../kernel/services'
import type { BlendedSimilar } from './blend'

export interface IntelligenceView {
  stamp: string
  /** Tüm mikro türler (servisin sırasıyla) */
  microgenres: Microgenre[]
  byId: Map<string, Microgenre>
  /** Görünen katman */
  visibleLayer: Microgenre[]
  /** En az bir mikro türe giren başlıklar */
  covered: Set<number>
  microgenreNeighbors(titleId: number, limit: number): { titleId: number; score: number; shared: string[] }[]
  embeddingsReady: boolean
  vector(titleId: number): Float32Array | null
  embeddingNeighbors(titleId: number, limit: number): NeighborTitle[]
  /** Harman benzerlik önbelleği (kaynak başlık → süzgeçsiz liste); damga değişince boşalır */
  blendCache: Map<number, BlendedSimilar[]>
}

/** Önbellekte en çok bu kadar kaynak başlık tutulur (aşılırsa boşaltılır) */
export const BLEND_CACHE_MAX = 5000

const objectIds = new WeakMap<object, number>()
let nextObjectId = 1
const idOf = (o: object | undefined): number => {
  if (!o) return 0
  let id = objectIds.get(o)
  if (id === undefined) objectIds.set(o, (id = nextObjectId++))
  return id
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn()
  } catch {
    return fallback
  }
}

/** Mikro tür + gömme servislerinin o anki sürüm damgası */
export function intelligenceStamp(services: Partial<Services>): string {
  const mg = services.microgenres
  const emb = services.embeddings
  const pred = services.predictions
  return [
    idOf(mg),
    mg ? safe(() => mg.revision(), -1) : -1,
    idOf(emb),
    emb ? safe(() => emb.revision(), -1) : -1,
    emb ? safe(() => emb.ready(), false) : false,
    idOf(pred),
    pred ? safe(() => pred.revision(), -1) : -1,
    pred ? safe(() => pred.ready(), false) : false,
  ].join('|')
}

/* ───────────── Tahmin modeli (güvenli erişim) ─────────────
 * Model hazır değilse ya da fırlatırsa: eşleşme null, puan yok, seçim yok → keşif kurallarla çalışır. */

export function modelReady(services: Partial<Services>): boolean {
  const pred = services.predictions
  return !!pred && safe(() => pred.ready(), false)
}

/** 0–100 tamsayı eşleşme yüzdesi ya da null */
export function matchScoreOf(services: Partial<Services>, profileGuid: string, titleId: number): number | null {
  const pred = services.predictions
  if (!pred || !modelReady(services)) return null
  const m = safe(() => pred.match(profileGuid, titleId), null)
  return typeof m === 'number' && Number.isFinite(m) ? Math.max(0, Math.min(100, Math.round(m))) : null
}

/** Sıralama puanları (puanlanamayan başlık haritada yok); model hazır değilse ya da hata olursa null */
export function predictionScores(
  services: Partial<Services>,
  profileGuid: string,
  titleIds: number[],
): Map<number, number> | null {
  const pred = services.predictions
  if (!pred || !titleIds.length || !modelReady(services)) return null
  const m = safe(() => pred.scores(profileGuid, titleIds), null)
  return m instanceof Map ? m : null
}

/** Modelin seçimleri (puan sırasıyla); model hazır değilse ya da hata olursa [] */
export function predictionPicks(
  services: Partial<Services>,
  profileGuid: string,
  limit: number,
  opts: { type?: 'MOVIE' | 'SHOW'; excludeWatched?: boolean } = {},
): number[] {
  const pred = services.predictions
  if (!pred || !modelReady(services)) return []
  const picks = safe(() => pred.topPicks(profileGuid, limit, opts), [])
  return Array.isArray(picks) ? picks.map((p) => p.titleId) : []
}

/**
 * Satır içi sıralama: puanı olanlar puan sırasıyla (eşitlikte eski sıra) öne, puanı olmayanlar eski sıralarıyla sona.
 * `scores` null ise liste olduğu gibi döner.
 */
export function orderByScores(ids: number[], scores: Map<number, number> | null): number[] {
  if (!scores || !scores.size) return ids
  const scored: { id: number; s: number; i: number }[] = []
  const rest: number[] = []
  ids.forEach((id, i) => {
    const s = scores.get(id)
    if (typeof s === 'number' && Number.isFinite(s)) scored.push({ id, s, i })
    else rest.push(id)
  })
  scored.sort((a, b) => b.s - a.s || a.i - b.i)
  return [...scored.map((x) => x.id), ...rest]
}

const views = new WeakMap<object, IntelligenceView>()
const NO_CATALOG = {}

function buildView(services: Partial<Services>, stamp: string): IntelligenceView {
  const mg = services.microgenres
  const emb = services.embeddings
  const all = mg ? safe(() => mg.all(), []) : []
  const microgenres = Array.isArray(all) ? all : []
  const byId = new Map<string, Microgenre>()
  const covered = new Set<number>()
  for (const m of microgenres) {
    byId.set(m.id, m)
    for (const id of m.titleIds) covered.add(id)
  }
  const embeddingsReady = !!emb && safe(() => emb.ready(), false)
  return {
    stamp,
    microgenres,
    byId,
    visibleLayer: microgenres.filter((m) => m.layer === 'VISIBLE'),
    covered,
    microgenreNeighbors: (titleId, limit) =>
      mg && microgenres.length ? safe(() => mg.similarTitles(titleId, limit), []) : [],
    embeddingsReady,
    vector: (titleId) => (emb && embeddingsReady ? safe(() => emb.titleVector(titleId), null) : null),
    embeddingNeighbors: (titleId, limit) =>
      emb && embeddingsReady ? safe(() => emb.similarTitles(titleId, limit), []) : [],
    blendCache: new Map(),
  }
}

/** Damgası güncel bakış; damga değiştiyse yeniden kurulur (önbellekler boşalır). */
export function intelligenceView(services: Partial<Services>): IntelligenceView {
  const owner = services.catalog ?? NO_CATALOG
  const stamp = intelligenceStamp(services)
  let view = views.get(owner)
  if (!view || view.stamp !== stamp || view.blendCache.size > BLEND_CACHE_MAX) {
    view = buildView(services, stamp)
    views.set(owner, view)
  }
  return view
}

/**
 * Başlığın mikro türleri: önce görünen katman, sonra görünmeyen; her katmanda en dar olan önce
 * (yuva sayısı çok → küçük → kimlik).
 */
export function microgenresOfTitle(services: Partial<Services>, titleId: number): Microgenre[] {
  const view = intelligenceView(services)
  if (!view.covered.has(titleId)) return []
  const mg = services.microgenres
  const list = mg ? safe(() => mg.ofTitle(titleId), []) : []
  const layerRank = (m: Microgenre) => (m.layer === 'VISIBLE' ? 0 : 1)
  return [...list].sort(
    (a, b) =>
      layerRank(a) - layerRank(b) ||
      b.specificity - a.specificity ||
      a.size - b.size ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )
}

/** Kimlikle mikro tür (servis yoksa ya da fırlatırsa null) */
export function microgenreById(services: Partial<Services>, id: string): Microgenre | null {
  const view = intelligenceView(services)
  const hit = view.byId.get(id)
  if (hit) return hit
  const mg = services.microgenres
  return mg ? safe(() => mg.get(id), null) : null
}
