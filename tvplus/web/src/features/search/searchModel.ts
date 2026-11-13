/**
 * Arama yanıt tipleri (SearchPageQueryResults seçiminin aynası), düzeltme şeridi seçimi ve galeri süzgeçleri (saf).
 */
import type { AccessData, AiringData, ArtworkData, ChannelData, TrackData } from '../live/types'

export interface SearchVideo {
  __typename: string
  videoId: number
  unifiedEntityId: string
  title: string
  shortSynopsis: string
  displayRuntime: string
  latestYear: number | null
  isPlayable: boolean
  isKids: boolean
  access: AccessData
  badge: { kind: string; text: string } | null
  boxart: ArtworkData
  storyArt: ArtworkData
  genreTags?: { genreId: number; name: string }[]
}

export interface SearchEntity {
  unifiedEntityId: string
  kind: string
  displayString: string
  treatment: string
  fuzzy: boolean
  track: TrackData
  contextualArtwork: ArtworkData | null
  video: SearchVideo | null
  channel: ChannelData | null
  airing: AiringData | null
  person: { personId: number; name: string } | null
  collection: { collectionId: number; name: string; description: string; artwork?: ArtworkData | null } | null
  genre: { genreId: number; name: string } | null
}

export interface SearchSection {
  __typename: string
  id: string
  displayString: string
  expires: string
  totalCount?: number
  entities: SearchEntity[]
}

export interface SearchCorrection {
  mode: 'CORRECTED' | 'MIXED'
  originalTerm: string
  correctedTerm: string
}

export interface SearchPageData {
  searchTerm: string
  requestId: string
  trackId: number
  expires: string
  isFallback: boolean
  recentSearches: string[]
  correction: SearchCorrection | null
  sections: SearchSection[]
}

export interface SearchResponse {
  searchPage: SearchPageData
}

/* ───────────── Düzeltme / yedek şeridi ───────────── */

export type Banner =
  | { kind: 'corrected'; corrected: string; original: string }
  | { kind: 'mixed'; corrected: string }
  | { kind: 'fallback'; term: string }
  | null

/**
 * CORRECTED → "“sintel” için sonuçlar gösteriliyor" + "Bunun yerine “sitnel” ara"
 * MIXED     → "Bunu mu demek istedin: sintel?"
 * isFallback (terim varken) → "“xyz” için sonuç yok" ve ardından yedek bölümler. Boş terimde şerit yok.
 */
export function selectBanner(page: Pick<SearchPageData, 'correction' | 'isFallback' | 'searchTerm'>): Banner {
  const term = page.searchTerm.trim()
  if (page.isFallback) return term ? { kind: 'fallback', term } : null
  const c = page.correction
  if (!c) return null
  if (c.mode === 'CORRECTED') return { kind: 'corrected', corrected: c.correctedTerm, original: c.originalTerm }
  if (c.mode === 'MIXED') return { kind: 'mixed', corrected: c.correctedTerm }
  return null
}

/* ───────────── Galeri süzgeçleri ───────────── */

export type KindFilter = 'all' | 'film' | 'dizi'
export type YearFilter = 'all' | '2020' | '2010' | 'old'
export type SortOrder = 'rel' | 'new' | 'az'

export interface Filters {
  genreIds: number[]
  kind: KindFilter
  year: YearFilter
  entitledOnly: boolean
  sort: SortOrder
}

export const DEFAULT_FILTERS: Filters = { genreIds: [], kind: 'all', year: 'all', entitledOnly: false, sort: 'rel' }

/** Etkin süzgeç sayısı (rozet). Sıralama süzgeç sayılmaz. */
export function activeFilterCount(f: Filters): number {
  return f.genreIds.length + (f.kind !== 'all' ? 1 : 0) + (f.year !== 'all' ? 1 : 0) + (f.entitledOnly ? 1 : 0)
}

/** GraphQL SearchFiltersInput: varsayılan değerler gönderilmez (önbellek anahtarı da sade kalır). */
export function filtersInput(f: Filters): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {}
  if (f.genreIds.length) out.genreIds = [...f.genreIds].sort((a, b) => a - b)
  if (f.kind !== 'all') out.kind = f.kind
  if (f.year !== 'all') out.year = f.year
  if (f.entitledOnly) out.entitledOnly = true
  if (f.sort !== 'rel') out.sort = f.sort
  return Object.keys(out).length ? out : undefined
}

/** Galeri bölümlerindeki türler (ad sırasıyla, tekrarsız). */
export function galleryGenres(page: SearchPageData | undefined): { genreId: number; name: string }[] {
  const map = new Map<number, string>()
  for (const s of page?.sections ?? []) {
    if (s.__typename !== 'SearchGallerySection') continue
    for (const e of s.entities) for (const g of e.video?.genreTags ?? []) map.set(g.genreId, g.name)
  }
  return [...map].map(([genreId, name]) => ({ genreId, name })).sort((a, b) => a.name.localeCompare(b.name, 'tr'))
}

/** Bölüm başına sonuç sayısı (olay günlüğü için). */
export function sectionCounts(page: SearchPageData): Record<string, number> {
  const out: Record<string, number> = {}
  for (const s of page.sections) out[s.id] = s.entities.length
  return out
}

/** Afiş ızgarası için görsel: bağlamsal görsel dikeyse o, değilse başlığın afişi (2:3 hücreye yatay görsel sığmaz). */
export function posterArtwork(e: Pick<SearchEntity, 'contextualArtwork' | 'video'>): string | null {
  const c = e.contextualArtwork
  if (c && c.height > c.width) return c.url
  return e.video?.boxart.url ?? null
}
