/**
 * Servis katmanıyla saf çekirdek arasındaki ince köprü. Dizin, katalog değiştiğinde ya da
 * REBUILD_MS dolduğunda (yayın akışı ilerlediği için) tembel biçimde yeniden kurulur.
 * Diğer servislere yalnızca İSTEK ANINDA, kernel/services.ts arayüzlerinden erişilir.
 */
import { randomUUID } from 'node:crypto'
import type { AppConfig } from '../../kernel/config'
import type { Passport } from '../../kernel/context'
import type { AiringRecord, Services } from '../../kernel/services'
import { matchDoc, tokenize } from './match'
import { predictCompletionsPure, DEFAULT_COMPLETIONS } from './model/completions'
import { FEATURE_NAMES, NEUTRAL, queryKey, queryKeys, type FeatureVector, type WeightedKey } from './model/features'
import {
  ACTION_SIGNAL,
  bumpCounters,
  FEEDBACK_ACTIONS,
  pruneState,
  rememberQuery,
  sgdStep,
  WEAK_NEGATIVE_STRENGTH,
  type FeedbackAction,
  type LearnedQuery,
} from './model/model'
import { profileSignals, rankerFor, safeCall, type ProfileSignals } from './model/ranker'
import { recallResponse, rememberResponse, searchModel, type ServedEntity } from './model/runtime'
import { buildSearchPage, isDocVisible, type VisibilityContext } from './page'
import { buildSearchIndex, type SearchDoc, type SearchIndex } from './searchIndex'
import type {
  SearchCorpus,
  SearchOptionsInput,
  SearchPageResult,
  SearchPredictionResult,
  SearchSectionResult,
} from './types'

/** Dizin en çok bu kadar eski olabilir (yayın akışı penceresi kayar). */
export const REBUILD_MS = 5 * 60 * 1000
/** Dizine alınan yayın penceresi: geçmişten (şu an canlı olanlar için) ve gelecekten. */
const AIRING_PAST_MS = 12 * 3600_000
const AIRING_FUTURE_MS = 30 * 3600_000

interface EngineState {
  index: SearchIndex
  fingerprint: string
}

const states = new WeakMap<Services, EngineState>()

function fingerprintOf(corpus: Omit<SearchCorpus, 'airings'>): string {
  let ids = 0
  for (const t of corpus.titles) ids = (ids + t.videoId * 31 + t.popularity) % 2_147_483_647
  return [corpus.titles.length, ids, corpus.collections.length, corpus.channels.length, corpus.people.length].join('|')
}

function collectAirings(services: Services, channelIds: number[], now: Date): AiringRecord[] {
  const from = new Date(now.getTime() - AIRING_PAST_MS)
  const to = new Date(now.getTime() + AIRING_FUTURE_MS)
  const out: AiringRecord[] = []
  for (const id of channelIds) {
    try {
      out.push(...services.epg.airings(id, from, to))
    } catch {
      // Bir kanalın akışı okunamazsa arama yine çalışır; o kanalın yayınları dizine girmez.
    }
  }
  return out
}

/** Güncel dizini döndürür; gerekirse yeniden kurar. */
export function getSearchIndex(services: Services, now: Date = new Date()): SearchIndex {
  const catalog = services.catalog
  const base = {
    titles: catalog.allTitles(),
    collections: catalog.allCollections(),
    people: catalog.people(),
    channels: catalog.listChannels(),
  }
  const fingerprint = fingerprintOf(base)
  const state = states.get(services)
  if (state && state.fingerprint === fingerprint && now.getTime() - state.index.builtAt.getTime() < REBUILD_MS)
    return state.index

  const airings = services.epg
    ? collectAirings(
        services,
        base.channels.map((c) => c.channelId),
        now,
      )
    : []
  const index = buildSearchIndex({ ...base, airings }, now)
  states.set(services, { index, fingerprint })
  return index
}

/** Dizini bir sonraki istekte yeniden kurulmaya zorlar. */
export function invalidateSearchIndex(services: Services): void {
  states.delete(services)
}

/* ───────────── Tahmin modeli yardımcıları ───────────── */

const docMaps = new WeakMap<SearchIndex, Map<string, SearchDoc>>()
function docByKey(index: SearchIndex): Map<string, SearchDoc> {
  let m = docMaps.get(index)
  if (!m) {
    m = new Map(index.docs.map((d) => [d.key, d]))
    docMaps.set(index, m)
  }
  return m
}

function visibilityOf(services: Services, passport: Passport, now: Date): VisibilityContext {
  const profile = passport.profile
  return {
    kids: profile?.isKids ?? false,
    isTitleVisible: (titleId) => safeCall(() => services.catalog.isVisibleTo(profile, titleId), false),
    now,
  }
}

function recentSearchesOf(services: Services, passport: Passport): string[] {
  const profile = passport.profile
  if (!profile) return []
  return safeCall(() => services.progress.recentSearches(profile.guid), [])
}

/** Öğrenilmiş sorgular: yalnız tıklanan varlığı bu profile görünür olanlar (çocuk profili yetişkin sorgusunu görmez). */
function visibleLearnedQueries(index: SearchIndex, all: Record<string, LearnedQuery>, vis: VisibilityContext) {
  const docs = docByKey(index)
  return Object.values(all).filter((q) => {
    const d = docs.get(q.entityId)
    return d ? isDocVisible(d, vis) : false
  })
}

/** Tamamlamalar için aday belgeler: yayınlar hariç, profile görünür. */
function completionDocs(index: SearchIndex, vis: VisibilityContext): SearchDoc[] {
  return index.docs.filter((d) => d.type !== 'airing' && isDocVisible(d, vis))
}

function completionsWith(
  services: Services,
  passport: Passport,
  index: SearchIndex,
  signals: ProfileSignals,
  prefix: string,
  first: number,
  now: Date,
  config: AppConfig | null | undefined,
): SearchPredictionResult[] {
  const state = searchModel(services, config).store.get()
  const vis = visibilityOf(services, passport, now)
  return predictCompletionsPure({
    prefix,
    first,
    docs: completionDocs(index, vis),
    ranker: rankerFor(services, state, signals, prefix, now),
    learned: visibleLearnedQueries(index, state.queries, vis),
    recentSearches: recentSearchesOf(services, passport),
  })
}

/** Yanıtta modelle puanlanmış varlıkları (gösterildikleri andaki öznitelikleriyle) hatırlar. */
function servedEntities(sections: readonly SearchSectionResult[]): ServedEntity[] {
  const out: ServedEntity[] = []
  for (const s of sections) {
    for (const e of s.entities) {
      if (!e.explain) continue
      const x: FeatureVector = { ...NEUTRAL }
      for (const f of e.explain)
        if ((FEATURE_NAMES as readonly string[]).includes(f.name)) x[f.name as keyof FeatureVector] = f.value
      out.push({ entityId: e.unifiedEntityId, sectionId: s.id, pos: e.track.pos, x })
    }
  }
  return out
}

/* ───────────── Dış işlevler ───────────── */

/** Bir arama isteğini çalıştırır (çözümleyicinin tek çağrısı). */
export function runSearch(
  services: Services,
  passport: Passport,
  term: string,
  options: SearchOptionsInput | null | undefined,
  now: Date = new Date(),
  config?: AppConfig | null,
): SearchPageResult {
  const profile = passport.profile
  const index = getSearchIndex(services, now)
  const rt = searchModel(services, config)
  const signals = profileSignals(services, profile)
  const requestId = randomUUID()
  const page = buildSearchPage(index, {
    term,
    options,
    now,
    requestId,
    kids: profile?.isKids ?? false,
    isTitleVisible: (titleId) => services.catalog.isVisibleTo(profile, titleId),
    isEntitled: (videoId) => services.entitlement.accessForVideo(passport, videoId).state === 'PLAYABLE',
    recentSearches: recentSearchesOf(services, passport),
    ranker: rankerFor(services, rt.store.get(), signals, term, now),
    predictions: completionsWith(services, passport, index, signals, term, DEFAULT_COMPLETIONS, now, config),
  })
  rememberResponse(rt, requestId, { term, at: now.getTime(), entities: servedEntities(page.sections) })
  return page
}

/** Query.searchPredictions: yazılan önek için model tahmini tamamlamalar. */
export function predictSearches(
  services: Services,
  passport: Passport,
  prefix: string,
  first: number = DEFAULT_COMPLETIONS,
  now: Date = new Date(),
  config?: AppConfig | null,
): SearchPredictionResult[] {
  const index = getSearchIndex(services, now)
  const signals = profileSignals(services, passport.profile)
  return completionsWith(services, passport, index, signals, prefix, first, now, config)
}

export const DEFAULT_POPULAR = 12
export const MAX_POPULAR = 50

/** Query.popularSearches: kutu boşken profile göre en olası başlıklar (boş sorguyla model sırası). */
export function popularSearchTitles(
  services: Services,
  passport: Passport,
  first: number = DEFAULT_POPULAR,
  now: Date = new Date(),
  config?: AppConfig | null,
): number[] {
  const n = Math.max(1, Math.min(MAX_POPULAR, Math.floor(Number.isFinite(first) ? first : DEFAULT_POPULAR)))
  const index = getSearchIndex(services, now)
  const vis = visibilityOf(services, passport, now)
  const ranker = rankerFor(
    services,
    searchModel(services, config).store.get(),
    profileSignals(services, passport.profile),
    '',
    now,
  )
  return index.docs
    .filter((d) => d.type === 'video' && isDocVisible(d, vis) && !ranker.isDisliked(d.videoId ?? 0))
    .map((doc) => ({ doc, p: ranker.scoreVideo(doc, 0).score }))
    .sort((a, b) => b.p - a.p || b.doc.popularity - a.doc.popularity || (a.doc.videoId ?? 0) - (b.doc.videoId ?? 0))
    .slice(0, n)
    .map((x) => x.doc.videoId ?? 0)
}

export interface SearchFeedbackInput {
  requestId: string
  searchTerm: string
  unifiedEntityId: string
  position: number
  action: FeedbackAction
}

export const isFeedbackAction = (a: unknown): a is FeedbackAction =>
  typeof a === 'string' && (FEEDBACK_ACTIONS as readonly string[]).includes(a)

/**
 * Mutation.recordSearchFeedback: modeli günceller.
 *  - Olumlu tepki (CLICK/PLAY/ADD_TO_LIST): tıklanan için y=1 SGD adımı; aynı yanıtta aynı bölümde ÜSTÜNDE gösterilenler
 *    zayıf olumsuz (y=0, güç 0.3). DISMISS: yalnız o öğe için y=0.
 *  - Sorgu + 2–4 harflik önekleri + genel ('') sayaçları artar; olumlu tepkide sorgu tamamlamalara eklenir.
 *  - Bilinmeyen/eskimiş requestId: olumlu tepki yine kaydedilir (öznitelikler o an yeniden hesaplanır).
 */
export function recordSearchFeedback(
  services: Services,
  passport: Passport,
  input: SearchFeedbackInput,
  now: Date = new Date(),
  config?: AppConfig | null,
): boolean {
  const rt = searchModel(services, config)
  const signal = ACTION_SIGNAL[input.action]
  const entityId = input.unifiedEntityId
  const term = input.searchTerm ?? ''
  const served = recallResponse(rt, input.requestId, now.getTime())

  let x = served?.entities.find((e) => e.entityId === entityId)?.x ?? null
  if (!x) {
    // Yanıt hatırlanmıyor: öznitelikleri şimdi hesapla (yalnız video belgeleri modelle puanlanır).
    const doc = docByKey(getSearchIndex(services, now)).get(entityId)
    if (doc?.type === 'video') {
      const ranker = rankerFor(services, rt.store.get(), profileSignals(services, passport.profile), term, now)
      x = ranker.scoreVideo(doc, matchDoc(doc, tokenize(term))?.score ?? 0).x
    }
  }

  let negatives: ServedEntity[] = []
  if (signal.y === 1 && served) {
    const clicked = served.entities.find((e) => e.entityId === entityId)
    const sectionId = clicked?.sectionId ?? served.entities[0]?.sectionId
    const above = clicked ? clicked.pos : Math.max(0, Math.floor(input.position))
    negatives = served.entities.filter((e) => e.sectionId === sectionId && e.pos < above && e.entityId !== entityId)
  }

  const keys: WeightedKey[] = queryKey(term) ? [...queryKeys(term), { key: '', weight: 1 }] : queryKeys('')
  rt.store.update((s) => {
    if (x) sgdStep(s, x, signal.y, signal.strength)
    for (const n of negatives) sgdStep(s, n.x, 0, WEAK_NEGATIVE_STRENGTH)
    bumpCounters(s, keys, entityId, signal.y ? signal.strength : 0, signal.y ? 0 : signal.strength)
    for (const n of negatives) bumpCounters(s, keys, n.entityId, 0, WEAK_NEGATIVE_STRENGTH)
    if (signal.y === 1) rememberQuery(s, queryKey(term), term.trim(), entityId, signal.strength, now)
    s.updates++
    pruneState(s)
  })
  return true
}
