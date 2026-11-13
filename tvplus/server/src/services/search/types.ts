/**
 * Arama çekirdeğinin veri tipleri. Çekirdek saf işlevlerden oluşur: girdi düz veridir (başlıklar, koleksiyonlar,
 * kişiler, kanallar, yayınlar), çıktı GraphQL'e hazır düz nesnelerdir. Servislere erişim yalnızca engine.ts'tedir.
 */
import type { ContentChannel, ContentCollection, ContentTitle } from '../../../../shared/content-schema'
import type { ArtworkTypeName } from '../../kernel/imageUrls'
import type { AiringRecord } from '../../kernel/services'

/** Şemadaki EntityKind karşılığı. */
export type SearchEntityKind = 'VIDEO' | 'CHANNEL' | 'PROGRAM_AIRING' | 'PERSON' | 'GENERIC_CONTAINER'

/** İstemcinin bildirebildiği çizim biçimleri (EntityTreatmentCapabilitiesInput alanları). */
export type TreatmentName =
  | 'standardBoxshot'
  | 'standardChannelTile'
  | 'standardAiringRow'
  | 'standardPersonChip'
  | 'standardDestination'
  | 'standardSuggestion'

/** CapabilitiesBySectionInput alanları. */
export type SectionCapabilityName = 'searchList' | 'searchGallery' | 'searchLive'

export interface PersonEntry {
  personId: number
  name: string
  videoIds: number[]
}

/** Dizinin kurulduğu ham veri. */
export interface SearchCorpus {
  titles: ContentTitle[]
  collections: ContentCollection[]
  people: PersonEntry[]
  channels: ContentChannel[]
  /** Bugünün ve yaklaşan yayınlar (ayrıca şu an canlı olanlar) */
  airings: AiringRecord[]
}

/* ───────────── İstek girdisi (GraphQL girdi tiplerinin aynası) ───────────── */

export interface EntityTreatmentCapabilityInput {
  canHandleEntityKinds?: readonly string[] | null
}
export type EntityTreatmentCapabilitiesInput = Partial<Record<TreatmentName, EntityTreatmentCapabilityInput | null>>
export interface SectionCapabilitiesInput {
  capabilitiesBySectionTreatment?: {
    standard?: { capabilitiesByEntityTreatment?: EntityTreatmentCapabilitiesInput | null } | null
  } | null
}
export interface SearchPageCapabilitiesInput {
  capabilitiesBySection?: Partial<Record<SectionCapabilityName, SectionCapabilitiesInput | null>> | null
}
export interface SearchFiltersInput {
  genreIds?: readonly number[] | null
  kind?: string | null
  year?: string | null
  entitledOnly?: boolean | null
  sort?: string | null
}
export interface SearchOptionsInput {
  pageCapabilities?: SearchPageCapabilitiesInput | null
  filters?: SearchFiltersInput | null
  pageSize?: number | null
  /** true → yazım düzeltmesi yapılmaz (CORRECTED/MIXED yok, fuzzy varlık yok) */
  exactTerm?: boolean | null
}

/* ───────────── Çıktı ───────────── */

export type SearchSectionType = 'SearchLiveSection' | 'SearchListSection' | 'SearchGallerySection'

export interface SearchTrack {
  row: number
  pos: number
  rowId: string
  trackId: number
  entityId: string
  tctx: string
}

/** Üst nesne kuralı: varlık alanları yalnızca kimlik taşıyan başvurular döndürür. */
export type SearchEntityRef =
  | { type: 'video'; videoId: number }
  | { type: 'channel'; channelId: number }
  | { type: 'airing'; airing: AiringRecord }
  | { type: 'person'; personId: number; name: string }
  | { type: 'collection'; collectionId: number }
  | { type: 'genre'; genreId: number }

export interface SearchEntityResult {
  unifiedEntityId: string
  kind: SearchEntityKind
  displayString: string
  treatment: TreatmentName
  track: SearchTrack
  fuzzy: boolean
  ref: SearchEntityRef
  /** Bağlama göre görsel tipi; çözümleyici imzalı adresi buildArtwork ile üretir. Video dışı varlıklarda null. */
  artworkType: ArtworkTypeName | null
  /** Tanılama için: eşleşme puanı (GraphQL'de yok) */
  score: number
}

export interface SearchSectionResult {
  /** __resolveType ayırıcısı */
  sectionType: SearchSectionType
  id: string
  displayString: string
  expires: Date
  entities: SearchEntityResult[]
  /** Yalnız galeride anlamlı */
  totalCount: number
}

export interface SearchCorrectionResult {
  mode: 'CORRECTED' | 'MIXED'
  originalTerm: string
  correctedTerm: string
}

export interface SearchPageResult {
  searchTerm: string
  requestId: string
  trackId: number
  expires: Date
  correction: SearchCorrectionResult | null
  sections: SearchSectionResult[]
  isFallback: boolean
  recentSearches: string[]
}
