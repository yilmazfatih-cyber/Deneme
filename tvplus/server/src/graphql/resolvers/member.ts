/**
 * Üyelik, kitaplık, duyuru, bildirim sorguları ve tüm mutasyonlar.
 * Mutasyonların CSRF (x-tvplus-authurl) denetimi motordadır; burada üyelik/profil kapısı uygulanır.
 */
import { buildArtwork } from '../../kernel/imageUrls'
import type { AccountRecord, GqlContext, ProfileRecord, ResolverMap } from '../../kernel/context'
import type { ThumbRatingValue } from '../../kernel/services'
import { bookmarkOf } from '../../services/catalog/present'
import { channelVisible } from './live'
import { gqlError, guidOf, requireProfile, videoRefs, visible } from './util'

type ArtworkParams = { width?: number | null; height?: number | null; format?: string | null } | null | undefined
const THUMBS: ThumbRatingValue[] = ['THUMBS_UNRATED', 'THUMBS_DOWN', 'THUMBS_UP', 'THUMBS_WAY_UP']

function requireVideo(ctx: GqlContext, videoId: number): void {
  if (!ctx.services.catalog.videoInfo(videoId) || !visible(ctx, videoId))
    throw gqlError(`Video bulunamadı: ${videoId}`, 'NOT_FOUND')
}
function requireChannel(ctx: GqlContext, channelId: number): void {
  if (!ctx.services.catalog.getChannel(channelId) || !channelVisible(ctx, channelId))
    throw gqlError(`Kanal bulunamadı: ${channelId}`, 'NOT_FOUND')
}

/** 'Video:123' → 123 (yalnız Video önekli kimlikler) */
export function parseViewable(viewableId: string): { kind: string; id: string } | null {
  const i = viewableId.indexOf(':')
  if (i <= 0) return null
  return { kind: viewableId.slice(0, i), id: viewableId.slice(i + 1) }
}

export const memberResolvers: ResolverMap = {
  Profile: {
    avatar: (p: ProfileRecord, a: { params?: ArtworkParams }, ctx: GqlContext) =>
      buildArtwork(ctx.config, 'AVATAR', `Profile:${p.guid}`, a.params),
    isActive: (p: ProfileRecord, _a: unknown, ctx: GqlContext) => ctx.passport.profile?.guid === p.guid,
  },
  Account: {
    profiles: (acc: AccountRecord, _a: unknown, ctx: GqlContext) => {
      const list = ctx.services.identity?.listProfiles(acc.accountId)
      if (list) return list
      return ctx.passport.profile ? [ctx.passport.profile] : []
    },
  },
  Library: {
    myList: (_p: unknown, _a: unknown, ctx: GqlContext) =>
      videoRefs(ctx, ctx.services.progress.myList(requireProfile(ctx).guid)),
    continueWatching: (_p: unknown, _a: unknown, ctx: GqlContext) =>
      ctx.services.progress
        .continueWatching(requireProfile(ctx).guid)
        .filter((c) => visible(ctx, c.titleId))
        .map((c) => ({ videoId: c.videoId })),
    liked: (_p: unknown, _a: unknown, ctx: GqlContext) =>
      videoRefs(ctx, ctx.services.progress.liked(requireProfile(ctx).guid)),
    favoriteChannels: (_p: unknown, _a: unknown, ctx: GqlContext) =>
      ctx.services.progress
        .favoriteChannels(requireProfile(ctx).guid)
        .filter((id) => ctx.services.catalog.getChannel(id) && channelVisible(ctx, id))
        .map((channelId) => ({ channelId })),
  },

  Query: {
    membershipStatus: (_p: unknown, _a: unknown, ctx: GqlContext) => ({
      status: ctx.passport.membershipStatus,
      account: ctx.passport.account,
      activeProfile: ctx.passport.profile,
    }),
    video: (_p: unknown, a: { videoId: number }, ctx: GqlContext) => {
      requireProfile(ctx)
      return ctx.services.catalog.videoInfo(a.videoId) && visible(ctx, a.videoId) ? { videoId: a.videoId } : null
    },
    videos: (_p: unknown, a: { videoIds: number[] }, ctx: GqlContext) => {
      requireProfile(ctx)
      return a.videoIds.map((videoId) =>
        ctx.services.catalog.videoInfo(videoId) && visible(ctx, videoId) ? { videoId } : null,
      )
    },
    person: (_p: unknown, a: { personId: number }, ctx: GqlContext) => {
      requireProfile(ctx)
      const p = ctx.services.catalog.getPerson(a.personId)
      return p ? { personId: p.personId, name: p.name } : null
    },
    library: (_p: unknown, _a: unknown, ctx: GqlContext) => {
      requireProfile(ctx)
      return {}
    },
    interstitial: (_p: unknown, a: { location: string }, ctx: GqlContext) => {
      const guid = guidOf(ctx)
      const dismissed = new Set(guid ? ctx.services.progress.dismissedInterstitials(guid) : [])
      return ctx.services.catalog.interstitials().find((i) => i.location === a.location && !dismissed.has(i.id)) ?? null
    },
    notifications: (_p: unknown, _a: unknown, ctx: GqlContext) => {
      const profile = requireProfile(ctx)
      return ctx.services.notifications?.list(profile.guid) ?? []
    },
  },

  Mutation: {
    addToPlaylist: (_p: unknown, a: { videoId: number; tctx?: string | null }, ctx: GqlContext) => {
      const profile = requireProfile(ctx)
      requireVideo(ctx, a.videoId)
      ctx.services.progress.addToMyList(profile.guid, a.videoId)
      return { video: { videoId: a.videoId }, isInPlaylist: true }
    },
    removeFromPlaylist: (_p: unknown, a: { videoId: number }, ctx: GqlContext) => {
      const profile = requireProfile(ctx)
      requireVideo(ctx, a.videoId)
      ctx.services.progress.removeFromMyList(profile.guid, a.videoId)
      return { video: { videoId: a.videoId }, isInPlaylist: false }
    },
    setThumbRating: (_p: unknown, a: { videoId: number; rating: ThumbRatingValue }, ctx: GqlContext) => {
      const profile = requireProfile(ctx)
      requireVideo(ctx, a.videoId)
      if (!THUMBS.includes(a.rating)) throw gqlError('Geçersiz puan', 'BAD_USER_INPUT')
      ctx.services.progress.setThumbRating(profile.guid, a.videoId, a.rating)
      return { video: { videoId: a.videoId }, thumbRating: ctx.services.progress.thumbRating(profile.guid, a.videoId) }
    },
    setBookmark: (
      _p: unknown,
      a: { viewableId: string; positionSec: number; durationSec?: number | null },
      ctx: GqlContext,
    ) => {
      const profile = requireProfile(ctx)
      const v = parseViewable(a.viewableId)
      let videoId: number | null = null
      if (v?.kind === 'Video') videoId = Number(v.id)
      else if (v?.kind === 'Airing') videoId = ctx.services.epg.getAiring(v.id)?.videoId ?? null
      else if (v?.kind === 'Channel') {
        const channelId = Number(v.id)
        requireChannel(ctx, channelId)
        ctx.services.progress.setLastChannel(profile.guid, channelId)
        return { viewableId: a.viewableId, bookmark: null, watchStatus: 'NEVER_WATCHED' }
      }
      if (videoId === null || !Number.isInteger(videoId))
        throw gqlError(`Bilinmeyen izlenebilir: ${a.viewableId}`, 'NOT_FOUND')
      const vi = ctx.services.catalog.videoInfo(videoId)
      if (!vi || !visible(ctx, videoId)) throw gqlError(`Video bulunamadı: ${videoId}`, 'NOT_FOUND')
      // Dizi kimliği gelirse devam edilecek bölüme yazılır
      const leaf =
        vi.kind === 'SHOW' ? (ctx.services.progress.currentEpisode(profile.guid, videoId) ?? videoId) : videoId
      ctx.services.progress.setBookmark(profile.guid, leaf, a.positionSec, a.durationSec ?? null)
      return {
        viewableId: a.viewableId,
        bookmark: bookmarkOf(ctx.services, profile.guid, leaf),
        watchStatus: ctx.services.progress.watchStatus(profile.guid, leaf),
      }
    },
    setLastChannel: (_p: unknown, a: { channelId: number }, ctx: GqlContext) => {
      const profile = requireProfile(ctx)
      requireChannel(ctx, a.channelId)
      ctx.services.progress.setLastChannel(profile.guid, a.channelId)
      return true
    },
    toggleFavoriteChannel: (_p: unknown, a: { channelId: number }, ctx: GqlContext) => {
      const profile = requireProfile(ctx)
      requireChannel(ctx, a.channelId)
      ctx.services.progress.toggleFavoriteChannel(profile.guid, a.channelId)
      return { channelId: a.channelId }
    },
    dismissInterstitial: (_p: unknown, a: { id: string }, ctx: GqlContext) => {
      const profile = requireProfile(ctx)
      ctx.services.progress.dismissInterstitial(profile.guid, a.id)
      return true
    },
    recordSearch: (_p: unknown, a: { term: string }, ctx: GqlContext) => {
      const profile = requireProfile(ctx)
      ctx.services.progress.recordSearch(profile.guid, a.term)
      return true
    },
    clearRecentSearches: (_p: unknown, _a: unknown, ctx: GqlContext) => {
      const profile = requireProfile(ctx)
      ctx.services.progress.clearRecentSearches(profile.guid)
      return true
    },
    markNotificationsRead: (_p: unknown, a: { ids?: string[] | null }, ctx: GqlContext) => {
      const profile = requireProfile(ctx)
      ctx.services.notifications?.markRead(profile.guid, a.ids ?? null)
      return true
    },
  },
}
