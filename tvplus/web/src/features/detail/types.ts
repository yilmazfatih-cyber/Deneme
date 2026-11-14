/**
 * Detay ve kişisel sayfaların GraphQL yanıt biçimleri (shared/graphql/operations/{DetailModal,DetailInsights,
 * Library,Reminders}.graphql ile birebir). Yalnız bu sorguların seçtiği alanlar tiplenir.
 */

export type AccessStateName = 'PLAYABLE' | 'UPSELL' | 'DEVICE_RESTRICTED' | 'OUT_OF_WINDOW' | 'BLOCKED'
export type ThumbRatingName = 'THUMBS_UNRATED' | 'THUMBS_DOWN' | 'THUMBS_UP' | 'THUMBS_WAY_UP'
export type VideoTypename = 'Movie' | 'Show' | 'Episode' | 'Supplemental'

export interface ArtworkData {
  key?: string
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
  sourceKind: string
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
  sourceKinds: string[]
  watchStatus: string
  access: AccessData
  badge: { kind: string; text: string } | null
  boxart: ArtworkData | null
  storyArt: ArtworkData | null
  contentAdvisory: { certificationValue: string; maturityLevel: number; reasons?: string[]; boardName?: string }
  bookmark: BookmarkData | null
  numberLabel?: string
  parentShow?: { videoId: number; title: string }
}

export interface PersonRef {
  personId: number
  name: string
}

export interface EpisodeData extends CardVideoData {
  number: number
  seasonNumber: number
  synopsis?: string
  runtimeSec: number | null
  still?: ArtworkData | null
}

export interface SeasonData {
  seasonId: string
  number: number
  numberLabel: string
  title: string | null
  episodes: EpisodeData[]
}

export interface SimilarCardData extends CardVideoData {
  isInPlaylist?: boolean
  matchScore?: number | null
}

export interface DetailVideo extends CardVideoData {
  synopsis: string
  contextualSynopsis: string
  runtimeSec: number | null
  isAvailable: boolean
  isInPlaylist: boolean
  playlistActions: string[]
  thumbRating: ThumbRatingName
  playbackBadges: string[]
  billboard: ArtworkData | null
  titleLogo?: ArtworkData | null
  genreTags: { genreId: number; name: string }[]
  moodTags: { id: number; displayName: string; isMood: boolean }[]
  textEvidence: { key: string; text: string }[]
  license: { name: string; attribution: string; url: string | null } | null
  promoVideo: PromoVideoData | null
  originalTitle?: string | null
  cast?: PersonRef[]
  directors?: PersonRef[]
  creators?: PersonRef[]
  similars?: SimilarCardData[]
  supplementalVideos?: (CardVideoData & { subType: string })[]
  collections?: { collectionId: number; name: string }[]
  seasonCount?: number
  episodeCount?: number
  currentEpisode?: EpisodeData
  seasons?: SeasonData[]
  number?: number
  seasonNumber?: number
}

export interface DetailData {
  video: DetailVideo | null
}

export interface MicrogenreData {
  id: string
  name: string
  layer: 'VISIBLE' | 'HIDDEN'
}

export interface SimilarWithReasonData {
  score: number
  reason: string | null
  video: SimilarCardData
}

export interface InsightsData {
  video: {
    __typename: VideoTypename
    videoId: number
    matchScore?: number | null
    microgenres?: MicrogenreData[] | null
    similarsWithReason?: SimilarWithReasonData[] | null
  } | null
}

/** Library sorgusu */
export interface ContinueVideoData extends CardVideoData {
  currentEpisode?: {
    videoId: number
    numberLabel: string
    title: string
    runtimeSec: number | null
    bookmark: BookmarkData | null
  }
}

export interface LibraryData {
  library: {
    myList: CardVideoData[]
    continueWatching: ContinueVideoData[]
    liked: CardVideoData[]
  }
}
