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
import { compareMatches, matchAll, SCORE, tokenize, type DocMatch } from './match'
import { MODEL_ID, REASONS } from './model/model'
import type { Scored, SearchRanker } from './model/ranker'
import type { SearchDoc, SearchIndex } from './searchIndex'
import type {
  SearchCorrectionResult,
  SearchEntityRef,
  SearchEntityResult,
  SearchFiltersInput,
  SearchOptionsInput,
  SearchPageResult,
  SearchPredictionResult,
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

export const SECTION_IDS = {
  live: 'canli',
  list: 'oneriler',
  gallery: 'galeri',
  popular: 'populer',
  related: 'ilgili',
  predicted: 'tahmin',
  personal: 'sana-ozel',
} as const
export const SECTION_TITLES = {
  live: 'Şu an canlı',
  list: 'Keşfetmeye devam et',
  gallery: 'Film ve Diziler',
  popular: 'Popüler',
  predicted: 'Bunlar ilgini çekebilir',
  personal: 'Sana özel öneriler',
  related: (name: string) => `${name} ile ilgili`,
} as const
/** Tahmini bölümde en çok kaç başlık */
export const PREDICTED_LIMIT = 12
/** "‹X› ile ilgili": modelin sıralayacağı en benzer aday sayısı (benzerlik süzer, model sıralar) */
export const RELATED_CANDIDATES = 18
/** Doğrudan video eşleşmesi bundan azsa "Bunlar ilgini çekebilir" eklenir */
export const FEW_RESULTS = 6
/** Model kapalıyken (saf testler) sürüm metni */
export const MODEL_OFF_VERSION = `${MODEL_ID} · kapalı`

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
  /** Tahmin modeli (engine.ts kurar). Yoksa sıralama eski kurallarla yapılır ve tahmini bölüm üretilmez. */
  ranker?: SearchRanker | null
  /** Yazılan metnin tamamlama tahminleri (engine.ts hesaplar) */
  predictions?: SearchPredictionResult[]
}

interface Hit extends DocMatch {
  fuzzy: boolean
}

/** Belge türü → çizilebileceği (bölüm, biçim) çiftleri. */
const PLACEMENTS: Record<SearchDoc['type'], [SectionCapabilityName, TreatmentName][]> = {
  video: [
    ['searchGallery', 'standardBoxshot'],
    ['searchList', 'standardSuggestion'],
    ['searchPredicted', 'standardBoxshot'],
    ['searchPredicted', 'standardSuggestion'],
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

export type VisibilityContext = Pick<SearchRequestContext, 'kids' | 'isTitleVisible' | 'now'>

export function isDocVisible(doc: SearchDoc, ctx: VisibilityContext): boolean {
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
  /** Modelin puanı (varsa) */
  pred?: Scored
  predicted?: boolean
  reason?: string | null
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
          predicted: e.predicted ?? false,
          modelScore: e.pred ? Math.round(e.pred.score * 10_000) / 10_000 : null,
          reason: e.reason ?? null,
          explain: e.pred ? e.pred.explain : null,
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

/**
 * Model sıralaması (alaka sırası): doğrudan eşleşmeler yine yazım düzeltmesiyle bulunanlardan önce; içeride modelin
 * tıklanma olasılığı; eşitlikte eski kural (puan, popülerlik, ad).
 */
export function sortByModel(hits: Hit[], scores: ReadonlyMap<string, Scored>): Hit[] {
  const p = (h: Hit) => scores.get(h.doc.key)?.score ?? 0
  return [...hits].sort((a, b) => Number(a.fuzzy) - Number(b.fuzzy) || p(b) - p(a) || compareMatches(a, b))
}

function gallerySection(
  id: string,
  displayString: string,
  hits: Hit[],
  ctx: SearchRequestContext,
  artwork: (h: Hit) => ArtworkTypeName,
): PendingSection {
  const filteredHits = applyGalleryFilters(hits, ctx.options?.filters, ctx.isEntitled)
  const sort = ctx.options?.filters?.sort
  const ranker = ctx.ranker
  const scores = new Map<string, Scored>()
  if (ranker) for (const h of filteredHits) scores.set(h.doc.key, ranker.scoreVideo(h.doc, h.score))
  const filtered =
    ranker && (!sort || sort === 'rel') ? sortByModel(filteredHits, scores) : sortGallery(filteredHits, sort)
  return {
    sectionType: 'SearchGallerySection',
    id,
    displayString,
    ttlSec: SEARCH_TTL_SEC,
    totalCount: filtered.length,
    entities: filtered.slice(0, pageSizeOf(ctx.options)).map((hit): PendingEntity => {
      const pred = scores.get(hit.doc.key)
      return {
        hit,
        treatment: 'standardBoxshot',
        artworkType: artwork(hit),
        pred,
        predicted: false,
        reason: pred && ranker ? ranker.galleryReason(pred) : null,
      }
    }),
  }
}

/* ───────────── Tahmini sonuçlar (SearchPredictedSection) ───────────── */

/** İstemcinin tahmini bölümde çizebildiği video biçimi (afiş önce). */
function predictedTreatment(caps: NegotiatedCapabilities): TreatmentName | null {
  if (canRender(caps, 'searchPredicted', 'standardBoxshot')) return 'standardBoxshot'
  if (canRender(caps, 'searchPredicted', 'standardSuggestion')) return 'standardSuggestion'
  return null
}

/** Sorgu tek ve açık bir varlığa mı çözülüyor (başlık/kişi/tür/koleksiyon adı önek ya da tam eşleşme, rakipsiz)? */
export function clearSubject(direct: readonly Hit[]): Hit | null {
  const subjects = direct.filter(
    (h) =>
      !h.fuzzy &&
      (h.doc.type === 'video' || h.doc.type === 'person' || h.doc.type === 'genre' || h.doc.type === 'collection'),
  )
  const top = subjects[0]
  if (!top || !top.onTitle || top.score < SCORE.PREFIX) return null
  const second = subjects[1]
  if (second && second.score >= top.score) return null
  return top
}

interface PredictedPlan {
  id: string
  displayString: string
  /** Aday belgeler (yalnız video) */
  candidates: SearchDoc[]
  /** Sabit gerekçe ("Sintel ile ilgili"); yoksa modelin gerekçesi */
  reason: string | null
  /** "‹X› ile ilgili": begeni bu tohum başlıklara odaklanır */
  seeds?: number[]
}

function predictedSection(
  plan: PredictedPlan,
  caps: NegotiatedCapabilities,
  ranker: SearchRanker,
): PendingSection | null {
  const treatment = predictedTreatment(caps)
  if (!treatment) return null
  const r = plan.seeds && plan.seeds.length > 0 ? ranker.focus(plan.seeds) : ranker
  const scored = plan.candidates
    .filter((d) => !ranker.isDisliked(d.videoId ?? 0))
    .map((doc) => ({ doc, pred: r.scoreVideo(doc, 0) }))
    .sort(
      (a, b) =>
        b.pred.score - a.pred.score ||
        b.doc.popularity - a.doc.popularity ||
        (a.doc.videoId ?? 0) - (b.doc.videoId ?? 0),
    )
    .slice(0, PREDICTED_LIMIT)
  if (scored.length === 0) return null
  return {
    sectionType: 'SearchPredictedSection',
    id: plan.id,
    displayString: plan.displayString,
    ttlSec: SEARCH_TTL_SEC,
    totalCount: scored.length,
    entities: scored.map(({ doc, pred }) => ({
      hit: { doc, score: 0, onTitle: false, fuzzy: false },
      treatment,
      artworkType: treatment === 'standardBoxshot' ? 'BOXART' : 'STORY_ART',
      pred,
      predicted: true,
      reason: plan.reason ?? r.predictedReason(pred),
    })),
  }
}

/** Konu varlığının "tohum" başlıkları: başlığın kendisi, kişinin/türün/koleksiyonun en popüler başlıkları. */
function seedTitles(subject: Hit, pool: readonly SearchDoc[]): number[] {
  if (subject.doc.type === 'video') return [subject.doc.videoId ?? 0]
  const pop = new Map(pool.filter((d) => d.type === 'video').map((d) => [d.videoId ?? 0, d.popularity]))
  return subject.doc.titleIds
    .filter((id) => pop.has(id))
    .sort((a, b) => (pop.get(b) ?? 0) - (pop.get(a) ?? 0) || a - b)
    .slice(0, 3)
}

/**
 * Tahmini bölüm planı:
 *  - sorgu tek ve açık bir varlığa çözülüyorsa → "‹X› ile ilgili" (benzer başlıklar, model sıralar);
 *  - doğrudan video eşleşmesi azsa (< 6) ya da hiç yoksa → "Bunlar ilgini çekebilir";
 *  - boş sorgu → "Sana özel öneriler".
 * Doğrudan eşleşen hiçbir başlık tekrar edilmez.
 */
function planPredicted(
  pool: readonly SearchDoc[],
  hits: readonly Hit[],
  ranker: SearchRanker,
  emptyTerm: boolean,
): PredictedPlan | null {
  const videos = pool.filter((d) => d.type === 'video')
  if (emptyTerm)
    return { id: SECTION_IDS.personal, displayString: SECTION_TITLES.personal, candidates: videos, reason: null }
  const shown = new Set(hits.filter((h) => h.doc.type === 'video').map((h) => h.doc.key))
  const rest = videos.filter((d) => !shown.has(d.key))
  const subject = clearSubject(hits)
  if (subject) {
    const byId = new Map(rest.map((d) => [d.videoId ?? 0, d]))
    const related: SearchDoc[] = []
    const seen = new Set<number>()
    const seeds = seedTitles(subject, pool)
    for (const seed of seeds) {
      for (const id of ranker.similarTo(seed, RELATED_CANDIDATES)) {
        const d = byId.get(id)
        if (d && !seen.has(id)) {
          seen.add(id)
          related.push(d)
        }
      }
    }
    if (related.length > 0) {
      const name = subject.doc.displayString
      return {
        id: SECTION_IDS.related,
        displayString: SECTION_TITLES.related(name),
        candidates: related.slice(0, RELATED_CANDIDATES),
        reason: REASONS.related(name),
        seeds,
      }
    }
  }
  if (shown.size < FEW_RESULTS)
    return { id: SECTION_IDS.predicted, displayString: SECTION_TITLES.predicted, candidates: rest, reason: null }
  return null
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
  /** Tahmin modeli bölümü varsa "Popüler" yerine o gösterilir (aynı amaç, modelle sıralı) */
  predicted: PendingSection | null = null,
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

  if (predicted) pending.push(predicted)
  else if (canRender(caps, 'searchGallery', 'standardBoxshot')) {
    // Popülerlik sırası: tüm "puanlar" 0 olduğundan compareMatches popülerliğe düşer (model varsa model sırası).
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
    predictions: ctx.predictions ?? [],
    modelVersion: ctx.ranker?.modelVersion ?? MODEL_OFF_VERSION,
  })
  const predictedFor = (hits: readonly Hit[]): PendingSection | null => {
    const ranker = ctx.ranker
    if (!ranker || !hasSection(caps, 'searchPredicted')) return null
    const plan = planPredicted(pool, hits, ranker, tokens.length === 0)
    return plan ? predictedSection(plan, caps, ranker) : null
  }
  const fallback = () =>
    page(finalizeSections(fallbackSections(pool, caps, ctx, predictedFor([])), trackId, ctx.now), null, true)

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
  const pendingSections = resultSections(hits, caps, ctx)
  const predicted = predictedFor(hits)
  if (predicted) pendingSections.push(predicted)
  const sections = finalizeSections(pendingSections, trackId, ctx.now)
  if (sections.length === 0) return fallback()
  return page(sections, correction, false)
}
