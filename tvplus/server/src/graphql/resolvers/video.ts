/**
 * Video arayüzü ve somut tipleri (Movie, Show, Episode, Supplemental). Üst nesne her zaman `{ videoId }`;
 * diğer her alan katalogdan / üye durumundan / yetkiden kimlikle çözülür.
 */
import type { ContentTitle } from '../../../../shared/content-schema'
import { GENRES } from '../../../../shared/taxonomy'
import { personEntityId, videoEntityId } from '../../../../shared/tctx'
import type { GqlContext, ResolverFn, ResolverMap } from '../../kernel/context'
import { buildArtwork, type ArtworkTypeName } from '../../kernel/imageUrls'
import type { VideoInfo } from '../../kernel/services'
import { personIdOf } from '../../services/catalog/catalog'
import {
  badgeOf,
  bookmarkOf,
  contentAdvisoryOf,
  displayRuntimeOf,
  moodTagsOf,
  nextEpisodeOf,
  playbackBadgesOf,
  promoVideoOf,
  runtimeOf,
  sourceKindsOfVideo,
  textEvidenceOf,
} from '../../services/catalog/present'
import { memo } from '../../services/discovery/memo'
import { similarTitles } from '../../services/discovery/similarity'
import { top10Rank } from '../../services/discovery/top10'
import { accessForVideo, findContext, gqlError, guidOf, nowOf, top10List, videoRefs, visible } from './util'

export interface VideoRef {
  videoId: number
}
interface ArtworkArgs {
  type: ArtworkTypeName
  params?: { width?: number | null; height?: number | null; format?: string | null } | null
}

export function infoOf(ctx: GqlContext, videoId: number): VideoInfo {
  const vi = ctx.services.catalog.videoInfo(videoId)
  if (!vi) throw gqlError(`Video bulunamadı: ${videoId}`, 'NOT_FOUND')
  return vi
}

const truncate = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`)

/** Bölüm/ek videonun kendi metni, yoksa üst başlığınki */
function ownText(vi: VideoInfo): { title: string; synopsis: string } {
  if (vi.episode) return { title: vi.episode.data.title, synopsis: vi.episode.data.synopsis }
  if (vi.supplemental) return { title: vi.supplemental.title, synopsis: vi.supplemental.synopsis }
  return { title: vi.title.title, synopsis: vi.title.synopsis }
}

const people = (names: string[]) => names.map((name) => ({ personId: personIdOf(name), name }))

/** Video arayüzünün tüm tiplerde ortak alanları */
const videoFields: Record<string, ResolverFn> = {
  videoId: (p: VideoRef) => p.videoId,
  unifiedEntityId: (p: VideoRef) => videoEntityId(p.videoId),
  title: (p: VideoRef, _a: unknown, ctx: GqlContext) => ownText(infoOf(ctx, p.videoId)).title,
  shortSynopsis: (p: VideoRef, _a: unknown, ctx: GqlContext) => {
    const vi = infoOf(ctx, p.videoId)
    return vi.kind === 'MOVIE' || vi.kind === 'SHOW' ? vi.title.shortSynopsis : truncate(ownText(vi).synopsis, 140)
  },
  synopsis: (p: VideoRef, _a: unknown, ctx: GqlContext) => ownText(infoOf(ctx, p.videoId)).synopsis,
  contextualSynopsis: (p: VideoRef, _a: unknown, ctx: GqlContext) => {
    const vi = infoOf(ctx, p.videoId)
    const guid = guidOf(ctx)
    if (vi.kind === 'SHOW' && guid && ctx.services.progress.watchStatus(guid, p.videoId) === 'STARTED') {
      const cur = ctx.services.progress.currentEpisode(guid, p.videoId)
      const ep = cur !== null ? ctx.services.catalog.videoInfo(cur)?.episode : null
      if (ep) return ep.data.synopsis
    }
    return ownText(vi).synopsis
  },
  latestYear: (p: VideoRef, _a: unknown, ctx: GqlContext) => infoOf(ctx, p.videoId).title.year,
  isAvailable: (p: VideoRef, _a: unknown, ctx: GqlContext) => accessForVideo(ctx, p.videoId).state !== 'OUT_OF_WINDOW',
  isPlayable: (p: VideoRef, _a: unknown, ctx: GqlContext) => accessForVideo(ctx, p.videoId).state === 'PLAYABLE',
  access: (p: VideoRef, _a: unknown, ctx: GqlContext) => accessForVideo(ctx, p.videoId),
  artwork: (p: VideoRef, a: ArtworkArgs, ctx: GqlContext) =>
    buildArtwork(ctx.config, a.type, videoEntityId(p.videoId), a.params),
  genreTags: (p: VideoRef, _a: unknown, ctx: GqlContext) =>
    infoOf(ctx, p.videoId).title.genres.map((g) => ({ genreId: GENRES[g].genreId })),
  moodTags: (p: VideoRef, _a: unknown, ctx: GqlContext) => moodTagsOf(infoOf(ctx, p.videoId).title),
  contentAdvisory: (p: VideoRef, _a: unknown, ctx: GqlContext) => contentAdvisoryOf(infoOf(ctx, p.videoId).title),
  playbackBadges: (p: VideoRef, _a: unknown, ctx: GqlContext) => playbackBadgesOf(ctx.services, p.videoId),
  sourceKinds: (p: VideoRef, _a: unknown, ctx: GqlContext) => sourceKindsOfVideo(ctx.services, p.videoId),
  watchStatus: (p: VideoRef, _a: unknown, ctx: GqlContext) => {
    const guid = guidOf(ctx)
    return guid ? ctx.services.progress.watchStatus(guid, p.videoId) : 'NEVER_WATCHED'
  },
  bookmark: (p: VideoRef, _a: unknown, ctx: GqlContext) => bookmarkOf(ctx.services, guidOf(ctx), p.videoId),
  thumbRating: (p: VideoRef, _a: unknown, ctx: GqlContext) => {
    const guid = guidOf(ctx)
    return guid ? ctx.services.progress.thumbRating(guid, p.videoId) : 'THUMBS_UNRATED'
  },
  isInPlaylist: (p: VideoRef, _a: unknown, ctx: GqlContext) => {
    const guid = guidOf(ctx)
    return guid ? ctx.services.progress.isInMyList(guid, p.videoId) : false
  },
  playlistActions: (p: VideoRef, _a: unknown, ctx: GqlContext) => {
    const guid = guidOf(ctx)
    return guid && ctx.services.progress.isInMyList(guid, p.videoId) ? ['DELETE_FROM_PLAYLIST'] : ['ADD_TO_PLAYLIST']
  },
  textEvidence: (p: VideoRef, a: { uiContext?: 'BOB' | 'ODP' | null }, ctx: GqlContext) =>
    textEvidenceOf(infoOf(ctx, p.videoId).title, a.uiContext === 'ODP' ? 'ODP' : 'BOB'),
  promoVideo: (p: VideoRef, _a: unknown, ctx: GqlContext) =>
    promoVideoOf(ctx.services, p.videoId, accessForVideo(ctx, p.videoId)),
  badge: (p: VideoRef, _a: unknown, ctx: GqlContext) =>
    badgeOf(ctx.services, ctx.passport, p.videoId, accessForVideo(ctx, p.videoId), nowOf(ctx)),
  runtimeSec: (p: VideoRef, _a: unknown, ctx: GqlContext) => runtimeOf(ctx.services, p.videoId),
  displayRuntime: (p: VideoRef, _a: unknown, ctx: GqlContext) => displayRuntimeOf(ctx.services, p.videoId),
  license: (p: VideoRef, _a: unknown, ctx: GqlContext) => {
    const l = infoOf(ctx, p.videoId).title.license
    return { name: l.name, attribution: l.attribution, url: l.url ?? null }
  },
  isKids: (p: VideoRef, _a: unknown, ctx: GqlContext) => infoOf(ctx, p.videoId).title.kids,
  top10Rank: (p: VideoRef, _a: unknown, ctx: GqlContext) => {
    const vi = infoOf(ctx, p.videoId)
    if (vi.kind !== 'MOVIE' && vi.kind !== 'SHOW') return null
    return top10Rank(ctx.services, p.videoId, ctx.passport.profile, nowOf(ctx), top10List(ctx))
  },
}

/** Film ve dizide ortak (üst başlık) alanlar */
const titleFields: Record<string, ResolverFn> = {
  originalTitle: (p: VideoRef, _a: unknown, ctx: GqlContext) => infoOf(ctx, p.videoId).title.originalTitle ?? null,
  cast: (p: VideoRef, _a: unknown, ctx: GqlContext) => people(infoOf(ctx, p.videoId).title.cast),
  directors: (p: VideoRef, _a: unknown, ctx: GqlContext) => people(infoOf(ctx, p.videoId).title.directors),
  creators: (p: VideoRef, _a: unknown, ctx: GqlContext) => people(infoOf(ctx, p.videoId).title.creators),
  similars: (p: VideoRef, a: { first?: number | null }, ctx: GqlContext) => {
    const first = Math.max(0, Math.min(a.first ?? 12, 48))
    const ids = memo(ctx.cache, `similars:${p.videoId}`, () =>
      similarTitles(ctx.services.catalog, p.videoId, (t: ContentTitle) => visible(ctx, t.videoId)).map(
        (t) => t.videoId,
      ),
    )
    return ids.slice(0, first).map((videoId) => ({ videoId }))
  },
  supplementalVideos: (p: VideoRef, _a: unknown, ctx: GqlContext) =>
    infoOf(ctx, p.videoId).title.supplementals.map((s) => ({ videoId: s.videoId })),
  collections: (p: VideoRef, _a: unknown, ctx: GqlContext) =>
    ctx.services.catalog.collectionsOf(p.videoId).map((c) => ({ collectionId: c.collectionId })),
}

const showFields: Record<string, ResolverFn> = {
  seasons: (p: VideoRef, _a: unknown, ctx: GqlContext) =>
    infoOf(ctx, p.videoId).title.seasons.map((s) => ({
      seasonId: `${p.videoId}-S${s.number}`,
      number: s.number,
      numberLabel: `S${s.number}`,
      title: s.title ?? null,
      episodes: [...s.episodes].sort((a, b) => a.number - b.number).map((e) => ({ videoId: e.videoId })),
    })),
  seasonCount: (p: VideoRef, _a: unknown, ctx: GqlContext) => infoOf(ctx, p.videoId).title.seasons.length,
  episodeCount: (p: VideoRef, _a: unknown, ctx: GqlContext) => ctx.services.catalog.episodeIds(p.videoId).length,
  currentEpisode: (p: VideoRef, _a: unknown, ctx: GqlContext) => {
    const guid = guidOf(ctx)
    const cur =
      (guid ? ctx.services.progress.currentEpisode(guid, p.videoId) : null) ??
      ctx.services.catalog.episodeIds(p.videoId)[0]
    if (cur === undefined) throw gqlError('Dizide bölüm yok', 'NOT_FOUND')
    return { videoId: cur }
  },
}

const episodeOf = (ctx: GqlContext, videoId: number) => {
  const ep = infoOf(ctx, videoId).episode
  if (!ep) throw gqlError(`Bölüm değil: ${videoId}`, 'NOT_FOUND')
  return ep
}
const episodeFields: Record<string, ResolverFn> = {
  number: (p: VideoRef, _a: unknown, ctx: GqlContext) => episodeOf(ctx, p.videoId).data.number,
  seasonNumber: (p: VideoRef, _a: unknown, ctx: GqlContext) => episodeOf(ctx, p.videoId).seasonNumber,
  numberLabel: (p: VideoRef, _a: unknown, ctx: GqlContext) => {
    const ep = episodeOf(ctx, p.videoId)
    return `S${ep.seasonNumber} B${ep.data.number}`
  },
  parentShow: (p: VideoRef, _a: unknown, ctx: GqlContext) => ({ videoId: infoOf(ctx, p.videoId).title.videoId }),
  nextEpisode: (p: VideoRef, _a: unknown, ctx: GqlContext) => {
    const next = nextEpisodeOf(ctx.services, p.videoId)
    return next !== null ? { videoId: next } : null
  },
}

const supplementalFields: Record<string, ResolverFn> = {
  subType: (p: VideoRef, _a: unknown, ctx: GqlContext) => infoOf(ctx, p.videoId).supplemental?.subType ?? 'TRAILER',
  parent: (p: VideoRef, _a: unknown, ctx: GqlContext) => ({ videoId: infoOf(ctx, p.videoId).title.videoId }),
}

const TYPENAME = { MOVIE: 'Movie', SHOW: 'Show', EPISODE: 'Episode', SUPPLEMENTAL: 'Supplemental' } as const

/** `{ videoId }` → somut tip adı (katalogdan) */
export function videoTypeName(ctx: GqlContext | null, videoId: number): string | null {
  const kind = ctx?.services.catalog.videoInfo(videoId)?.kind
  return kind ? TYPENAME[kind] : null
}

export const videoResolvers: ResolverMap = {
  Video: {
    __resolveType: (p: VideoRef, a2: unknown, a3: unknown) => videoTypeName(findContext(a2, a3), p.videoId),
  },
  Movie: { ...videoFields, ...titleFields },
  Show: { ...videoFields, ...titleFields, ...showFields },
  Episode: { ...videoFields, ...episodeFields },
  Supplemental: { ...videoFields, ...supplementalFields },
  Person: {
    personId: (p: { personId: number }) => p.personId,
    unifiedEntityId: (p: { personId: number }) => personEntityId(p.personId),
    name: (p: { personId: number; name?: string }, _a: unknown, ctx: GqlContext) =>
      p.name ?? ctx.services.catalog.getPerson(p.personId)?.name ?? '',
    videos: (p: { personId: number }, _a: unknown, ctx: GqlContext) =>
      videoRefs(ctx, ctx.services.catalog.getPerson(p.personId)?.videoIds ?? []),
  },
}
