/**
 * İstek ömürlü sıralayıcı: profil sinyallerini (zevk vektörü, yarım kalanlar, Listem, son 24 saat oynatmaları)
 * BİR KEZ okur ve dizin belgelerini modelle puanlar. Servislere yalnız burada ve engine.ts'te erişilir; sayfa kurucu
 * (page.ts) bu nesneyi saf bir arayüz olarak görür.
 */
import type { ContentTitle } from '../../../../../shared/content-schema'
import type { ProfileRecord } from '../../../kernel/context'
import type { Services } from '../../../kernel/services'
import { featuresOf, similarTitles, tasteVector } from '../../discovery/similarity'
import type { SearchDoc } from '../searchIndex'
import {
  affinity,
  continueFeature,
  popularityFeature,
  queryKeys,
  recencyFeature,
  smoothedCtr,
  textFeature,
  vectorNorm,
  type FeatureVector,
  type WeightedKey,
} from './features'
import {
  explain,
  galleryReason,
  modelVersionOf,
  predict,
  predictedReason,
  type FeatureContribution,
  type ModelState,
} from './model'

/** Bir profilin sıralamada kullanılan sinyalleri. */
export interface ProfileSignals {
  taste: Map<string, number>
  tasteNorm: number
  inProgress: Set<number>
  myList: Set<number>
  disliked: Set<number>
  /** Üst başlık kimliği → son 24 saatteki oynatma başlangıcı */
  plays: Map<number, number>
  maxPlays: number
}

export const EMPTY_SIGNALS: ProfileSignals = {
  taste: new Map(),
  tasteNorm: 0,
  inProgress: new Set(),
  myList: new Set(),
  disliked: new Set(),
  plays: new Map(),
  maxPlays: 0,
}

/** Servis yöntemi yoksa ya da fırlatırsa yedek değer (sahte servisler, henüz hazır olmayan servisler). */
function safe<T>(fn: () => T, fallback: T): T {
  try {
    const v = fn()
    return v === undefined ? fallback : v
  } catch {
    return fallback
  }
}

/** Zevk vektörü sinyalleri discovery/lolomo ile aynı ağırlıklarla kurulur. */
export function profileSignals(services: Services, profile: ProfileRecord | null): ProfileSignals {
  const catalog = services.catalog
  const plays = new Map<number, number>()
  const raw = safe(() => services.events.playCounts(24), new Map<number, number>())
  for (const [videoId, n] of raw) {
    const titleId = safe(() => catalog.titleOf(videoId)?.videoId ?? videoId, videoId)
    plays.set(titleId, (plays.get(titleId) ?? 0) + n)
  }
  let maxPlays = 0
  for (const n of plays.values()) maxPlays = Math.max(maxPlays, n)
  if (!profile) return { ...EMPTY_SIGNALS, plays, maxPlays }

  const progress = services.progress
  const guid = profile.guid
  const recent = safe(() => progress.recentTitles(guid), [])
  const myList = safe(() => progress.myList(guid), [])
  const liked = safe(() => progress.liked(guid), [])
  const disliked = safe(() => progress.disliked(guid), [])
  const signals = [
    ...recent.map((titleId, i) => ({ titleId, weight: 1 / (1 + 0.2 * i) })),
    ...myList.map((titleId) => ({ titleId, weight: 1 })),
    ...liked.map((titleId) => ({ titleId, weight: 2 })),
    ...disliked.map((titleId) => ({ titleId, weight: -2 })),
  ]
  const taste = signals.length ? safe(() => tasteVector(catalog, signals), new Map<string, number>()) : new Map()
  const inProgress = new Set(safe(() => progress.continueWatching(guid), []).map((c) => c.titleId))
  return {
    taste,
    tasteNorm: vectorNorm(taste),
    inProgress,
    myList: new Set(myList),
    disliked: new Set(disliked),
    plays,
    maxPlays,
  }
}

export interface Scored {
  /** Modelin tıklanma olasılığı (0–1) */
  score: number
  x: FeatureVector
  explain: FeatureContribution[]
}

export interface SearchRanker {
  readonly modelVersion: string
  readonly term: string
  /** Video belgesini puanlar; `matchScore` metin eşleşme puanı (0–100; tahminle gelende 0). */
  scoreVideo(doc: SearchDoc, matchScore: number): Scored
  /** Video dışı belge (kişi, tür, koleksiyon, kanal) — tamamlamalar için. */
  scoreEntity(doc: SearchDoc, matchScore: number, keys?: readonly WeightedKey[]): Scored
  /** Ham öznitelikle puan (öğrenilmiş sorgu adayları gibi belgesiz adaylar için). */
  scoreVector(x: FeatureVector): number
  galleryReason(s: Scored): string | null
  predictedReason(s: Scored): string
  /** Başlığa benzer başlık kimlikleri (discovery benzerliği), en benzer önce. */
  similarTo(titleId: number, limit: number): number[]
  isDisliked(titleId: number): boolean
  /**
   * Sorgu bir başlığa/kişiye/türe açıkça çözüldüğünde: zevk vektörüne o tohum başlıkların özellikleri katılmış
   * sıralayıcı. "‹X› ile ilgili" bölümünde begeni böylece hem profili hem aranan konuyu yansıtır.
   */
  focus(seedTitleIds: readonly number[]): SearchRanker
}

/** Odak ağırlığı: normalize zevk vektörü × 0.5 + normalize tohum vektörü × 1 */
export const FOCUS_PROFILE_SHARE = 0.5

/** Profil zevkini tohum başlıkların özellikleriyle birleştirir (ikisi de birim uzunluğa ölçeklenir). */
export function focusedTaste(taste: ReadonlyMap<string, number>, seeds: readonly ContentTitle[]): Map<string, number> {
  const seed = new Map<string, number>()
  for (const t of seeds) for (const [k, w] of featuresOf(t)) seed.set(k, (seed.get(k) ?? 0) + w)
  const out = new Map<string, number>()
  const tn = vectorNorm(taste)
  const sn = vectorNorm(seed)
  if (tn > 0) for (const [k, w] of taste) out.set(k, (FOCUS_PROFILE_SHARE * w) / tn)
  if (sn > 0) for (const [k, w] of seed) out.set(k, (out.get(k) ?? 0) + w / sn)
  return out
}

export interface RankerInput {
  state: ModelState
  signals: ProfileSignals
  term: string
  now: Date
  getTitle: (titleId: number) => ContentTitle | null
  similar?: (titleId: number) => ContentTitle[]
}

/** Saf sıralayıcı: durum + sinyaller + başlık okuyucu. */
export function createRanker(input: RankerInput): SearchRanker {
  const { state, signals, term, now, getTitle } = input
  const keys = queryKeys(term)
  const cache = new Map<string, Scored>()

  const scored = (x: FeatureVector): Scored => ({ score: predict(state, x), x, explain: explain(state, x) })

  const titleAffinity = (titleId: number) => {
    const t = getTitle(titleId)
    return t ? affinity(signals.taste, signals.tasteNorm, featuresOf(t)) : 0
  }

  function scoreVideo(doc: SearchDoc, matchScore: number): Scored {
    const cacheKey = `${doc.key}|${matchScore}`
    const hit = cache.get(cacheKey)
    if (hit) return hit
    const id = doc.videoId ?? 0
    const x: FeatureVector = {
      metin: textFeature(matchScore),
      begeni: titleAffinity(id),
      populerlik: popularityFeature(doc.popularity, signals.plays.get(id) ?? 0, signals.maxPlays),
      tiklanma: smoothedCtr(state.pairs, keys, doc.key),
      yenilik: recencyFeature(doc.video?.addedAt, now),
      devam: continueFeature(signals.inProgress.has(id), signals.myList.has(id)),
    }
    const s = scored(x)
    cache.set(cacheKey, s)
    return s
  }

  function scoreEntity(doc: SearchDoc, matchScore: number, k: readonly WeightedKey[] = keys): Scored {
    if (doc.type === 'video' && k === keys) return scoreVideo(doc, matchScore)
    let begeni = 0
    for (const id of doc.titleIds.slice(0, 30)) begeni = Math.max(begeni, titleAffinity(id))
    const isVideo = doc.type === 'video'
    const id = doc.videoId ?? 0
    return scored({
      metin: textFeature(matchScore),
      begeni,
      populerlik: popularityFeature(
        doc.popularity,
        isVideo ? (signals.plays.get(id) ?? 0) : 0,
        isVideo ? signals.maxPlays : 0,
      ),
      tiklanma: smoothedCtr(state.pairs, k, doc.key),
      yenilik: isVideo ? recencyFeature(doc.video?.addedAt, now) : 0,
      devam: isVideo ? continueFeature(signals.inProgress.has(id), signals.myList.has(id)) : 0,
    })
  }

  return {
    modelVersion: modelVersionOf(state),
    term,
    scoreVideo,
    scoreEntity,
    scoreVector: (x) => predict(state, x),
    galleryReason: (s) => galleryReason(state, s.x),
    predictedReason: (s) => predictedReason(state, s.x, keys[0]?.key !== ''),
    similarTo: (titleId, limit) => (input.similar ? input.similar(titleId) : []).slice(0, limit).map((t) => t.videoId),
    isDisliked: (titleId) => signals.disliked.has(titleId),
    focus: (seedTitleIds) => {
      const seeds = seedTitleIds.map(getTitle).filter((t): t is ContentTitle => t !== null)
      if (seeds.length === 0) return createRanker(input)
      const taste = focusedTaste(signals.taste, seeds)
      return createRanker({ ...input, signals: { ...signals, taste, tasteNorm: vectorNorm(taste) } })
    },
  }
}

/** Servislerden sıralayıcı kurar (engine.ts). */
export function rankerFor(
  services: Services,
  state: ModelState,
  signals: ProfileSignals,
  term: string,
  now: Date,
): SearchRanker {
  const catalog = services.catalog
  return createRanker({
    state,
    signals,
    term,
    now,
    getTitle: (id) => safe(() => catalog.getTitle(id), null),
    similar: (id) => safe(() => similarTitles(catalog, id), []),
  })
}

export { safe as safeCall }
