/**
 * Keşif × tahmin modeli: `matchScore` (GraphQL + Falcor), modelden "‹Ad› için En İyi Seçimler" (ya da kurallar),
 * satır içi model sıralaması, iskelet / hata durumunda değişmeyen çıktı, çocuk görünürlüğü, sürümle tazelenme.
 * Model sahtesi: fixtures/intelligence.ts `fakePredictions`.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { BootContext, JsonGraph } from '../../shared/types'
import { evaluatePaths } from '../src/falcor/engine'
import { createGraphQLEngine, type GraphQLEngine, type PersistedRegistry } from '../src/graphql/engine'
import { resolvers } from '../src/graphql/resolvers/index'
import { microgenreTitleFields } from '../src/graphql/resolvers/microgenre'
import type { PredictionService } from '../src/kernel/intelligence'
import type { FalcorRouteContext, Passport } from '../src/kernel/context'
import { intelligenceStamp, orderByScores } from '../src/services/discovery/intel'
import { buildLolomo, MIN_ROW_ITEMS, type Lolomo } from '../src/services/discovery/lolomo'
import {
  ADULT,
  createAlanApp,
  fakeRequest,
  FIXTURE_CONTENT_DIR,
  gqlContext,
  ID,
  KID,
  passport,
  TEST_NOW,
} from './fixtures/alan'
import { fakePredictions, installIntelligence, type FakePredictions } from './fixtures/intelligence'
import { createTestApp } from './helpers'

const FLAGS = { webp: 'true', isTop10Supported: 'true', materialize: 'true', falcor_server: '0.1.0' }
const SCHEMA = readFileSync(join(import.meta.dirname, '..', '..', 'shared', 'graphql', 'schema.graphql'), 'utf8')
const DOC = `query Match($ids: [Int!]!) { videos(videoIds: $ids) {
  videoId ... on Movie { matchScore } ... on Show { matchScore } } }`
const REGISTRY: PersistedRegistry = {
  version: 1,
  operations: { 'test-Match': { name: 'Match', type: 'query', document: DOC } } as PersistedRegistry['operations'],
}

/* eslint-disable @typescript-eslint/no-explicit-any -- test gövdelerinde derin JSON erişimi */
type Data = Record<string, any>

const byCtx = (l: Lolomo) => Object.fromEntries(l.lists.map((x) => [x.context, x]))
/** Görünürlük ve kimlik dışında karşılaştırılabilir biçim */
const shape = (l: Lolomo) =>
  l.lists.map(({ listId, context, displayName, videoIds, source }) => ({
    listId,
    context,
    displayName,
    videoIds,
    source,
  }))

/** Yetişkin için puan tablosu: Spring > Cosmos > BBB > Tears > Anadolu > Metropolis > Caminandes (Sintel, Nosferatu yok) */
const ADULT_SCORES: Record<number, number> = {
  [ID.spring]: 0.91,
  [ID.cosmos]: 0.8,
  [ID.bbb]: 0.7,
  [ID.tears]: 0.6,
  [ID.anadolu]: 0.5,
  [ID.metropolis]: 0.4,
  [ID.caminandes]: 0.3,
}

describe('tahmin modeli × keşif', () => {
  let app: FastifyInstance
  let pred: FakePredictions
  beforeEach(async () => {
    app = await createAlanApp()
    pred = installIntelligence(app).predictions
    pred.setScores(ADULT.guid, ADULT_SCORES)
  })
  afterEach(async () => {
    await app.close()
  })
  const home = (profile = ADULT) => buildLolomo(app.services, profile, { top10Supported: true, now: TEST_NOW })

  it('iskelet, hazır olmayan ya da fırlatan model: çıktı birebir aynı; gems kurallardan', () => {
    app.services.progress.setBookmark(ADULT.guid, ID.sintel, 300)
    const base = shape(home())
    expect(byCtx(home()).gems).toMatchObject({ source: 'rules' })
    // fırlatan model
    const boom = (): never => {
      throw new Error('çöktü')
    }
    const throwing: PredictionService = {
      ready: () => true,
      info: boom,
      match: boom,
      scores: boom,
      topPicks: boom,
      explain: boom,
      revision: () => 9,
    }
    app.services.predictions = throwing
    expect(shape(home())).toEqual(base)
    // ready() bile fırlatsa
    app.services.predictions = { ...throwing, ready: boom }
    expect(shape(home())).toEqual(base)
    // hazır ama bu profil hakkında hiçbir şey bilmiyor (puan yok, seçim yok)
    const empty = fakePredictions(true)
    app.services.predictions = empty
    expect(shape(home())).toEqual(base)
  })

  it('"En İyi Seçimler" modelden: sıra modelin, bitirilenler ve beğenilmeyenler hariç, source=model', () => {
    pred.setReady(true)
    pred.bump()
    app.services.progress.setBookmark(ADULT.guid, ID.cosmos, 725) // bitirildi (730 sn)
    app.services.progress.setThumbRating(ADULT.guid, ID.tears, 'THUMBS_DOWN')
    const gems = byCtx(home()).gems!
    expect(gems).toMatchObject({ source: 'model', displayName: 'Deniz için En İyi Seçimler' })
    expect(gems.videoIds).toEqual([ID.spring, ID.bbb, ID.anadolu, ID.metropolis, ID.caminandes])
  })

  it('model yeterince görünür seçim vermezse kurallar (çocuk profili, az puan)', () => {
    pred.setReady(true)
    // çocuk: modelin önerdiği iki başlık da 13+ → görünür seçim yok → kurallar
    pred.setScores(KID.guid, { [ID.sintel]: 0.9, [ID.tears]: 0.8, [ID.bbb]: 0.7 })
    app.services.progress.setBookmark(KID.guid, ID.bbb, 100)
    const kid = byCtx(home(KID)).gems
    if (kid) expect(kid.source).toBe('rules')
    for (const l of home(KID).lists)
      for (const v of l.videoIds) expect(app.services.catalog.isVisibleTo(KID, v)).toBe(true)
    // yetişkin: yalnız iki puan → en az öğe kuralı → kurallar
    pred.setScores(ADULT.guid, { [ID.spring]: 0.9, [ID.bbb]: 0.8 })
    app.services.progress.setBookmark(ADULT.guid, ID.sintel, 300)
    expect(byCtx(home()).gems!.source).toBe('rules')
    expect(byCtx(home()).gems!.videoIds.length).toBeGreaterThanOrEqual(MIN_ROW_ITEMS)
  })

  it('satır içi sıra: tür, mikro tür, yeni gelenler, topluluk modelle; diğerleri kendi sırasıyla; tek scores çağrısı', () => {
    const { audience, predictions: p } = installIntelligence(app)
    p.setScores(ADULT.guid, ADULT_SCORES)
    audience.assign(ADULT.guid, 'tc_01')
    audience.setTop('tc_01', [ID.caminandes, ID.metropolis, ID.bbb, ID.spring])
    const rules = byCtx(home()) // model hazır değil
    expect(p.calls.scores).toBe(0)
    p.setReady(true)
    p.bump()
    const fresh = home()
    expect(p.calls.scores).toBe(1) // lolomo başına tek çağrı
    const f = byCtx(fresh)
    // Animasyon: Sintel, BBB, Caminandes, Spring (popülerlik) → puanlılar önce (Spring, BBB, Caminandes), Sintel sonda
    expect(rules.genre!.videoIds).toEqual([ID.sintel, ID.bbb, ID.caminandes, ID.spring])
    expect(f.genre!.videoIds).toEqual([ID.spring, ID.bbb, ID.caminandes, ID.sintel])
    expect(f.tasteCommunity!.videoIds).toEqual([ID.spring, ID.bbb, ID.metropolis, ID.caminandes])
    expect(f.newReleases!.videoIds).toEqual(
      orderByScores(rules.newReleases!.videoIds, new Map(Object.entries(ADULT_SCORES).map(([k, v]) => [Number(k), v]))),
    )
    const mgRows = fresh.lists.filter((x) => x.context === 'microgenre')
    expect(mgRows.length).toBeGreaterThan(0)
    for (const r of mgRows) {
      const scored = r.videoIds.filter((v) => ADULT_SCORES[v] !== undefined)
      expect(scored).toEqual([...scored].sort((a, b) => ADULT_SCORES[b]! - ADULT_SCORES[a]!))
    }
    // kendi sırasını koruyanlar
    for (const ctx of ['top10', 'collection', 'curated', 'billboard'] as const)
      expect(f[ctx]!.videoIds, ctx).toEqual(rules[ctx]!.videoIds)
  })

  it('orderByScores: puanlılar puana göre (eşitlikte eski sıra), puansızlar eski sırayla sonda', () => {
    expect(
      orderByScores(
        [1, 2, 3, 4, 5],
        new Map([
          [4, 0.5],
          [2, 0.9],
          [5, 0.5],
        ]),
      ),
    ).toEqual([2, 4, 5, 1, 3])
    expect(orderByScores([3, 1, 2], null)).toEqual([3, 1, 2])
    expect(orderByScores([3, 1, 2], new Map())).toEqual([3, 1, 2])
  })

  it('sürüm: predictions.revision() ve ready() damgaya girer; bump sonrası yeni puanlar', () => {
    const s0 = intelligenceStamp(app.services)
    pred.setReady(true)
    const s1 = intelligenceStamp(app.services)
    expect(s1).not.toBe(s0)
    pred.bump()
    expect(intelligenceStamp(app.services)).not.toBe(s1)
    expect(byCtx(home()).genre!.videoIds[0]).toBe(ID.spring)
    pred.setScores(ADULT.guid, { ...ADULT_SCORES, [ID.sintel]: 0.99 })
    pred.bump()
    expect(byCtx(home()).genre!.videoIds[0]).toBe(ID.sintel)
  })

  describe('matchScore', () => {
    let engine: GraphQLEngine
    beforeEach(() => {
      engine = createGraphQLEngine({ typeDefs: SCHEMA, resolvers, persisted: REGISTRY })
    })
    const gql = async (ids: number[], pp: Passport = passport(ADULT)) => {
      const r = await engine.handle({
        body: {
          operationName: 'Match',
          variables: { ids },
          extensions: { persistedQuery: { id: 'test-Match', version: 1 } },
        },
        passport: pp,
        makeContext: () => gqlContext(app, pp),
      })
      expect(r.body.errors, JSON.stringify(r.body.errors)).toBeUndefined()
      return (r.body.data as Data).videos as Data[]
    }
    const falcor = async (ids: number[], pp: Passport = passport(ADULT)) => {
      const ctx: FalcorRouteContext = {
        req: fakeRequest(),
        passport: pp,
        services: app.services,
        config: app.config,
        flags: FLAGS,
      }
      const g = (await evaluatePaths(ctx, [['videos', ids, 'matchScore']])).jsonGraph
      return ids.map((id) => (g.videos as Record<string, Record<string, unknown>>)[String(id)]!.matchScore)
    }

    it('model hazır değilken null / boş atom', async () => {
      expect((await gql([ID.spring, ID.caminandes])).map((v) => v.matchScore)).toEqual([null, null])
      expect(await falcor([ID.spring])).toEqual([{ $type: 'atom' }])
    })

    it('GraphQL ve pathEvaluator: 0–100 tamsayı; puanı olmayan null; çocuk görünürlüğü; profil yoksa null', async () => {
      pred.setReady(true)
      pred.bump()
      expect((await gql([ID.spring, ID.caminandes, ID.sintel])).map((v) => [v.videoId, v.matchScore])).toEqual([
        [ID.spring, 91],
        [ID.caminandes, 30],
        [ID.sintel, null],
      ])
      const f = await falcor([ID.spring, ID.caminandes, ID.sintel, ID.cam_s1e1])
      expect(f[0]).toMatchObject({ $type: 'atom', value: 91 })
      expect(f[1]).toMatchObject({ $type: 'atom', value: 30 })
      expect(f[2]).toEqual({ $type: 'atom' })
      expect(f[3]).toEqual({ $type: 'atom' }) // bölüm
      // çocuk: görünmeyen başlık null video; görünenin kendi puanı (yok → null)
      pred.setScores(KID.guid, { [ID.bbb]: 0.555, [ID.sintel]: 0.9 })
      const kid = await gql([ID.bbb, ID.sintel], passport(KID))
      expect(kid[0]).toEqual({ videoId: ID.bbb, matchScore: 56 })
      expect(kid[1]).toBeNull()
      const kf = await falcor([ID.sintel], passport(KID))
      expect(kf[0]).toEqual({ $type: 'atom' }) // görünmeyen video: materialize boş atom
      // profil yoksa (çözümleyici düzeyinde)
      const ctx = gqlContext(app, passport(null))
      expect(microgenreTitleFields.matchScore!({ videoId: ID.spring }, {}, ctx)).toBeNull()
    })
  })
})

describe('açılış tohumu boyutu (matchScore tohumda değil)', () => {
  let app: FastifyInstance
  afterEach(async () => {
    await app.close()
  })
  it('model hazırken de tohum aynı yaprakları taşır', async () => {
    app = await createTestApp({ contentDir: FIXTURE_CONTENT_DIR })
    const { predictions } = installIntelligence(app)
    const login = await app.inject({ method: 'POST', url: '/api/login' })
    const cookies = Object.fromEntries(login.cookies.map((c) => [c.name, c.value]))
    const guid = login.json<BootContext>().profiles.find((p) => !p.isKids)!.guid
    const sw = await app.inject({ method: 'POST', url: '/api/profiles/switch', cookies, payload: { guid } })
    for (const c of sw.cookies) cookies[c.name] = c.value
    predictions.setReady(true)
    predictions.setScores(guid, ADULT_SCORES)
    predictions.bump()
    const g = (await app.inject({ url: '/api/boot', cookies })).json<BootContext>().falcorCache as JsonGraph
    const videos = Object.values(g.videos as Record<string, Record<string, unknown>>)
    expect(videos.length).toBeGreaterThan(0)
    for (const v of videos) expect(v.matchScore).toBeUndefined()
    const gems = Object.values(g.lists as Record<string, { summary?: { value?: Record<string, unknown> } }>).find(
      (l) => l.summary?.value?.context === 'gems',
    )
    if (gems) expect(gems.summary!.value!.source).toBe('model')
  })
})
