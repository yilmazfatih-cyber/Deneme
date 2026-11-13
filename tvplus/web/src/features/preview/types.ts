/**
 * Keşif ekranlarının kullandığı GraphQL yanıt biçimleri (shared/graphql/operations/*.graphql ile birebir).
 * Şema sabittir; burada yalnız bizim sorgularımızın seçtiği alanlar tiplenir.
 */

export type AccessStateName = 'PLAYABLE' | 'UPSELL' | 'DEVICE_RESTRICTED' | 'OUT_OF_WINDOW' | 'BLOCKED'
export type WatchStatusName = 'NEVER_WATCHED' | 'STARTED' | 'WATCHED'
export type ThumbRatingName = 'THUMBS_UNRATED' | 'THUMBS_DOWN' | 'THUMBS_UP' | 'THUMBS_WAY_UP'
export type SourceKindName = 'OWN_CDN' | 'YOUTUBE' | 'PROGRESSIVE'
export type VideoTypename = 'Movie' | 'Show' | 'Episode' | 'Supplemental'

export interface ArtworkData {
  key: string
  type?: string
  url: string
  width: number
  height: number
}

export interface AccessData {
  state: AccessStateName
  reasonText: string | null
  requiredProduct: string | null
  requiredProductName?: string | null
  cta?: string | null
}

export interface BookmarkData {
  positionSec: number
  runtimeSec?: number | null
  progress: number
}

export interface PromoVideoData {
  viewableId: string
  computeId: string
  offset: number
  sourceKind: SourceKindName
}

/** `CardVideo` parçası (_fragments.graphql) */
export interface CardVideoData {
  __typename: VideoTypename
  videoId: number
  unifiedEntityId: string
  title: string
  shortSynopsis: string
  displayRuntime: string
  latestYear: number | null
  isPlayable: boolean
  isKids: boolean
  top10Rank: number | null
  sourceKinds: SourceKindName[]
  watchStatus: WatchStatusName
  access: AccessData
  badge: { kind: string; text: string } | null
  boxart: ArtworkData
  storyArt: ArtworkData
  contentAdvisory: { certificationValue: string; maturityLevel: number; reasons?: string[]; boardName?: string }
  bookmark: BookmarkData | null
  numberLabel?: string
  parentShow?: { videoId: number; title: string }
}

/** MiniModalQuery → videos[] öğesi */
export interface MiniModalVideo extends CardVideoData {
  isInPlaylist: boolean
  playlistActions: string[]
  thumbRating: ThumbRatingName
  playbackBadges: string[]
  runtimeSec: number | null
  textEvidence: { key: string; text: string }[]
  promoVideo: PromoVideoData | null
  genreTags: { genreId: number; name: string }[]
  boxartHighRes: ArtworkData
  titleLogo: ArtworkData
  seasonCount?: number
  currentEpisode?: {
    videoId: number
    numberLabel: string
    title: string
    runtimeSec: number | null
    bookmark: { positionSec: number; progress: number } | null
  }
}

export interface MiniModalData {
  videos: (MiniModalVideo | null)[]
}
