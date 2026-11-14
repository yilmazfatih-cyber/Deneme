/** Oynatıcı kabuğunun GraphQL işlemleri: PlaybackMetadata, PlayerChannels, SetBookmark, SetLastChannel (kalıcı sorgular). */
import { gql } from '../../api/graphql'

export interface AccessInfo {
  state: 'PLAYABLE' | 'UPSELL' | 'DEVICE_RESTRICTED' | 'OUT_OF_WINDOW' | 'BLOCKED'
  reasonText: string | null
  requiredProduct: string | null
  requiredProductName: string | null
  cta: string | null
}
export interface Artwork {
  url: string
  width: number
  height: number
}
export interface CardVideo {
  __typename: string
  videoId: number
  unifiedEntityId: string
  title: string
  storyArt?: Artwork | null
  numberLabel?: string | null
}
export interface AiringBrief {
  airingId: string
  unifiedEntityId: string
  title: string
  kind: string
  startAt: string
  endAt: string
  liveState: 'UPCOMING' | 'LIVE' | 'ENDED'
  startOver: boolean
}
export interface ChannelBrief {
  channelId: number
  unifiedEntityId?: string
  name: string
  number: number
  logo?: Artwork | null
  now?: AiringBrief | null
  next?: AiringBrief | null
}
export interface EpisodeBrief {
  videoId: number
  unifiedEntityId: string
  title: string
  number: number
  seasonNumber: number
  runtimeSec: number | null
  shortSynopsis: string
  isPlayable: boolean
  bookmark: { positionSec: number; progress: number } | null
  still: { url: string; width: number; height: number } | null
}
export interface SeasonBrief {
  seasonId: string
  number: number
  numberLabel: string
  title: string | null
  episodes: EpisodeBrief[]
}
export interface ParentShow {
  videoId: number
  unifiedEntityId: string
  title: string
  seasons: SeasonBrief[]
}
export interface NeighbourChannel {
  channelId: number
  name: string
  number: number
  logo?: { url: string; width: number; height: number } | null
}
export interface PlaybackMetadata {
  viewableId: string
  title: string
  subtitle: string | null
  live: boolean
  creditsOffsetSec: number | null
  access: AccessInfo
  bookmark: { positionSec: number; runtimeSec: number | null; progress: number } | null
  video:
    | (CardVideo & {
        runtimeSec?: number | null
        license?: { name: string; attribution: string; url: string | null } | null
        /** Bölümse */
        number?: number
        seasonNumber?: number
        parentShow?: ParentShow | null
      })
    | null
  channel: ChannelBrief | null
  airing: AiringBrief | null
  nextEpisode: (CardVideo & { number: number; seasonNumber: number; runtimeSec: number | null }) | null
  previousChannel: NeighbourChannel | null
  nextChannel: NeighbourChannel | null
}

export async function loadPlaybackMetadata(viewableId: string, signal?: AbortSignal): Promise<PlaybackMetadata | null> {
  const d = await gql<{ playbackMetadata: PlaybackMetadata | null }, { viewableId: string }>(
    'PlaybackMetadata',
    { viewableId },
    { signal },
  )
  return d.playbackMetadata
}

/** Kanal listesi (TV'de canlı yayında gerektiğinde; şimdi/sonraki bilgisi için 60 sn önbellek). */
let channelsPromise: Promise<ChannelBrief[]> | null = null
let channelsAt = 0
export function loadChannels(): Promise<ChannelBrief[]> {
  if (!channelsPromise || Date.now() - channelsAt > 60_000) {
    channelsAt = Date.now()
    channelsPromise = gql<{ channels: ChannelBrief[] }, Record<string, never>>('PlayerChannels', {})
      .then((d) => d.channels)
      .catch((err: unknown) => {
        channelsPromise = null
        throw err
      })
  }
  return channelsPromise
}

export async function saveBookmark(viewableId: string, positionSec: number, durationSec: number | null): Promise<void> {
  await gql<unknown, { viewableId: string; positionSec: number; durationSec: number | null }>('SetBookmark', {
    viewableId,
    positionSec: Math.max(0, Math.floor(positionSec)),
    durationSec: durationSec && durationSec > 0 ? Math.round(durationSec) : null,
  })
}

export async function saveLastChannel(channelId: number): Promise<void> {
  await gql<unknown, { channelId: number }>('SetLastChannel', { channelId })
}
