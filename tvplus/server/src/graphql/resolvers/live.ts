/**
 * Canlı TV tipleri (Channel, ProgramAiring), göz atma varlıkları (Collection, Genre) ve Canlı TV sayfası.
 * Üst nesneler: Channel → { channelId } · ProgramAiring → AiringRecord · Collection → { collectionId } · Genre → { genreId }.
 */
import { CHANNEL_CATEGORIES, GENRES } from '../../../../shared/taxonomy'
import { airingEntityId, channelEntityId, collectionEntityId, genreEntityId } from '../../../../shared/tctx'
import type { GqlContext, ResolverMap } from '../../kernel/context'
import { buildArtwork } from '../../kernel/imageUrls'
import type { AccessDecision, AiringRecord } from '../../kernel/services'
import { sourceKindOf } from '../../services/catalog/sourceKind'
import { buildLivePage, visibleChannels } from '../../services/discovery/livePage'
import { catchupOf, liveStateOf, replayable } from '../../services/epg/epg'
import { DAY_MS } from '../../services/epg/time'
import { videoTypeName } from './video'
import { accessForChannel, findContext, gqlError, iso, nowOf, requireProfile, toDate, videoRefs } from './util'

interface ChannelRef {
  channelId: number
}
type ArtworkParams = { width?: number | null; height?: number | null; format?: string | null } | null | undefined

function channelOf(ctx: GqlContext, channelId: number) {
  const ch = ctx.services.catalog.getChannel(channelId)
  if (!ch) throw gqlError(`Kanal bulunamadı: ${channelId}`, 'NOT_FOUND')
  return ch
}

/** Profilin görebileceği kanal mı (çocuk profili → yalnız çocuk kanalları) */
export const channelVisible = (ctx: GqlContext, channelId: number) =>
  visibleChannels(ctx.services, ctx.passport).some((c) => c.channelId === channelId)

const startOf = (a: AiringRecord) => toDate(a.startAt) ?? new Date(0)
const endOf = (a: AiringRecord) => toDate(a.endAt) ?? new Date(0)
const norm = (a: AiringRecord): AiringRecord => ({ ...a, startAt: startOf(a), endAt: endOf(a) })

export function airingAccess(ctx: GqlContext, a: AiringRecord): AccessDecision {
  const base = accessForChannel(ctx, a.channelId)
  if (base.state !== 'PLAYABLE') return base
  const now = nowOf(ctx)
  const linear = ctx.services.epg.isLinear(a.channelId)
  if (liveStateOf(norm(a), now) !== 'ENDED') return base
  if (!catchupOf(norm(a), now, linear).available)
    return { ...base, state: 'OUT_OF_WINDOW', reasonText: 'Tekrar izlenemiyor', cta: null }
  // Geri al katalog videosunu oynatır: videonun olgunluk süzgeci de geçerli
  if (a.videoId !== null && !ctx.services.catalog.isVisibleTo(ctx.passport.profile, a.videoId)) {
    return { ...base, state: 'BLOCKED', reasonText: 'Bu profil için uygun değil', cta: null }
  }
  return base
}

export const liveResolvers: ResolverMap = {
  Channel: {
    channelId: (p: ChannelRef) => p.channelId,
    unifiedEntityId: (p: ChannelRef) => channelEntityId(p.channelId),
    name: (p: ChannelRef, _a: unknown, ctx: GqlContext) => channelOf(ctx, p.channelId).name,
    number: (p: ChannelRef, _a: unknown, ctx: GqlContext) => channelOf(ctx, p.channelId).number,
    category: (p: ChannelRef, _a: unknown, ctx: GqlContext) => channelOf(ctx, p.channelId).category,
    categoryName: (p: ChannelRef, _a: unknown, ctx: GqlContext) =>
      CHANNEL_CATEGORIES[channelOf(ctx, p.channelId).category],
    description: (p: ChannelRef, _a: unknown, ctx: GqlContext) => channelOf(ctx, p.channelId).description,
    logo: (p: ChannelRef, a: { params?: ArtworkParams }, ctx: GqlContext) =>
      buildArtwork(ctx.config, 'CHANNEL_LOGO', channelEntityId(p.channelId), a.params),
    isHd: (p: ChannelRef, _a: unknown, ctx: GqlContext) => channelOf(ctx, p.channelId).isHd,
    isFavorite: (p: ChannelRef, _a: unknown, ctx: GqlContext) => {
      const guid = ctx.passport.profile?.guid
      return guid
        ? ctx.services.progress.favoriteChannels(guid).includes(p.channelId)
        : channelOf(ctx, p.channelId).favorite
    },
    isKids: (p: ChannelRef, _a: unknown, ctx: GqlContext) => channelOf(ctx, p.channelId).kids,
    access: (p: ChannelRef, _a: unknown, ctx: GqlContext) => accessForChannel(ctx, p.channelId),
    sourceKind: (p: ChannelRef, _a: unknown, ctx: GqlContext) => sourceKindOf(channelOf(ctx, p.channelId).source),
    isSampleSchedule: (p: ChannelRef, _a: unknown, ctx: GqlContext) => {
      if (ctx.services.epg.isLinear(p.channelId)) return false
      return ctx.services.catalog.epgTemplates().find((t) => t.channelId === p.channelId)?.isSample ?? false
    },
    now: (p: ChannelRef, _a: unknown, ctx: GqlContext) => ctx.services.epg.currentAiring(p.channelId, nowOf(ctx)),
    next: (p: ChannelRef, _a: unknown, ctx: GqlContext) => {
      const now = nowOf(ctx)
      return (
        ctx.services.epg
          .airings(p.channelId, now, new Date(now.getTime() + 2 * DAY_MS))
          .find((a) => a.startAt.getTime() > now.getTime()) ?? null
      )
    },
    airings: (p: ChannelRef, a: { from: unknown; to: unknown }, ctx: GqlContext) => {
      const from = toDate(a.from)
      const to = toDate(a.to)
      if (!from || !to) throw gqlError('Geçersiz tarih aralığı', 'BAD_USER_INPUT')
      return ctx.services.epg.airings(p.channelId, from, to)
    },
  },

  ProgramAiring: {
    airingId: (a: AiringRecord) => a.airingId,
    unifiedEntityId: (a: AiringRecord) => airingEntityId(a.airingId),
    channel: (a: AiringRecord) => ({ channelId: a.channelId }),
    title: (a: AiringRecord) => a.title,
    synopsis: (a: AiringRecord) => a.synopsis,
    kind: (a: AiringRecord) => a.kind,
    startAt: (a: AiringRecord) => iso(a.startAt),
    endAt: (a: AiringRecord) => iso(a.endAt),
    liveState: (a: AiringRecord, _x: unknown, ctx: GqlContext) => liveStateOf(norm(a), nowOf(ctx)),
    startOver: (a: AiringRecord, _x: unknown, ctx: GqlContext) => replayable(a, ctx.services.epg.isLinear(a.channelId)),
    catchup: (a: AiringRecord, _x: unknown, ctx: GqlContext) => {
      const c = catchupOf(norm(a), nowOf(ctx), ctx.services.epg.isLinear(a.channelId))
      return { available: c.available, until: c.until ? c.until.toISOString() : null }
    },
    video: (a: AiringRecord, _x: unknown, ctx: GqlContext) =>
      a.videoId !== null && ctx.services.catalog.videoInfo(a.videoId) ? { videoId: a.videoId } : null,
    artwork: (a: AiringRecord, x: { params?: ArtworkParams }, ctx: GqlContext) =>
      buildArtwork(ctx.config, 'STORY_ART', airingEntityId(a.airingId), x.params),
    access: (a: AiringRecord, _x: unknown, ctx: GqlContext) => airingAccess(ctx, a),
  },

  Collection: {
    collectionId: (p: { collectionId: number }) => p.collectionId,
    unifiedEntityId: (p: { collectionId: number }) => collectionEntityId(p.collectionId),
    name: (p: { collectionId: number }, _a: unknown, ctx: GqlContext) =>
      ctx.services.catalog.getCollection(p.collectionId)?.name ?? '',
    description: (p: { collectionId: number }, _a: unknown, ctx: GqlContext) =>
      ctx.services.catalog.getCollection(p.collectionId)?.description ?? '',
    videos: (p: { collectionId: number }, _a: unknown, ctx: GqlContext) =>
      videoRefs(ctx, ctx.services.catalog.getCollection(p.collectionId)?.videoIds ?? []),
    artwork: (p: { collectionId: number }, a: { params?: ArtworkParams }, ctx: GqlContext) =>
      buildArtwork(ctx.config, 'STORY_ART', collectionEntityId(p.collectionId), a.params),
  },

  Genre: {
    genreId: (p: { genreId: number }) => p.genreId,
    unifiedEntityId: (p: { genreId: number }) => genreEntityId(p.genreId),
    name: (p: { genreId: number }) => Object.values(GENRES).find((g) => g.genreId === p.genreId)?.name ?? '',
    videos: (p: { genreId: number }, a: { first?: number | null }, ctx: GqlContext) => {
      const key = Object.entries(GENRES).find(([, g]) => g.genreId === p.genreId)?.[0]
      if (!key) return []
      const ids = ctx.services.catalog
        .allTitles()
        .filter((t) => (t.genres as string[]).includes(key))
        .sort((x, y) => y.popularity - x.popularity || x.videoId - y.videoId)
        .map((t) => t.videoId)
      return videoRefs(ctx, ids).slice(0, Math.max(0, Math.min(a.first ?? 40, 200)))
    },
  },

  RowEntity: {
    __resolveType: (p: Record<string, unknown>, a2: unknown, a3: unknown) => {
      if ('airingId' in p) return 'ProgramAiring'
      if ('channelId' in p) return 'Channel'
      if ('collectionId' in p) return 'Collection'
      if (typeof p.videoId === 'number') return videoTypeName(findContext(a2, a3), p.videoId)
      return null
    },
  },

  Query: {
    channel: (_p: unknown, a: { channelId: number }, ctx: GqlContext) => {
      requireProfile(ctx)
      return ctx.services.catalog.getChannel(a.channelId) && channelVisible(ctx, a.channelId)
        ? { channelId: a.channelId }
        : null
    },
    channels: (_p: unknown, a: { category?: string | null; favoritesOnly?: boolean | null }, ctx: GqlContext) => {
      const profile = requireProfile(ctx)
      let list = visibleChannels(ctx.services, ctx.passport)
      if (a.category) list = list.filter((c) => c.category === a.category)
      if (a.favoritesOnly) {
        const fav = new Set(ctx.services.progress.favoriteChannels(profile.guid))
        list = list.filter((c) => fav.has(c.channelId))
      }
      return list.map((c) => ({ channelId: c.channelId }))
    },
    airing: (_p: unknown, a: { airingId: string }, ctx: GqlContext) => {
      requireProfile(ctx)
      const rec = ctx.services.epg.getAiring(a.airingId)
      return rec && channelVisible(ctx, rec.channelId) ? rec : null
    },
    livePage: (_p: unknown, a: { capabilities: { rowTypes: string[]; entityKinds: string[] } }, ctx: GqlContext) => {
      requireProfile(ctx)
      return buildLivePage(ctx.services, ctx.passport, a.capabilities, nowOf(ctx))
    },
    collection: (_p: unknown, a: { collectionId: number }, ctx: GqlContext) => {
      requireProfile(ctx)
      return ctx.services.catalog.getCollection(a.collectionId) ? { collectionId: a.collectionId } : null
    },
    genre: (_p: unknown, a: { genreId: number }, ctx: GqlContext) => {
      requireProfile(ctx)
      return Object.values(GENRES).some((g) => g.genreId === a.genreId) ? { genreId: a.genreId } : null
    },
  },
}
