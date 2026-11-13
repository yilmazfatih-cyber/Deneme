/**
 * Servis katmanıyla saf çekirdek arasındaki ince köprü. Dizin, katalog değiştiğinde ya da
 * REBUILD_MS dolduğunda (yayın akışı ilerlediği için) tembel biçimde yeniden kurulur.
 * Diğer servislere yalnızca İSTEK ANINDA, kernel/services.ts arayüzlerinden erişilir.
 */
import { randomUUID } from 'node:crypto'
import type { Passport } from '../../kernel/context'
import type { AiringRecord, Services } from '../../kernel/services'
import { buildSearchPage } from './page'
import { buildSearchIndex, type SearchIndex } from './searchIndex'
import type { SearchCorpus, SearchOptionsInput, SearchPageResult } from './types'

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

/** Bir arama isteğini çalıştırır (çözümleyicinin tek çağrısı). */
export function runSearch(
  services: Services,
  passport: Passport,
  term: string,
  options: SearchOptionsInput | null | undefined,
  now: Date = new Date(),
): SearchPageResult {
  const profile = passport.profile
  const index = getSearchIndex(services, now)
  let recentSearches: string[] = []
  if (profile) {
    try {
      recentSearches = services.progress.recentSearches(profile.guid)
    } catch {
      recentSearches = []
    }
  }
  return buildSearchPage(index, {
    term,
    options,
    now,
    requestId: randomUUID(),
    kids: profile?.isKids ?? false,
    isTitleVisible: (titleId) => services.catalog.isVisibleTo(profile, titleId),
    isEntitled: (videoId) => services.entitlement.accessForVideo(passport, videoId).state === 'PLAYABLE',
    recentSearches,
  })
}
