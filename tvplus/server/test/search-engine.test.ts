/**
 * Arama köprüsü testleri: runSearch (servis arayüzleri → saf çekirdek) ve çözümleyici haritası,
 * gerçek şema (shared/graphql/schema.graphql) ve gerçek GraphQL motoru (createGraphQLEngine) üzerinden.
 * Servisler sahte nesnelerdir; yalnızca arama tarafının kullandığı yöntemler doldurulmuştur.
 */
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSchema, parse, validate } from 'graphql'
import { describe, expect, it } from 'vitest'
import { createGraphQLEngine, type PersistedRegistry } from '../src/graphql/engine'
import { searchResolvers } from '../src/graphql/resolvers/search'
import { loadConfig } from '../src/kernel/config'
import type { Passport, ProfileRecord } from '../src/kernel/context'
import type { AccessDecision, Services } from '../src/kernel/services'
import { getSearchIndex, REBUILD_MS, runSearch } from '../src/services/search/engine'
import { AIRINGS, CHANNELS, COLLECTIONS, FULL_CAPS, NOW, OLD_CAPS, peopleOf, TITLES } from './search-fixtures'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCHEMA = readFileSync(join(ROOT, 'shared', 'graphql', 'schema.graphql'), 'utf8')

const ADULT: ProfileRecord = {
  guid: 'P-YETISKIN',
  accountId: 'A1',
  name: 'Ayşe',
  avatar: 'a.png',
  isKids: false,
  maturityLevel: 110,
  language: 'tr',
}
const KID: ProfileRecord = { ...ADULT, guid: 'P-COCUK', name: 'Can', isKids: true, maturityLevel: 40 }
const passportOf = (profile: ProfileRecord | null): Passport => ({
  membershipStatus: 'CURRENT_MEMBER',
  account: { accountId: 'A1', planName: 'TV+ Temel', products: ['tvplus-temel'] },
  profile,
  esn: 'TVPWCH-MC-TEST',
  deviceId: 'cihaz',
  authURLVerified: true,
})

const access = (state: AccessDecision['state']): AccessDecision => ({
  state,
  reasonText: null,
  requiredProduct: null,
  requiredProductName: null,
  cta: null,
})

function fakeServices() {
  const calls = { allTitles: 0, airings: 0 }
  const byId = new Map(TITLES.map((t) => [t.videoId, t]))
  let titles = TITLES
  const services = {
    catalog: {
      allTitles: () => {
        calls.allTitles++
        return titles
      },
      allCollections: () => COLLECTIONS,
      people: () => peopleOf(titles),
      listChannels: () => CHANNELS,
      isVisibleTo: (p: ProfileRecord | null, id: number) => (p?.isKids ? (byId.get(id)?.kids ?? false) : true),
      getTitle: (id: number) => byId.get(id) ?? null,
    },
    epg: {
      airings: (channelId: number, from: Date, to: Date) => {
        calls.airings++
        return AIRINGS.filter((a) => a.channelId === channelId && a.endAt > from && a.startAt < to)
      },
    },
    entitlement: {
      accessForVideo: (_p: Passport, id: number) =>
        access(byId.get(id)?.availability.requiredProduct ? 'UPSELL' : 'PLAYABLE'),
    },
    progress: { recentSearches: (guid: string) => (guid === ADULT.guid ? ['kara sevda'] : []) },
  }
  return {
    // Sahte: yalnız aramanın kullandığı yöntemler var.
    services: services as unknown as Services,
    calls,
    setTitles: (t: typeof TITLES) => {
      titles = t
    },
  }
}

describe('runSearch (servis köprüsü)', () => {
  it('profil, görünürlük, yetki ve son aramalar servislerden gelir', () => {
    const { services } = fakeServices()
    const p = runSearch(services, passportOf(ADULT), 'masterchef', { pageCapabilities: FULL_CAPS }, NOW)
    expect(p.recentSearches).toEqual(['kara sevda'])
    expect(p.sections.map((s) => s.id)).toEqual(['canli', 'oneriler', 'galeri'])
    const kid = runSearch(services, passportOf(KID), '', { pageCapabilities: FULL_CAPS }, NOW)
    expect(kid.sections.flatMap((s) => s.entities.map((e) => e.displayString))).toEqual(['TRT Çocuk', 'Pepee'])
    const entitled = runSearch(
      services,
      passportOf(ADULT),
      'sintel',
      { pageCapabilities: FULL_CAPS, filters: { entitledOnly: true } },
      NOW,
    )
    expect(entitled.sections.find((s) => s.id === 'galeri')).toBeUndefined()
  })
  it('dizin önbelleklenir; katalog değişince ya da süre dolunca yeniden kurulur', () => {
    const { services, calls, setTitles } = fakeServices()
    const a = getSearchIndex(services, NOW)
    expect(getSearchIndex(services, new Date(NOW.getTime() + 1000))).toBe(a)
    expect(calls.airings).toBe(CHANNELS.length) // yayın akışı yalnız bir kez okundu
    const later = getSearchIndex(services, new Date(NOW.getTime() + REBUILD_MS + 1))
    expect(later).not.toBe(a)
    setTitles(TITLES.slice(1))
    const changed = getSearchIndex(services, new Date(NOW.getTime() + REBUILD_MS + 2))
    expect(changed).not.toBe(later)
    expect(changed.docs.some((d) => d.key === 'Video:80030001')).toBe(false)
  })
  it('requestId her çağrıda farklı', () => {
    const { services } = fakeServices()
    const a = runSearch(services, passportOf(ADULT), 'kara', { pageCapabilities: FULL_CAPS }, NOW)
    const b = runSearch(services, passportOf(ADULT), 'kara', { pageCapabilities: FULL_CAPS }, NOW)
    expect(a.requestId).not.toBe(b.requestId)
    expect(a.trackId).toBe(b.trackId)
  })
})

/** Arama alanlarını ve kimlik başvurularını seçen küçültülmüş sorgu (diğer tiplerin çözümleyicileri alan servislerinde). */
const TEST_QUERY = `query SearchTest($searchTerm: String!, $options: SearchOptionsInput!) {
  searchPage(searchTerm: $searchTerm, options: $options) {
    searchTerm requestId trackId expires isFallback recentSearches
    correction { mode originalTerm correctedTerm }
    sections {
      __typename id displayString expires
      ... on SearchGallerySection { totalCount }
      entities {
        unifiedEntityId kind displayString treatment fuzzy
        track { row pos rowId trackId entityId tctx }
        contextualArtwork { key type url width height }
        video { videoId }
        channel { channelId }
        airing { airingId title }
        person { personId name }
        collection { collectionId }
        genre { genreId }
      }
    }
  }
}`

interface GqlEntity {
  unifiedEntityId: string
  kind: string
  treatment: string
  contextualArtwork: { type: string; url: string } | null
  video: { videoId: number } | null
  channel: { channelId: number } | null
  airing: { airingId: string; title: string } | null
  person: { personId: number; name: string } | null
}
interface GqlSection {
  __typename: string
  id: string
  expires: string
  totalCount?: number
  entities: GqlEntity[]
}
interface GqlPage {
  searchPage: { expires: string; isFallback: boolean; correction: { mode: string } | null; sections: GqlSection[] }
}

describe('çözümleyici haritası (gerçek şema + motor)', () => {
  const registry: PersistedRegistry = {
    version: 1,
    operations: { 'test-arama': { name: 'SearchTest', type: 'query', document: TEST_QUERY } },
  }
  // Video arayüzünün tip çözümü alan servislerinindir; burada yalnız örnek veriye göre taklit edilir.
  const showIds = new Set(TITLES.filter((t) => t.type === 'SHOW').map((t) => t.videoId))
  const engine = createGraphQLEngine({
    typeDefs: SCHEMA,
    resolvers: {
      ...searchResolvers,
      Video: { __resolveType: (p) => (showIds.has((p as { videoId: number }).videoId) ? 'Show' : 'Movie') },
    },
    persisted: registry,
  })
  const config = loadConfig({
    dataDir: mkdtempSync(join(tmpdir(), 'tvplus-arama-')),
    secret: 'test-secret',
    isTest: true,
    offline: true,
  })

  async function exec(term: string, options: unknown, profile: ProfileRecord | null = ADULT) {
    const { services } = fakeServices()
    const passport = passportOf(profile)
    const r = await engine.handle({
      body: {
        operationName: 'SearchTest',
        variables: { searchTerm: term, options },
        extensions: { persistedQuery: { id: 'test-arama', version: 1 } },
      },
      passport,
      makeContext: () => ({
        req: {} as never,
        passport,
        trace: { traceId: 't', spanId: 's', parentSpanId: null },
        services,
        config,
        cache: new Map(),
      }),
    })
    return r
  }

  it('tüm bölüm tipleri __resolveType ile çözülür; varlıklar kimlik başvurusu taşır', async () => {
    // Gerçek saat kullanılır (yayınların penceresi NOW'a göre); bu yüzden yalnız katalog varlıkları denetlenir.
    const r = await exec('yerli', { pageCapabilities: FULL_CAPS })
    expect(r.statusCode).toBe(200)
    expect(r.body.errors).toBeUndefined()
    const page = (r.body.data as GqlPage).searchPage
    expect(page.sections.map((s) => s.__typename)).toEqual(['SearchListSection', 'SearchGallerySection'])
    const gallery = page.sections[1]
    expect(gallery?.totalCount).toBe(3)
    const first = gallery?.entities[0]
    expect(first?.video).toEqual({ videoId: 80030001 })
    expect(first?.channel).toBeNull()
    // "yerli" türden eşleşti; galeri yine 2:3 afiş (BOXART) alır, imzalı adres
    expect(first?.contextualArtwork?.type).toBe('BOXART')
    expect(first?.contextualArtwork?.url).toMatch(/^\/img\/v1\/boxart\/\d+x\d+\/Video%3A80030001\.webp\?r=/)
    expect(gallery?.entities.every((e) => e.contextualArtwork?.type === 'BOXART')).toBe(true)
    // Öneri listesinde bağlamsal STORY_ART kalır
    const suggestion = page.sections[0]?.entities.find((e) => e.treatment === 'standardSuggestion')
    expect(suggestion?.contextualArtwork?.type).toBe('STORY_ART')
    const list = page.sections[0]
    expect(list?.entities.find((e) => e.treatment === 'standardDestination')).toBeTruthy()
    expect(Date.parse(page.expires)).toBeGreaterThan(Date.now())
  })

  it('canlı bölüm: SearchLiveSection, kanal başvurusu ve 60 sn ömür', async () => {
    const r = await exec('kanal d', { pageCapabilities: FULL_CAPS })
    const page = (r.body.data as GqlPage).searchPage
    const live = page.sections.find((s) => s.__typename === 'SearchLiveSection')
    expect(live?.entities[0]?.channel).toEqual({ channelId: 1 })
    expect(live?.entities[0]?.contextualArtwork).toBeNull()
    const ttl = Date.parse(live?.expires ?? '') - Date.now()
    expect(ttl).toBeGreaterThan(50_000)
    expect(ttl).toBeLessThanOrEqual(60_000)
    expect(page.expires).toBe(live?.expires)
  })

  it('kişi başvurusu { personId, name }', async () => {
    const r = await exec('haluk', { pageCapabilities: FULL_CAPS })
    const page = (r.body.data as GqlPage).searchPage
    const person = page.sections.flatMap((s) => s.entities).find((e) => e.kind === 'PERSON')
    expect(person?.person?.name).toBe('Haluk Bilginer')
  })

  it('eski istemci: yalnız galeri, yalnız VIDEO', async () => {
    const r = await exec('sahsiyet', { pageCapabilities: OLD_CAPS })
    const page = (r.body.data as GqlPage).searchPage
    expect(page.sections.map((s) => s.__typename)).toEqual(['SearchGallerySection'])
    expect(page.sections[0]?.entities.every((e) => e.kind === 'VIDEO' && e.treatment === 'standardBoxshot')).toBe(true)
  })

  it('exactTerm $options değişkeniyle taşınır: düzeltme yok, yedek sayfa', async () => {
    const corrected = (await exec('sahsyiet', { pageCapabilities: FULL_CAPS })).body.data as GqlPage
    expect(corrected.searchPage.correction?.mode).toBe('CORRECTED')
    const r = await exec('sahsyiet', { pageCapabilities: FULL_CAPS, exactTerm: true })
    expect(r.body.errors).toBeUndefined()
    const page = (r.body.data as GqlPage).searchPage
    expect(page.correction).toBeNull()
    expect(page.isFallback).toBe(true)
  })

  it('profil yoksa motor PROFILE_REQUIRED döner', async () => {
    const r = await exec('kara', { pageCapabilities: FULL_CAPS }, null)
    expect(r.statusCode).toBe(403)
    expect(r.body.errors?.[0]?.extensions.code).toBe('PROFILE_REQUIRED')
  })

  it('kayıtlı SearchPageQueryResults belgesi şemaya göre geçerli', () => {
    const persisted = JSON.parse(
      readFileSync(join(ROOT, 'shared', 'graphql', 'persisted.server.json'), 'utf8'),
    ) as PersistedRegistry
    const op = Object.values(persisted.operations).find((o) => o.name === 'SearchPageQueryResults')
    expect(op).toBeTruthy()
    expect(validate(buildSchema(SCHEMA), parse(op?.document ?? ''))).toEqual([])
  })
})
