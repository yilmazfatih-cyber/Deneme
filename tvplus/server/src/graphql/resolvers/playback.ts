/**
 * Oynatıcı kabuğunun üst verisi: `Video:<id>` (film/bölüm/ek video; dizi kimliği devam edilecek bölüme çözülür),
 * `Channel:<id>` (canlı; komşu kanallar zap ve ön hazırlık için), `Airing:<id>` (yayın; geri al / baştan başlat).
 * Bilinmeyen kimlik → null.
 */
import type { GqlContext, ResolverMap } from '../../kernel/context'
import { bookmarkOf, creditsOffsetOf, nextEpisodeOf, runtimeOf } from '../../services/catalog/present'
import { visibleChannels } from '../../services/discovery/livePage'
import { liveStateOf } from '../../services/epg/epg'
import { airingAccess, channelVisible } from './live'
import { parseViewable } from './member'
import { accessForChannel, accessForVideo, guidOf, nowOf, requireProfile, visible } from './util'

function neighbours(ctx: GqlContext, channelId: number) {
  const list = visibleChannels(ctx.services, ctx.passport)
  const i = list.findIndex((c) => c.channelId === channelId)
  if (i < 0 || list.length < 2) return { previousChannel: null, nextChannel: null }
  const prev = list[(i - 1 + list.length) % list.length]!
  const next = list[(i + 1) % list.length]!
  return { previousChannel: { channelId: prev.channelId }, nextChannel: { channelId: next.channelId } }
}

const empty = {
  video: null,
  channel: null,
  airing: null,
  nextEpisode: null,
  creditsOffsetSec: null,
  bookmark: null,
  previousChannel: null,
  nextChannel: null,
}

export const playbackResolvers: ResolverMap = {
  Query: {
    playbackMetadata: (_p: unknown, a: { viewableId: string }, ctx: GqlContext) => {
      requireProfile(ctx)
      const v = parseViewable(a.viewableId)
      if (!v) return null
      const { catalog, epg } = ctx.services

      if (v.kind === 'Video') {
        const id = Number(v.id)
        const vi = Number.isInteger(id) ? catalog.videoInfo(id) : null
        if (!vi || !visible(ctx, id)) return null
        const guid = guidOf(ctx)
        const leaf =
          vi.kind === 'SHOW'
            ? ((guid ? ctx.services.progress.currentEpisode(guid, id) : null) ?? catalog.episodeIds(id)[0] ?? id)
            : id
        const lv = catalog.videoInfo(leaf) ?? vi
        const next = nextEpisodeOf(ctx.services, leaf)
        const subtitle = lv.episode
          ? `S${lv.episode.seasonNumber} B${lv.episode.data.number} · ${lv.episode.data.title}`
          : lv.supplemental
            ? lv.supplemental.title
            : null
        return {
          ...empty,
          viewableId: a.viewableId,
          title: lv.title.title,
          subtitle,
          live: false,
          video: { videoId: leaf },
          nextEpisode: next !== null ? { videoId: next } : null,
          creditsOffsetSec: creditsOffsetOf(runtimeOf(ctx.services, leaf)),
          bookmark: bookmarkOf(ctx.services, guid, leaf),
          access: accessForVideo(ctx, leaf),
        }
      }

      if (v.kind === 'Channel') {
        const channelId = Number(v.id)
        const ch = Number.isInteger(channelId) ? catalog.getChannel(channelId) : null
        if (!ch || !channelVisible(ctx, channelId)) return null
        const now = nowOf(ctx)
        const airing = epg.currentAiring(channelId, now)
        const pos = epg.linearPosition(channelId, now)
        return {
          ...empty,
          viewableId: a.viewableId,
          title: airing?.title ?? ch.name,
          subtitle: ch.name,
          live: true,
          channel: { channelId },
          airing,
          video: pos && catalog.videoInfo(pos.videoId) ? { videoId: pos.videoId } : null,
          access: accessForChannel(ctx, channelId),
          ...neighbours(ctx, channelId),
        }
      }

      if (v.kind === 'Airing') {
        const airing = epg.getAiring(v.id)
        if (!airing || !channelVisible(ctx, airing.channelId)) return null
        const ch = catalog.getChannel(airing.channelId)
        const guid = guidOf(ctx)
        const hasVideo = airing.videoId !== null && !!catalog.videoInfo(airing.videoId)
        return {
          ...empty,
          viewableId: a.viewableId,
          title: airing.title,
          subtitle: ch?.name ?? null,
          live: liveStateOf(airing, nowOf(ctx)) === 'LIVE',
          channel: { channelId: airing.channelId },
          airing,
          video: hasVideo ? { videoId: airing.videoId } : null,
          bookmark: hasVideo ? bookmarkOf(ctx.services, guid, airing.videoId!) : null,
          access: airingAccess(ctx, airing),
          ...neighbours(ctx, airing.channelId),
        }
      }
      return null
    },
  },
}
