/**
 * Arama yanıt tipleri (SearchPageQueryResults seçiminin aynası) ve sayfanın saf seçicileri:
 * düzeltme şeridi, "Şunlarla ilgili" bağlantıları, bölüm ayrıştırma, tahmin modelinin özetleri.
 * Tipler bu klasörde durur (başka özelliğin tiplerine bağlı değiliz).
 */

export type AccessStateName = 'PLAYABLE' | 'UPSELL' | 'DEVICE_RESTRICTED' | 'OUT_OF_WINDOW' | 'BLOCKED'

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

export interface AiringBriefData {
  __typename?: string
  airingId: string
  unifiedEntityId: string
  title: string
  kind: string
  startAt: string
  endAt: string
  liveState: 'UPCOMING' | 'LIVE' | 'ENDED'
  startOver: boolean
  catchup: { available: boolean; until: string | null }
  access: AccessData
  /** Program görseli (16:9) — arama sorgusunda istenir */
  artwork?: ArtworkData | null
}

export interface ChannelData {
  __typename?: string
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
}

export interface AiringData extends AiringBriefData {
  synopsis: string
  channel: { channelId: number; name: string; number: number; isSampleSchedule: boolean; logo: ArtworkData }
  video: { videoId: number } | null
}

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
  top10Rank?: number | null
  access: AccessData
  badge: { kind: string; text: string } | null
  boxart: ArtworkData
  storyArt: ArtworkData
  bookmark?: { positionSec: number; runtimeSec: number; progress: number } | null
  genreTags?: { genreId: number; name: string }[]
}

/** Modelin puan bileşeni: değer × ağırlık = katkı */
export interface SearchFeature {
  name: string
  value: number
  weight: number
  contribution: number
}

export interface SearchEntity {
  unifiedEntityId: string
  kind: string
  displayString: string
  treatment: string
  fuzzy: boolean
  predicted: boolean
  score: number | null
  reason: string | null
  /** Yalnız açıklama kipinde istenir (`$withExplain`) */
  explain?: SearchFeature[] | null
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

export type PredictionKind = 'TITLE' | 'PERSON' | 'GENRE' | 'COLLECTION' | 'CHANNEL' | 'QUERY'

export interface SearchPrediction {
  text: string
  kind: string
  unifiedEntityId: string | null
  score: number
}

export interface SearchPageData {
  searchTerm: string
  requestId: string
  trackId: number
  expires: string
  isFallback: boolean
  recentSearches: string[]
  modelVersion: string
  predictions: SearchPrediction[]
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
 * isFallback (terim varken) → "“xyz” için sonuç yok" ve modelin tahminleri. Boş terimde şerit yok.
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

/* ───────────── Sayfa ayrıştırma ───────────── */

export interface RelatedLink {
  id: string
  label: string
  /** Uygulama içi yol */
  to: string
  entity: SearchEntity
}

const withTctx = (path: string, tctx: string) => `${path}?tctx=${encodeURIComponent(tctx)}`

/** "Şunlarla ilgili daha fazla keşfedin:" — sayfanın döndürdüğü kişi, tür ve koleksiyonlar (geliş sırasıyla). */
export function relatedLinks(page: Pick<SearchPageData, 'sections'> | undefined): RelatedLink[] {
  const out: RelatedLink[] = []
  for (const s of page?.sections ?? []) {
    if (s.__typename !== 'SearchListSection') continue
    for (const e of s.entities) {
      const t = e.track.tctx
      if (e.person)
        out.push({
          id: e.unifiedEntityId,
          label: e.person.name,
          to: withTctx(`/kisi/${e.person.personId}`, t),
          entity: e,
        })
      else if (e.genre)
        out.push({ id: e.unifiedEntityId, label: e.genre.name, to: withTctx(`/tur/${e.genre.genreId}`, t), entity: e })
      else if (e.collection)
        out.push({
          id: e.unifiedEntityId,
          label: e.collection.name,
          to: withTctx(`/koleksiyon/${e.collection.collectionId}`, t),
          entity: e,
        })
    }
  }
  return out
}

export interface PageParts {
  live: SearchSection | null
  /** Doğrudan eşleşen başlıklar (galeri), modelin sırasıyla */
  gallery: SearchSection | null
  /** Tahmin bölümü: "‹X› ile ilgili" · "Bunlar ilgini çekebilir" · "Sana özel öneriler" */
  predicted: SearchSection | null
  related: RelatedLink[]
}

export function pageParts(page: SearchPageData | undefined): PageParts {
  const find = (t: string) => page?.sections.find((s) => s.__typename === t && s.entities.length > 0) ?? null
  return {
    live: find('SearchLiveSection'),
    gallery: find('SearchGallerySection'),
    predicted: find('SearchPredictedSection'),
    related: relatedLinks(page),
  }
}

/**
 * "Şunu mu arıyorsun:" satırı: modelin tamamlamaları; yazılanın kendisi ve tekrarlar atılır.
 * Türkçe duyarsız karşılaştırma.
 */
export function suggestedQueries(
  page: Pick<SearchPageData, 'predictions' | 'searchTerm'>,
  max = 5,
): SearchPrediction[] {
  const seen = new Set([page.searchTerm.trim().toLocaleLowerCase('tr-TR')])
  const out: SearchPrediction[] = []
  for (const p of page.predictions) {
    const k = p.text.trim().toLocaleLowerCase('tr-TR')
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(p)
    if (out.length >= max) break
  }
  return out
}

/** devbus `predict` · "sıralama": ilk öğelerin model puanları (MIMARI §9.3). */
export function rankingSummary(
  page: SearchPageData,
  n = 5,
): {
  term: string
  modelVersion: string
  top: { id: string; score: number | null; explain: SearchFeature[] | null }[]
} {
  const parts = pageParts(page)
  const ents = [...(parts.gallery?.entities ?? []), ...(parts.predicted?.entities ?? [])].slice(0, n)
  return {
    term: page.searchTerm,
    modelVersion: page.modelVersion,
    top: ents.map((e) => ({ id: e.unifiedEntityId, score: e.score, explain: e.explain ?? null })),
  }
}

/** Bölüm başına sonuç sayısı (olay günlüğü için). */
export function sectionCounts(page: SearchPageData): Record<string, number> {
  const out: Record<string, number> = {}
  for (const s of page.sections) out[s.id] = s.entities.length
  return out
}

/** 16:9 kart görseli: başlığın STORY_ART'ı; yoksa bağlamsal görsel yataysa o. */
export function landscapeArtwork(e: Pick<SearchEntity, 'contextualArtwork' | 'video'>): string | null {
  if (e.video?.storyArt?.url) return e.video.storyArt.url
  const c = e.contextualArtwork
  return c && c.width >= c.height ? c.url : null
}

/** Afiş (2:3): bağlamsal görsel dikeyse o, değilse başlığın afişi. */
export function posterArtwork(e: Pick<SearchEntity, 'contextualArtwork' | 'video'>): string | null {
  const c = e.contextualArtwork
  if (c && c.height > c.width) return c.url
  return e.video?.boxart.url ?? null
}

/** Tahmin türünün kısa etiketi (açılır listede). */
export const PREDICTION_KIND_LABEL: Record<PredictionKind, string> = {
  TITLE: 'başlık',
  PERSON: 'kişi',
  GENRE: 'tür',
  COLLECTION: 'koleksiyon',
  CHANNEL: 'kanal',
  QUERY: 'önceki arama',
}

export function predictionKindLabel(kind: string): string {
  return (PREDICTION_KIND_LABEL as Record<string, string>)[kind] ?? ''
}

/** Puan bileşeni adlarının okunur karşılıkları (açıklama penceresinde). */
export const FEATURE_LABEL: Record<string, string> = {
  metin: 'metin eşleşmesi',
  begeni: 'zevkine benzerlik',
  populerlik: 'popülerlik',
  tiklanma: 'tıklanma',
  yenilik: 'yenilik',
  devam: 'yarım kalan',
}
