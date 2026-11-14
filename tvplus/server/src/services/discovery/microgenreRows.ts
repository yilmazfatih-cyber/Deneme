/**
 * Görünmeyen katmanın ana sayfadaki yüzü: mikro tür satırları ve zevk topluluğu satırı (docs/MIMARI.md §10.1).
 *
 * Mikro tür satırı — yalnız GÖRÜNEN katmandan; profile uyumuna göre seçilir:
 *   uyum = Σ (profilin sinyal başlıklarından bu mikro türe girenlerin ağırlığı)
 *        + (mikro tür başlıklarının zevk vektörüne ortalama yakınlığı) / (adaylar içindeki en büyük ortalama)
 *   Geçmişi olmayan profilde en büyük (görünen başlığı en çok) mikro türler. Eşitlikte büyük → geniş → kimlik.
 * Kurallar: en az MICROGENRE_ROW_MIN görünür başlık · bir tür satırının kümesinin aynısı değil · seçilmiş satırlarla
 * örtüşmesi (Jaccard) MICROGENRE_MAX_OVERLAP'ı aşmaz.
 *
 * Zevk topluluğu satırı — profilin topluluğunda öne çıkan başlıklar, profilin izlediği (yer imi olan) başlıklar hariç.
 */
import type { ContentTitle } from '../../../../shared/content-schema'
import type { Microgenre } from '../../../../shared/intelligence'
import type { ProfileRecord } from '../../kernel/context'
import type { Services } from '../../kernel/services'
import { intelligenceView } from './intel'
import { tasteScore, tasteVector } from './similarity'

export const MICROGENRE_ROW_MIN = 4
export const MICROGENRE_ROWS_HOME = 3
export const MICROGENRE_ROWS_CATEGORY = 2
export const MICROGENRE_MAX_OVERLAP = 0.5
/** Topluluk satırı için servisten istenen başlık sayısı */
export const COMMUNITY_FETCH = 60

export interface ProfileSignal {
  titleId: number
  weight: number
}

export interface MicrogenreRow {
  microgenre: Microgenre
  /** Görünür başlıklar, satır sırasıyla */
  videoIds: number[]
}

const byPopularity = (a: ContentTitle, b: ContentTitle) => b.popularity - a.popularity || a.videoId - b.videoId

function sameSet(a: Set<number>, b: Set<number>): boolean {
  if (a.size !== b.size) return false
  for (const x of a) if (!b.has(x)) return false
  return true
}
function jaccard(a: Set<number>, b: Set<number>): number {
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  const union = a.size + b.size - inter
  return union > 0 ? inter / union : 0
}

export function pickMicrogenreRows(
  services: Partial<Services>,
  opts: {
    visible: (titleId: number) => boolean
    /** Yalnız bu türden başlıklar (Diziler / Filmler sayfası); null → ikisi */
    type: 'MOVIE' | 'SHOW' | null
    limit: number
    signals: ProfileSignal[]
    /** Tekrarlanmaması gereken tür satırı kümeleri */
    genreSets: Set<number>[]
    /** Satır içinde sona alınacak (izlenmiş) başlıklar */
    watched?: Set<number>
  },
): MicrogenreRow[] {
  const catalog = services.catalog
  if (!catalog || opts.limit <= 0) return []
  const view = intelligenceView(services)
  if (!view.visibleLayer.length) return []

  const candidates: { m: Microgenre; titles: ContentTitle[]; set: Set<number> }[] = []
  for (const m of view.visibleLayer) {
    if (opts.type && m.definition.type && m.definition.type !== opts.type) continue
    const titles: ContentTitle[] = []
    for (const id of new Set(m.titleIds)) {
      const t = catalog.getTitle(id)
      if (!t || (opts.type && t.type !== opts.type) || !opts.visible(id)) continue
      titles.push(t)
    }
    if (titles.length < MICROGENRE_ROW_MIN) continue
    const set = new Set(titles.map((t) => t.videoId))
    if (opts.genreSets.some((g) => sameSet(g, set))) continue
    candidates.push({ m, titles, set })
  }
  if (!candidates.length) return []

  const score = new Map<string, number>()
  if (opts.signals.length) {
    const taste = tasteVector(catalog, opts.signals)
    const means = candidates.map((c) => c.titles.reduce((s, t) => s + tasteScore(taste, t), 0) / c.titles.length)
    const maxMean = Math.max(0, ...means)
    candidates.forEach((c, i) => {
      let hits = 0
      for (const s of opts.signals) if (c.set.has(s.titleId)) hits += s.weight
      score.set(c.m.id, hits + (maxMean > 0 ? Math.max(0, means[i]!) / maxMean : 0))
    })
  }
  candidates.sort(
    (a, b) =>
      (score.get(b.m.id) ?? 0) - (score.get(a.m.id) ?? 0) ||
      b.set.size - a.set.size ||
      a.m.specificity - b.m.specificity ||
      (a.m.id < b.m.id ? -1 : a.m.id > b.m.id ? 1 : 0),
  )

  const picked: (typeof candidates)[number][] = []
  for (const c of candidates) {
    if (picked.length >= opts.limit) break
    if (picked.some((p) => jaccard(p.set, c.set) > MICROGENRE_MAX_OVERLAP)) continue
    picked.push(c)
  }
  const watched = opts.watched ?? new Set<number>()
  return picked.map((c) => ({
    microgenre: c.m,
    videoIds: [...c.titles]
      .sort((a, b) => Number(watched.has(a.videoId)) - Number(watched.has(b.videoId)) || byPopularity(a, b))
      .map((t) => t.videoId),
  }))
}

/** Profilin zevk topluluğu satırı; topluluk yoksa (ya da servis yok / fırlatır) null. */
export function communityRow(
  services: Partial<Services>,
  profile: ProfileRecord,
  opts: { visible: (titleId: number) => boolean; watched: Set<number> },
): { communityId: string; videoIds: number[] } | null {
  const audience = services.audience
  if (!audience) return null
  try {
    const hit = audience.ofProfile(profile.guid)
    if (!hit) return null
    const top = audience.topTitles(hit.communityId, COMMUNITY_FETCH)
    const videoIds = top
      .map((x) => x.titleId)
      .filter((id) => !opts.watched.has(id) && !!services.catalog?.getTitle(id) && opts.visible(id))
    return { communityId: hit.communityId, videoIds }
  } catch {
    return null
  }
}
