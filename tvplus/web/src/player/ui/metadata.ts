/** Oynatıcı kabuğunun GraphQL işlemleri: PlaybackMetadata, SetBookmark, SetLastChannel (kalıcı sorgular). */
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
export interface PlaybackMetadata {
  viewableId: string
  title: string
  subtitle: string | null
  live: boolean
  creditsOffsetSec: number | null
  access: AccessInfo
  bookmark: { positionSec: number; runtimeSec: number | null; progress: number } | null
  video: (CardVideo & { runtimeSec?: number | null; license?: { name: string; attribution: string; url: string | null } | null }) | null
  channel: ChannelBrief | null
  airing: AiringBrief | null
  nextEpisode: (CardVideo & { number: number; seasonNumber: number; runtimeSec: number | null }) | null
  previousChannel: { channelId: number; name: string; number: number } | null
  nextChannel: { channelId: number; name: string; number: number } | null
}

export async function loadPlaybackMetadata(viewableId: string, signal?: AbortSignal): Promise<PlaybackMetadata | null> {
  const d = await gql<{ playbackMetadata: PlaybackMetadata | null }, { viewableId: string }>('PlaybackMetadata', { viewableId }, { signal })
  return d.playbackMetadata
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
