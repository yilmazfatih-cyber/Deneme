/**
 * Görünmeyen katmanın GraphQL yüzü: `Movie/Show.similarsWithReason`, `Movie/Show.microgenres`, `Query.microgenre`,
 * `Microgenre`, `SimilarVideo`. Üst nesne kuralı: Microgenre → { microgenreId } · Video → { videoId }.
 * Mikro tür servisleri boşken listeler boş, `Query.microgenre` null döner.
 */
import type { ContentTitle } from '../../../../shared/content-schema'
import type { GqlContext, ResolverFn, ResolverMap } from '../../kernel/context'
import { blendedSimilars, type BlendedSimilar } from '../../services/discovery/blend'
import { microgenreById, microgenresOfTitle } from '../../services/discovery/intel'
import { memo } from '../../services/discovery/memo'
import { requireProfile, visible } from './util'
import type { VideoRef } from './video'

export interface MicrogenreRef {
  microgenreId: string
}

export const microgenreEntityId = (id: string) => `Microgenre:${id}`

const clampFirst = (first: number | null | undefined, dflt: number, max: number) =>
  Math.max(0, Math.min(first ?? dflt, max))

/** İstek ömürlü: başlığın görünür benzerleri (harman sırasıyla) */
export function similarsOf(ctx: GqlContext, videoId: number): BlendedSimilar[] {
  return memo(ctx.cache, `similars:${videoId}`, () =>
    blendedSimilars(ctx.services, videoId, (id) => visible(ctx, id)),
  )
}

/** Mikro türün profilin görebildiği başlıkları: popülerlik sırasıyla */
function visibleTitlesOf(ctx: GqlContext, id: string): number[] {
  return memo(ctx.cache, `microgenre:titles:${id}`, () => {
    const m = microgenreById(ctx.services, id)
    if (!m) return []
    const titles: ContentTitle[] = []
    for (const titleId of new Set(m.titleIds)) {
      const t = ctx.services.catalog.getTitle(titleId)
      if (t && visible(ctx, titleId)) titles.push(t)
    }
    return titles.sort((a, b) => b.popularity - a.popularity || a.videoId - b.videoId).map((t) => t.videoId)
  })
}

const round4 = (x: number) => Math.round(x * 10_000) / 10_000

/** Film ve dizide ortak yeni alanlar (video.ts'teki titleFields'a eklenir) */
export const microgenreTitleFields: Record<string, ResolverFn> = {
  similars: (p: VideoRef, a: { first?: number | null }, ctx: GqlContext) =>
    similarsOf(ctx, p.videoId)
      .slice(0, clampFirst(a.first, 12, 48))
      .map((x) => ({ videoId: x.titleId })),
  similarsWithReason: (p: VideoRef, a: { first?: number | null }, ctx: GqlContext) =>
    similarsOf(ctx, p.videoId)
      .slice(0, clampFirst(a.first, 12, 48))
      .map((x) => ({
        video: { videoId: x.titleId },
        score: round4(x.score),
        reason: x.reason,
        signals: x.signals.map((s) => ({ name: s.name, value: round4(s.value), weight: round4(s.weight) })),
      })),
  microgenres: (p: VideoRef, a: { first?: number | null }, ctx: GqlContext): MicrogenreRef[] =>
    microgenresOfTitle(ctx.services, p.videoId)
      .slice(0, clampFirst(a.first, 4, 100))
      .map((m) => ({ microgenreId: m.id })),
}

export const microgenreResolvers: ResolverMap = {
  Microgenre: {
    id: (p: MicrogenreRef) => p.microgenreId,
    unifiedEntityId: (p: MicrogenreRef) => microgenreEntityId(p.microgenreId),
    name: (p: MicrogenreRef, _a: unknown, ctx: GqlContext) => microgenreById(ctx.services, p.microgenreId)?.name ?? '',
    layer: (p: MicrogenreRef, _a: unknown, ctx: GqlContext) =>
      microgenreById(ctx.services, p.microgenreId)?.layer ?? 'HIDDEN',
    /** Profilin görebildiği başlık sayısı (çocuk profili kataloğun tamamının sayısını görmez) */
    size: (p: MicrogenreRef, _a: unknown, ctx: GqlContext) => visibleTitlesOf(ctx, p.microgenreId).length,
    videos: (p: MicrogenreRef, a: { first?: number | null }, ctx: GqlContext) =>
      visibleTitlesOf(ctx, p.microgenreId)
        .slice(0, clampFirst(a.first, 40, 200))
        .map((videoId) => ({ videoId })),
  },
  Query: {
    /** Bilinmeyen kimlik ya da profilin hiçbir başlığını göremediği mikro tür → null */
    microgenre: (_p: unknown, a: { id: string }, ctx: GqlContext): MicrogenreRef | null => {
      requireProfile(ctx)
      if (!microgenreById(ctx.services, a.id)) return null
      return visibleTitlesOf(ctx, a.id).length > 0 ? { microgenreId: a.id } : null
    },
  },
}
