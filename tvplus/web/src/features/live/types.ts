/**
 * Canlı TV, Rehber ve Arama'nın paylaştığı veri tipleri (shared/graphql/operations/*.graphql seçimlerinin aynası).
 * Alanlar yalnızca bizim sorgularımızda istenenlerdir.
 */

export type AccessStateName = 'PLAYABLE' | 'UPSELL' | 'DEVICE_RESTRICTED' | 'OUT_OF_WINDOW' | 'BLOCKED'
export type LiveStateName = 'UPCOMING' | 'LIVE' | 'ENDED'

export interface ArtworkData {
  key: string
  type: string
  url: string
  width: number
  height: number
}

export interface AccessData {
  state: AccessStateName
  reasonText: string | null
  requiredProduct: string | null
  requiredProductName: string | null
  cta: string | null
}

export interface TrackData {
  row: number
  pos: number
  rowId: string
  trackId: number
  entityId: string
  tctx: string
}

/** AiringBrief parçası */
export interface AiringBriefData {
  __typename?: 'ProgramAiring'
  airingId: string
  unifiedEntityId: string
  title: string
  kind: string
  startAt: string
  endAt: string
  liveState: LiveStateName
  startOver: boolean
  catchup: { available: boolean; until: string | null }
  access: AccessData
  synopsis?: string
  art?: ArtworkData | null
}

/** ChannelCard parçası */
export interface ChannelData {
  __typename?: 'Channel'
  channelId: number
  unifiedEntityId: string
  name: string
  number: number
  category: string
  categoryName: string
  isHd: boolean
  isFavorite: boolean
  isKids: boolean
  isSampleSchedule: boolean
  sourceKind: string
  access: AccessData
  logo: ArtworkData
  now: AiringBriefData | null
  next: AiringBriefData | null
  description?: string
}

/** Yayının bağlı olduğu kanalın kısa hâli */
export interface AiringChannelData {
  channelId: number
  name: string
  number: number
  sourceKind?: string
  isSampleSchedule?: boolean
  logo: ArtworkData
}

export interface AiringData extends AiringBriefData {
  channel: AiringChannelData
  video: { videoId: number } | null
}

/** Satır içindeki varlık: bilinmeyen __typename sessizce atlanır. */
export interface RowEntityData {
  __typename: string
  [k: string]: unknown
}

export interface RowItemData {
  kind: string
  track: TrackData
  entity: RowEntityData
}

export interface PageRowData {
  rowId: string
  type: string
  title: string | null
  ttlSec: number
  trackId: number
  bridgeTo: string | null
  items: RowItemData[]
}

export interface LivePageData {
  livePage: {
    id: string
    expires: string
    serverTime: string
    rows: PageRowData[]
  }
}
