/**
 * Arama sayfası kurucu (saf). Sıra niyet sırasıdır:
 *   "Şu an canlı" (kanallar + yayınlar, 60 sn) → "Keşfetmeye devam et" (öneriler) → "Film ve Diziler" (galeri).
 * Yalnızca istemcinin bildirdiği bölümler ve o bölümde çizebildiği varlıklar döner (yetenek pazarlığı).
 * Arama asla çıkmaz sokak değildir: boş terim ya da düzeltmeye rağmen sonuçsuzluk → yedek sayfa
 * ("Şu an canlı" + "Popüler", isFallback: true).
 */
import { LIVE_SECTION_TTL_SEC, SEARCH_TTL_SEC } from '../../../../shared/constants'
import { formatTctx } from '../../../../shared/tctx'
import { norm, stableId } from '../../../../shared/text'
import type { ArtworkTypeName } from '../../kernel/imageUrls'
import {
  canRender,
  hasSection,
  negotiateCapabilities,
  TREATMENT_KIND,
  type NegotiatedCapabilities,
} from './capabilities'
import { correctQuery, WEAK_SCORE } from './fuzzy'
import { compareMatches, matchAll, tokenize, type DocMatch } from './match'
import type { SearchDoc, SearchIndex } from './searchIndex'
import type {
  SearchCorrectionResult,
  SearchEntityRef,
  SearchEntityResult,
  SearchFiltersInput,
  SearchOptionsInput,
  SearchPageResult,
  SearchSectionResult,
  SearchSectionType,
  SectionCapabilityName,
  TreatmentName,
} from './types'

export const DEFAULT_PAGE_SIZE = 48
export const MAX_PAGE_SIZE = 200
export const LIVE_LIMIT = 12
export const LIST_LIMIT = 12
export const TITLE_SUGGESTION_LIMIT = 5
export const FALLBACK_LIVE_LIMIT = 8
/** "Şu an canlı" bölümü: canlı olanlar ve bu kadar saat içinde başlayacaklar */
export const UPCOMING_WINDOW_HOURS = 24

export const SECTION_IDS = { live: 'canli', list: 'oneriler', gallery: 'galeri', popular: 'populer' } as const
export const SECTION_TITLES = {
  live: 'Şu an canlı',
  list: 'Keşfetmeye devam et',
  gallery: 'Film ve Diziler',
  popular: 'Popüler',
} as const

export interface SearchRequestContext {
  term: string
  options: SearchOptionsInput | null | undefined
  now: Date
  requestId: string
  /** Çocuk profili: yalnızca çocuk kanalları */
  kids: boolean
  /** catalog.isVisibleTo(profile, titleId) */
  isTitleVisible: (titleId: number) => boolean
  /** Yetki durumu PLAYABLE mı ("Yalnızca paketimdekiler" süzgeci) */
  isEntitled: (videoId: number) => boolean
  recentSearches: string[]
}

interface Hit extends DocMatch {
  fuzzy: boolean
}

/** Belge türü → çizilebileceği (bölüm, biçim) çiftleri. */
const PLACEMENTS: Record<SearchDoc['type'], [SectionCapabilityName, TreatmentName][]> = {
  video: [
    ['searchGallery', 'standardBoxshot'],
    ['searchList', 'standardSuggestion'],
  ],
  channel: [['searchLive', 'standardChannelTile']],
  airing: [['searchLive', 'standardAiringRow']],
  person: [['searchList', 'standardPersonChip']],
  collection: [['searchList', 'standardDestination']],
  genre: [['searchList', 'standardDestination']],
}

export const searchTrackId = (term: string) => stableId(`search|${norm(term)}`)

/* ───────────── Görünürlük ───────────── */

function isAiringInWindow(doc: SearchDoc, now: Date): boolean {
  const a = doc.airing
  if (!a) return false
  return a.endAt.getTime() > now.getTime() && a.startAt.getTime() < now.getTime() + UPCOMING_WINDOW_HOURS * 3600_000
}

function isDocVisible(doc: SearchDoc, ctx: SearchRequestContext): boolean {
  switch (doc.type) {
    case 'video':
      return ctx.isTitleVisible(doc.videoId ?? 0)
    case 'channel':
      return !ctx.kids || doc.channelKids === true
    case 'airing':
      return (
        (!ctx.kids || doc.channelKids === true) &&
        doc.titleIds.every(ctx.isTitleVisible) &&
        isAiringInWindow(doc, ctx.now)
      )
    case 'person':
    case 'collection':
    case 'genre':
      return doc.titleIds.some(ctx.isTitleVisible)
  }
}

function isRenderable(doc: SearchDoc, caps: NegotiatedCapabilities): boolean {
  return PLACEMENTS[doc.type].some(([s, t]) => canRender(caps, s, t))
}

/* ───────────── Varlık ve bölüm kurulumu ───────────── */

function refOf(doc: SearchDoc): SearchEntityRef {
  switch (doc.type) {
    case 'video':
      return { type: 'video', videoId: doc.videoId ?? 0 }
    case 'channel':
      return { type: 'channel', channelId: doc.channelId ?? 0 }
    case 'airing':
      if (!doc.airing) throw new Error(`Yayın kaydı eksik: ${doc.key}`)
      return { type: 'airing', airing: doc.airing }
    case 'person':
      return { type: 'person', personId: doc.personId ?? 0, name: doc.displayString }
    case 'collection':
      return { type: 'collection', collectionId: doc.collectionId ?? 0 }
    case 'genre':
      return { type: 'genre', genreId: doc.genreId ?? 0 }
  }
}

interface PendingEntity {
  hit: Hit
  treatment: TreatmentName
  artworkType: ArtworkTypeName | null
}
interface PendingSection {
  sectionType: SearchSectionType
  id: string
  displayString: string
  ttlSec: number
  entities: PendingEntity[]
  totalCount: number
}

function videoArtwork(hit: Hit): ArtworkTypeName {
  return hit.onTitle ? 'BOXART' : 'STORY_ART'
}

/** Boş bölümleri atar, satır/konum izlerini (tctx) son sıraya göre verir. */
function finalizeSections(pending: PendingSection[], trackId: number, now: Date): SearchSectionResult[] {
  const out: SearchSectionResult[] = []
  for (const p of pending) {
    if (p.entities.length === 0) continue
    const row = out.length
    out.push({
      sectionType: p.sectionType,
      id: p.id,
      displayString: p.displayString,
      expires: new Date(now.getTime() + p.ttlSec * 1000),
      totalCount: p.totalCount,
      entities: p.entities.map((e, pos): SearchEntityResult => {
        const entityId = e.hit.doc.key
        return {
          unifiedEntityId: entityId,
          kind: TREATMENT_KIND[e.treatment],
          displayString: e.hit.doc.displayString,
          treatment: e.treatment,
          fuzzy: e.hit.fuzzy,
          ref: refOf(e.hit.doc),
          artworkType: e.artworkType,
          score: e.hit.score,
          track: {
            row,
            pos,
            rowId: p.id,
            trackId,
            entityId,
            tctx: formatTctx({ row, rank: pos, rowId: p.id, trackId, entityId }),
          },
        }
      }),
    })
  }
  return out
}

function pageExpires(sections: SearchSectionResult[], now: Date): Date {
  let min = now.getTime() + SEARCH_TTL_SEC * 1000
  for (const s of sections) min = Math.min(min, s.expires.getTime())
  return new Date(min)
}

/* ───────────── Galeri süzgeçleri ve sıralama ───────────── */

const collator = new Intl.Collator('tr', { sensitivity: 'base' })

export function applyGalleryFilters(
  hits: Hit[],
  filters: SearchFiltersInput | null | undefined,
  isEntitled: (videoId: number) => boolean,
): Hit[] {
  if (!filters) return hits
  const genreIds = filters.genreIds && filters.genreIds.length > 0 ? new Set(filters.genreIds) : null
  const kind = filters.kind === 'film' ? 'MOVIE' : filters.kind === 'dizi' ? 'SHOW' : null
  const year = filters.year
  return hits.filter(({ doc }) => {
    const v = doc.video
    if (!v) return false
    if (genreIds && !v.genreIds.some((g) => genreIds.has(g))) return false
    if (kind && v.type !== kind) return false
    if (year === '2020' && v.year < 2020) return false
    if (year === '2010' && (v.year < 2010 || v.year > 2019)) return false
    if (year === 'old' && v.year >= 2010) return false
    if (filters.entitledOnly && !isEntitled(doc.videoId ?? 0)) return false
    return true
  })
}

/** Doğrudan eşleşmeler her sıralamada yazım düzeltmesiyle bulunanlardan önce gelir (MIXED kuralı). */
export function sortGallery(hits: Hit[], sort: string | null | undefined): Hit[] {
  const byFuzzy = (a: Hit, b: Hit) => Number(a.fuzzy) - Number(b.fuzzy)
  const cmp =
    sort === 'new'
      ? (a: Hit, b: Hit) =>
          byFuzzy(a, b) ||
          (b.doc.video?.year ?? 0) - (a.doc.video?.year ?? 0) ||
          (b.doc.video?.addedAt ?? '').localeCompare(a.doc.video?.addedAt ?? '') ||
          compareMatches(a, b)
      : sort === 'az'
        ? (a: Hit, b: Hit) =>
            byFuzzy(a, b) || collator.compare(a.doc.displayString, b.doc.displayString) || compareMatches(a, b)
        : (a: Hit, b: Hit) => byFuzzy(a, b) || compareMatches(a, b)
  return [...hits].sort(cmp)
}

function pageSizeOf(options: SearchOptionsInput | null | undefined): number {
  const n = options?.pageSize
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return DEFAULT_PAGE_SIZE
  return Math.min(MAX_PAGE_SIZE, Math.floor(n))
}

function gallerySection(
  id: string,
  displayString: string,
  hits: Hit[],
  ctx: SearchRequestContext,
  artwork: (h: Hit) => ArtworkTypeName,
): PendingSection {
  const filtered = sortGallery(
    applyGalleryFilters(hits, ctx.options?.filters, ctx.isEntitled),
    ctx.options?.filters?.sort,
  )
  return {
    sectionType: 'SearchGallerySection',
    id,
    displayString,
    ttlSec: SEARCH_TTL_SEC,
    totalCount: filtered.length,
    entities: filtered
      .slice(0, pageSizeOf(ctx.options))
      .map((hit) => ({ hit, treatment: 'standardBoxshot', artworkType: artwork(hit) })),
  }
}

/* ───────────── Sonuç sayfası ───────────── */

/** Canlı bölüm sıralaması: puan, sonra şu an yayında olan, sonra erken başlayan. */
function compareLive(now: Date) {
  const t = now.getTime()
  const liveRank = (h: Hit) => (h.doc.airing ? (h.doc.airing.startAt.getTime() <= t ? 0 : 1) : 0)
  return (a: Hit, b: Hit) =>
    Number(a.fuzzy) - Number(b.fuzzy) ||
    b.score - a.score ||
    liveRank(a) - liveRank(b) ||
    (a.doc.airing?.startAt.getTime() ?? 0) - (b.doc.airing?.startAt.getTime() ?? 0) ||
    compareMatches(a, b)
}

/** Aynı kanalda aynı başlıklı yayın tekrarlarından yalnız en erken başlayanı (canlı olanı) tutar. */
function dedupeAirings(hits: Hit[]): Hit[] {
  const best = new Map<string, Hit>()
  const out: Hit[] = []
  for (const h of hits) {
    const a = h.doc.airing
    if (!a) {
      out.push(h)
      continue
    }
    const key = `${a.channelId}|${norm(a.title)}`
    const cur = best.get(key)
    if (!cur || (cur.doc.airing && a.startAt.getTime() < cur.doc.airing.startAt.getTime())) best.set(key, h)
  }
  return [...out, ...best.values()]
}

function resultSections(hits: Hit[], caps: NegotiatedCapabilities, ctx: SearchRequestContext): PendingSection[] {
  const pending: PendingSection[] = []

  if (hasSection(caps, 'searchLive')) {
    const live = dedupeAirings(
      hits.filter(
        (h) =>
          (h.doc.type === 'channel' && canRender(caps, 'searchLive', 'standardChannelTile')) ||
          (h.doc.type === 'airing' && canRender(caps, 'searchLive', 'standardAiringRow')),
      ),
    ).sort(compareLive(ctx.now))
    pending.push({
      sectionType: 'SearchLiveSection',
      id: SECTION_IDS.live,
      displayString: SECTION_TITLES.live,
      ttlSec: LIVE_SECTION_TTL_SEC,
      totalCount: live.length,
      entities: live.slice(0, LIVE_LIMIT).map((hit) => ({
        hit,
        treatment: hit.doc.type === 'channel' ? 'standardChannelTile' : 'standardAiringRow',
        artworkType: null,
      })),
    })
  }

  if (hasSection(caps, 'searchList')) {
    const titles = canRender(caps, 'searchList', 'standardSuggestion')
      ? hits.filter((h) => h.doc.type === 'video').slice(0, TITLE_SUGGESTION_LIMIT)
      : []
    const others = hits
      .filter(
        (h) =>
          (h.doc.type === 'person' && canRender(caps, 'searchList', 'standardPersonChip')) ||
          ((h.doc.type === 'collection' || h.doc.type === 'genre') &&
            canRender(caps, 'searchList', 'standardDestination')),
      )
      .slice(0, LIST_LIMIT - titles.length)
    const entities: PendingEntity[] = [
      ...others.map((hit): PendingEntity => ({
        hit,
        treatment: hit.doc.type === 'person' ? 'standardPersonChip' : 'standardDestination',
        artworkType: null,
      })),
      ...titles.map((hit): PendingEntity => ({ hit, treatment: 'standardSuggestion', artworkType: videoArtwork(hit) })),
    ]
    pending.push({
      sectionType: 'SearchListSection',
      id: SECTION_IDS.list,
      displayString: SECTION_TITLES.list,
      ttlSec: SEARCH_TTL_SEC,
      totalCount: entities.length,
      entities,
    })
  }

  if (canRender(caps, 'searchGallery', 'standardBoxshot')) {
    pending.push(
      gallerySection(
        SECTION_IDS.gallery,
        SECTION_TITLES.gallery,
        hits.filter((h) => h.doc.type === 'video'),
        ctx,
        // Galeri 2:3 afiş hücresi çizer: bağlamsal görsel her zaman BOXART biçimli (eşleşme türünden bağımsız).
        () => 'BOXART',
      ),
    )
  }
  return pending
}

function fallbackSections(
  pool: SearchDoc[],
  caps: NegotiatedCapabilities,
  ctx: SearchRequestContext,
): PendingSection[] {
  const pending: PendingSection[] = []
  const asHit = (doc: SearchDoc): Hit => ({ doc, score: 0, onTitle: true, fuzzy: false })
  const byChannelOrder = (a: SearchDoc, b: SearchDoc) =>
    Number(b.channelFavorite ?? false) - Number(a.channelFavorite ?? false) ||
    (a.channelNumber ?? 0) - (b.channelNumber ?? 0)

  if (canRender(caps, 'searchLive', 'standardChannelTile')) {
    const channels = pool.filter((d) => d.type === 'channel').sort(byChannelOrder)
    pending.push({
      sectionType: 'SearchLiveSection',
      id: SECTION_IDS.live,
      displayString: SECTION_TITLES.live,
      ttlSec: LIVE_SECTION_TTL_SEC,
      totalCount: channels.length,
      entities: channels
        .slice(0, FALLBACK_LIVE_LIMIT)
        .map((d) => ({ hit: asHit(d), treatment: 'standardChannelTile', artworkType: null })),
    })
  } else if (canRender(caps, 'searchLive', 'standardAiringRow')) {
    // Kanal kutucuğu çizemeyen istemciye şu an yayındaki programlar.
    const t = ctx.now.getTime()
    const order = new Map(
      pool
        .filter((d) => d.type === 'channel')
        .sort(byChannelOrder)
        .map((d, i) => [d.channelId ?? 0, i]),
    )
    const airings = pool
      .filter((d) => d.type === 'airing' && d.airing && d.airing.startAt.getTime() <= t)
      .sort((a, b) => (order.get(a.channelId ?? 0) ?? 999) - (order.get(b.channelId ?? 0) ?? 999))
    pending.push({
      sectionType: 'SearchLiveSection',
      id: SECTION_IDS.live,
      displayString: SECTION_TITLES.live,
      ttlSec: LIVE_SECTION_TTL_SEC,
      totalCount: airings.length,
      entities: airings
        .slice(0, FALLBACK_LIVE_LIMIT)
        .map((d) => ({ hit: asHit(d), treatment: 'standardAiringRow', artworkType: null })),
    })
  }

  if (canRender(caps, 'searchGallery', 'standardBoxshot')) {
    // Popülerlik sırası: tüm "puanlar" 0 olduğundan compareMatches popülerliğe düşer.
    const videos = pool.filter((d) => d.type === 'video').map(asHit)
    pending.push(gallerySection(SECTION_IDS.popular, SECTION_TITLES.popular, videos, ctx, () => 'BOXART'))
  }
  return pending
}

/**
 * Arama sayfasını kurar. Yalnızca dizin ve istek bağlamına bağlıdır (servis çağrısı yok).
 */
export function buildSearchPage(index: SearchIndex, ctx: SearchRequestContext): SearchPageResult {
  const caps = negotiateCapabilities(ctx.options?.pageCapabilities)
  const trackId = searchTrackId(ctx.term)
  const pool = index.docs.filter((d) => isRenderable(d, caps) && isDocVisible(d, ctx))
  const tokens = tokenize(ctx.term)

  const page = (
    sections: SearchSectionResult[],
    correction: SearchCorrectionResult | null,
    isFallback: boolean,
  ): SearchPageResult => ({
    searchTerm: ctx.term,
    requestId: ctx.requestId,
    trackId,
    expires: pageExpires(sections, ctx.now),
    correction,
    sections,
    isFallback,
    recentSearches: ctx.recentSearches,
  })
  const fallback = () => page(finalizeSections(fallbackSections(pool, caps, ctx), trackId, ctx.now), null, true)

  if (tokens.length === 0) return fallback()

  const direct: Hit[] = matchAll(pool, tokens).map((m) => ({ ...m, fuzzy: false }))
  let hits = direct
  let correction: SearchCorrectionResult | null = null

  const best = direct[0]?.score ?? 0
  // exactTerm: kullanıcı "Bunun yerine … ara" dedi → yazım düzeltmesi hiç denenmez.
  if (!ctx.options?.exactTerm && (direct.length === 0 || best < WEAK_SCORE)) {
    const qc = correctQuery(tokens, index.vocab)
    if (qc.changed) {
      const seen = new Set(direct.map((h) => h.doc.key))
      const fuzzy: Hit[] = matchAll(pool, qc.tokens)
        .filter((m) => !seen.has(m.doc.key))
        .map((m) => ({ ...m, fuzzy: true }))
      if (fuzzy.length > 0) {
        correction = {
          mode: direct.length === 0 ? 'CORRECTED' : 'MIXED',
          originalTerm: ctx.term,
          correctedTerm: qc.tokens.join(' '),
        }
        hits = [...direct, ...fuzzy]
      }
    }
  }

  if (hits.length === 0) return fallback()
  const sections = finalizeSections(resultSections(hits, caps, ctx), trackId, ctx.now)
  if (sections.length === 0) return fallback()
  return page(sections, correction, false)
}
