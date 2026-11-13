/**
 * Keşif bütünleşmesi — görünmeyen katmanın görünen yüzü (docs/MIMARI.md §10.1, docs/ICERIK_ZEKASI.md §9):
 * harman benzerlik, gerekçeler, `microgenres`, `Query.microgenre`, mikro tür ve zevk topluluğu satırları,
 * Falcor özet alanları, açılış tohumu ve sürüm (revision) değişince önbelleğin tazelenmesi.
 * İçerik zekâsı servisleri bellek içi sahtelerle (fixtures/intelligence.ts) kurulur.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { BootContext, FalcorPath, JsonGraph } from '../../shared/types'
import { evaluatePaths } from '../src/falcor/engine'
import { createGraphQLEngine, type GraphQLEngine, type PersistedRegistry } from '../src/graphql/engine'
import { resolvers } from '../src/graphql/resolvers/index'
import type { FalcorRouteContext, Passport } from '../src/kernel/context'
import { BLEND_WEIGHTS, blendedSimilars, blendScore, kunyeValue } from '../src/services/discovery/blend'
import { buildLolomo, MIN_ROW_ITEMS, type Lolomo, type LolomoCategory } from '../src/services/discovery/lolomo'
import { MICROGENRE_MAX_OVERLAP, MICROGENRE_ROW_MIN } from '../src/services/discovery/microgenreRows'
import { similarity, similarTitles } from '../src/services/discovery/similarity'
import { ADULT, createAlanApp, fakeRequest, FIXTURE_CONTENT_DIR, gqlContext, ID, KID, passport, TEEN } from './fixtures/alan'
import { TEST_NOW } from './fixtures/alan'
import { FIXTURE_MICROGENRES, installIntelligence, mg } from './fixtures/intelligence'
import { createTestApp } from './helpers'

const FLAGS = { webp: 'true', isTop10Supported: 'true', materialize: 'true', falcor_server: '0.1.0' }
const ROOT = join(import.meta.dirname, '..', '..')
const SCHEMA = readFileSync(join(ROOT, 'shared', 'graphql', 'schema.graphql'), 'utf8')

/* Geçici belgeler: kalıcı kayıt defterine girmez, motor bu testte kendi defteriyle kurulur */
const DOCS = {
  Similars: `query Similars($videoId: Int!, $first: Int) {
    video(videoId: $videoId) {
      ... on Movie { similars(first: $first) { videoId } similarsWithReason(first: $first) {
        video { videoId unifiedEntityId } score reason signals { name value weight } } }
      ... on Show { similars(first: $first) { videoId } similarsWithReason(first: $first) {
        video { videoId unifiedEntityId } score reason signals { name value weight } } }
    }
  }`,
  TitleMicrogenres: `query TitleMicrogenres($videoId: Int!, $first: Int) {
    video(videoId: $videoId) {
      ... on Movie { microgenres(first: $first) { id unifiedEntityId name layer size } }
      ... on Show { microgenres(first: $first) { id unifiedEntityId name layer size } }
    }
  }`,
  MicrogenrePage: `query MicrogenrePage($id: ID!, $first: Int) {
    microgenre(id: $id) { id unifiedEntityId name layer size videos(first: $first) { videoId title } }
  }`,
}
const REGISTRY: PersistedRegistry = {
  version: 1,
  operations: Object.fromEntries(
    Object.entries(DOCS).map(([name, document]) => [`test-${name}`, { name, type: 'query', document }]),
  ) as PersistedRegistry['operations'],
}

/* eslint-disable @typescript-eslint/no-explicit-any -- test gövdelerinde derin JSON erişimi */
type Data = Record<string, any>

const byCtx = (l: Lolomo) => Object.fromEntries(l.lists.map((x) => [x.context, x]))
const contexts = (l: Lolomo) => l.lists.map((x) => x.context)
const jaccard = (a: number[], b: number[]) => {
  const sb = new Set(b)
  const inter = a.filter((x) => sb.has(x)).length
  return inter / (a.length + b.length - inter)
}

describe('harman benzerlik', () => {
  it('ağırlıklar tek yerde, toplamı 1; eksik işaretin ağırlığı orantılı dağıtılır', () => {
    expect(BLEND_WEIGHTS.kunye + BLEND_WEIGHTS.mikrotur + BLEND_WEIGHTS.gomme).toBeCloseTo(1)
    const all = blendScore({ kunye: 0.4, mikrotur: 0.5, gomme: 0.9 })
    expect(all.score).toBeCloseTo(0.5 * 0.4 + 0.3 * 0.5 + 0.2 * 0.9)
    expect(all.signals.map((s) => [s.name, s.weight])).toEqual([
      ['kunye', 0.5],
      ['mikrotur', 0.3],
      ['gomme', 0.2],
    ])
    // gömme yok → 0.5/0.8 ve 0.3/0.8
    const noEmb = blendScore({ kunye: 0.4, mikrotur: 0.5, gomme: null })
    expect(noEmb.signals.map((s) => s.weight)).toEqual([0.625, 0.375, 0])
    expect(noEmb.score).toBeCloseTo(0.625 * 0.4 + 0.375 * 0.5)
    // yalnız künye → puan künyenin kendisi
    expect(blendScore({ kunye: 0.37 }).score).toBeCloseTo(0.37)
    expect(blendScore({ kunye: 0.37 }).signals.map((s) => s.weight)).toEqual([1, 0, 0])
    // hiç işaret yok → 0; değerler 0–1'e kırpılır
    expect(blendScore({}).score).toBe(0)
    expect(blendScore({ kunye: 1.4, gomme: -0.2 }).signals.map((s) => s.value)).toEqual([1, 0, 0])
    expect(kunyeValue(1.15)).toBe(1)
  })

  describe('servisler', () => {
    let app: FastifyInstance
    beforeEach(async () => {
      app = await createAlanApp()
    })
    afterEach(async () => {
      await app.close()
    })

    it('yeni servisler boşken sıralama bugünküyle aynı (tüm başlıklar, yetişkin ve çocuk)', () => {
      const cat = app.services.catalog
      for (const profile of [ADULT, TEEN, KID]) {
        const vis = (id: number) => cat.isVisibleTo(profile, id)
        for (const t of cat.allTitles()) {
          const blended = blendedSimilars(app.services, t.videoId, vis)
          expect(
            blended.map((x) => x.titleId),
            `${profile.name} ${t.title}`,
          ).toEqual(similarTitles(cat, t.videoId, (c) => vis(c.videoId)).map((c) => c.videoId))
          for (const x of blended) {
            expect(x.reason).toBeNull()
            expect(x.signals.map((s) => [s.name, s.weight])).toEqual([
              ['kunye', 1],
              ['mikrotur', 0],
              ['gomme', 0],
            ])
            expect(x.score).toBeCloseTo(kunyeValue(similarity(cat, t, cat.getTitle(x.titleId)!)))
          }
        }
      }
    })

    it('üç işaret: puan, gerekçe (en dar ortak mikro tür), çift başına ağırlık dağıtımı, kararlılık', () => {
      installIntelligence(app)
      const list = blendedSimilars(app.services, ID.sintel)
      expect(list.map((x) => x.titleId)).not.toContain(ID.sintel)
      // Spring: künye, iki dar ortak mikro tür ve en yakın vektör → ilk sırada; gerekçe en dar ortak (3 yuva)
      expect(list[0]).toMatchObject({ titleId: ID.spring, reason: 'Ortak: Ejderhalı Masalsı Animasyonlar' })
      for (const x of list) {
        expect(x.score).toBeGreaterThanOrEqual(0)
        expect(x.score).toBeLessThanOrEqual(1)
        const total = x.signals.reduce((s, g) => s + g.weight, 0)
        expect(total).toBeCloseTo(1)
        expect(x.score).toBeCloseTo(x.signals.reduce((s, g) => s + g.weight * g.value, 0))
      }
      // azalan puan
      for (let i = 1; i < list.length; i++) expect(list[i - 1]!.score).toBeGreaterThanOrEqual(list[i]!.score)
      // Anadolu'nun vektörü yok → o çift için gömme ağırlığı 0, kalan 0.5/0.8 + 0.3/0.8
      const anadolu = blendedSimilars(app.services, ID.bbb).find((x) => x.titleId === ID.anadolu)!
      expect(anadolu.signals.map((s) => [s.name, s.weight])).toEqual([
        ['kunye', 0.625],
        ['mikrotur', 0.375],
        ['gomme', 0],
      ])
      expect(anadolu.reason).toBe('Ortak: Ailece İzlenecek Kısa Yapımlar')
      // ortak mikro türü olmayan çiftte gerekçe yok, mikro tür işareti 0 ama ağırlığı var
      const nos = list.find((x) => x.titleId === ID.nosferatu)
      if (nos) {
        expect(nos.reason).toBeNull()
        expect(nos.signals.find((s) => s.name === 'mikrotur')).toMatchObject({ value: 0, weight: 0.3 })
      }
      // kararlı
      expect(blendedSimilars(app.services, ID.sintel)).toEqual(list)
    })

    it('gömme hazır değilse ağırlığı dağıtılır; servis fırlatırsa keşif düşmez', () => {
      const { embeddings, microgenres } = installIntelligence(app)
      embeddings.setReady(false)
      const list = blendedSimilars(app.services, ID.sintel)
      for (const x of list) expect(x.signals.find((s) => s.name === 'gomme')).toEqual({ name: 'gomme', value: 0, weight: 0 })
      microgenres.similarTitles = () => {
        throw new Error('çöktü')
      }
      microgenres.bump()
      embeddings.setReady(true)
      embeddings.bump()
      expect(blendedSimilars(app.services, ID.sintel).length).toBeGreaterThan(0)
      app.services.audience.ofProfile = () => {
        throw new Error('çöktü')
      }
      expect(contexts(buildLolomo(app.services, ADULT, { top10Supported: true, now: TEST_NOW }))).not.toContain(
        'tasteCommunity',
      )
    })
  })
})

describe('GraphQL: similarsWithReason, microgenres, Query.microgenre', () => {
  let app: FastifyInstance
  let engine: GraphQLEngine
  beforeEach(async () => {
    app = await createAlanApp()
    engine = createGraphQLEngine({ typeDefs: SCHEMA, resolvers, persisted: REGISTRY })
  })
  afterEach(async () => {
    await app.close()
  })
  async function ok(name: keyof typeof DOCS, variables: Record<string, unknown>, pp: Passport = passport(ADULT)) {
    const r = await engine.handle({
      body: { operationName: name, variables, extensions: { persistedQuery: { id: `test-${name}`, version: 1 } } },
      passport: pp,
      makeContext: () => gqlContext(app, pp),
    })
    expect(r.body.errors, JSON.stringify(r.body.errors)).toBeUndefined()
    return r.body.data as Data
  }

  it('servisler boşken: similars bugünküyle aynı, gerekçe yok, mikro tür yok', async () => {
    const d = await ok('Similars', { videoId: ID.sintel, first: 48 })
    const expected = similarTitles(app.services.catalog, ID.sintel, (t) =>
      app.services.catalog.isVisibleTo(ADULT, t.videoId),
    ).map((t) => t.videoId)
    expect(d.video.similars.map((v: Data) => v.videoId)).toEqual(expected)
    expect(d.video.similarsWithReason.map((s: Data) => s.video.videoId)).toEqual(expected)
    expect(d.video.similarsWithReason.every((s: Data) => s.reason === null)).toBe(true)
    expect((await ok('TitleMicrogenres', { videoId: ID.sintel })).video.microgenres).toEqual([])
    expect((await ok('MicrogenrePage', { id: 'mg_b_buyu' })).microgenre).toBeNull()
  })

  it('similarsWithReason: video başvurusu, puan, işaretler, gerekçe; similars aynı sıra', async () => {
    installIntelligence(app)
    const d = await ok('Similars', { videoId: ID.sintel, first: 3 })
    expect(d.video.similars).toHaveLength(3)
    const first = d.video.similarsWithReason[0]
    expect(first).toMatchObject({
      video: { videoId: ID.spring, unifiedEntityId: `Video:${ID.spring}` },
      reason: 'Ortak: Ejderhalı Masalsı Animasyonlar',
    })
    expect(first.signals.map((s: Data) => s.name)).toEqual(['kunye', 'mikrotur', 'gomme'])
    expect(first.score).toBeGreaterThan(0)
    expect(first.score).toBeLessThanOrEqual(1)
    expect(d.video.similarsWithReason.map((s: Data) => s.video.videoId)).toEqual(
      d.video.similars.map((v: Data) => v.videoId),
    )
    // çocuk profili 13+ başlıkları görmez
    const kid = await ok('Similars', { videoId: ID.bbb, first: 48 }, passport(KID))
    for (const s of kid.video.similarsWithReason)
      expect(app.services.catalog.isVisibleTo(KID, s.video.videoId)).toBe(true)
  })

  it('microgenres: önce görünen katman, her katmanda en dar olan önce; first', async () => {
    installIntelligence(app)
    const d = await ok('TitleMicrogenres', { videoId: ID.sintel, first: 10 })
    expect(d.video.microgenres.map((m: Data) => [m.id, m.layer])).toEqual([
      ['mg_b_buyu', 'VISIBLE'],
      ['mg_a_anim', 'VISIBLE'],
      ['mg_h1_ejder', 'HIDDEN'],
      ['mg_h2_acik', 'HIDDEN'],
      ['mg_h4_gotik', 'HIDDEN'],
    ])
    expect(d.video.microgenres[0]).toMatchObject({
      unifiedEntityId: 'Microgenre:mg_b_buyu',
      name: 'Büyülü Dünyalarda Geçen Filmler',
      size: 4,
    })
    expect((await ok('TitleMicrogenres', { videoId: ID.sintel })).video.microgenres).toHaveLength(4) // varsayılan 4
  })

  it('Query.microgenre: görünürlük (çocuk profili), bilinmeyen kimlik null, videos popülerlik sırası', async () => {
    installIntelligence(app)
    const adult = (await ok('MicrogenrePage', { id: 'mg_d_klasik' })).microgenre
    expect(adult).toMatchObject({ id: 'mg_d_klasik', unifiedEntityId: 'Microgenre:mg_d_klasik', layer: 'VISIBLE' })
    expect(adult.videos.map((v: Data) => v.videoId)).toEqual([ID.tears, ID.cosmos, ID.nosferatu, ID.metropolis])
    expect(adult.size).toBe(4)
    expect((await ok('MicrogenrePage', { id: 'mg_d_klasik', first: 2 })).microgenre.videos).toHaveLength(2)
    // çocuk: yalnız Metropolis görünür
    const kid = (await ok('MicrogenrePage', { id: 'mg_d_klasik' }, passport(KID))).microgenre
    expect(kid.videos.map((v: Data) => v.videoId)).toEqual([ID.metropolis])
    expect(kid.size).toBe(1)
    // çocuk hiçbir başlığını göremiyor → null
    expect((await ok('MicrogenrePage', { id: 'mg_h4_gotik' }, passport(KID))).microgenre).toBeNull()
    expect((await ok('MicrogenrePage', { id: 'mg_h4_gotik' })).microgenre.layer).toBe('HIDDEN')
    expect((await ok('MicrogenrePage', { id: 'mg_yok' })).microgenre).toBeNull()
  })
})

describe('ana sayfa satırları', () => {
  let app: FastifyInstance
  beforeEach(async () => {
    app = await createAlanApp()
  })
  afterEach(async () => {
    await app.close()
  })
  const home = (profile = ADULT, category: LolomoCategory = 'home') =>
    buildLolomo(app.services, profile, { top10Supported: true, now: TEST_NOW, category })

  it('servisler boşken yeni satır yok; satır adları sözlükteki yazımla', () => {
    app.services.progress.setBookmark(ADULT.guid, ID.sintel, 300)
    const l = home()
    expect(contexts(l)).not.toContain('microgenre')
    expect(contexts(l)).not.toContain('tasteCommunity')
    const c = byCtx(l)
    expect(c.becauseYouWatched).toMatchObject({ displayName: 'Sintel adlı içeriği izlediğin için' })
    expect(c.becauseYouWatched!.reason).toBeUndefined()
    expect(c.continueWatching!.displayName).toBe('İzlemeye Devam Et')
    expect(c.top10!.displayName).toBe("Türkiye'de Bugünün Top 10 Listesi")
    expect(c.newReleases!.displayName).toBe('Yeni Gelenler')
  })

  it('mikro tür satırları: seçim kuralları ve yer (geçmişsiz profil: en büyükler)', () => {
    installIntelligence(app)
    const l = home()
    expect(contexts(l)).toEqual([
      'billboard',
      'top10',
      'newReleases',
      'genre',
      'microgenre',
      'microgenre',
      'microgenre',
      'collection',
      'bridge',
      'curated',
    ])
    const rows = l.lists.filter((x) => x.context === 'microgenre')
    // anim: "Animasyon" tür satırıyla aynı küme → yok; komedi: Büyülü ile fazla örtüşüyor → yok
    expect(rows.map((r) => r.microgenreId)).toEqual(['mg_b_buyu', 'mg_d_klasik', 'mg_e_aile'])
    expect(rows.map((r) => r.displayName)).toEqual([
      'Büyülü Dünyalarda Geçen Filmler',
      'Geleceği Düşleyen Klasikler',
      'Ailece İzlenecek Kısa Yapımlar',
    ])
    const genre = byCtx(l).genre!
    for (const r of rows) {
      expect(r.videoIds.length).toBeGreaterThanOrEqual(MICROGENRE_ROW_MIN)
      expect(new Set(r.videoIds)).not.toEqual(new Set(genre.videoIds))
      const def = FIXTURE_MICROGENRES.find((m) => m.id === r.microgenreId)!
      expect(def.layer).toBe('VISIBLE')
    }
    for (const a of rows) for (const b of rows) if (a !== b) expect(jaccard(a.videoIds, b.videoIds)).toBeLessThanOrEqual(MICROGENRE_MAX_OVERLAP)
    expect(new Set(l.lists.map((x) => x.listId)).size).toBe(l.lists.length)
  })

  it('geçmişi olan profil: uyumlu mikro tür öne geçer; izlenenler satırın sonunda', () => {
    installIntelligence(app)
    app.services.progress.setBookmark(ADULT.guid, ID.nosferatu, 600)
    app.services.progress.setThumbRating(ADULT.guid, ID.metropolis, 'THUMBS_UP')
    const l = home()
    const rows = l.lists.filter((x) => x.context === 'microgenre')
    expect(rows[0]!.microgenreId).toBe('mg_d_klasik')
    expect(rows[0]!.videoIds.at(-1)).toBe(ID.nosferatu)
    // kişisel satırdan ("En İyi Seçimler") hemen sonra, editoryal satırlardan önce
    const i = contexts(l).indexOf('gems')
    expect(contexts(l).slice(i, i + 4)).toEqual(['gems', 'microgenre', 'microgenre', 'microgenre'])
    expect(contexts(l)[i + 4]).toBe('collection')
  })

  it('çocuk profili: mikro tür satırları yalnız uygun başlıklarla; yetmeyen satır düşer', () => {
    installIntelligence(app)
    const l = home(KID)
    const rows = l.lists.filter((x) => x.context === 'microgenre')
    expect(rows.map((r) => r.microgenreId)).toEqual(['mg_e_aile'])
    for (const r of rows) for (const v of r.videoIds) expect(app.services.catalog.isVisibleTo(KID, v)).toBe(true)
  })

  it('"… adlı içeriği izlediğin için": harman benzerlikten, gerekçe satırın çoğunun paylaştığı mikro tür', () => {
    installIntelligence(app)
    app.services.progress.setBookmark(ADULT.guid, ID.sintel, 300)
    const row = byCtx(home()).becauseYouWatched!
    expect(row.displayName).toBe('Sintel adlı içeriği izlediğin için')
    expect(row.videoIds).toEqual(blendedSimilars(app.services, ID.sintel).map((x) => x.titleId))
    // Açık Kaynakla…: BBB, Tears, Cosmos, Spring (4 öğe) — en çok paylaşılan
    expect(row.reason).toBe('Açık Kaynakla Üretilmiş Kısa Filmler')
  })

  it('zevk topluluğu satırı: topluluk varsa, izlenenler hariç, yer ve kimlik', () => {
    const { audience } = installIntelligence(app)
    audience.assign(ADULT.guid, 'tc_07')
    audience.setTop('tc_07', [ID.sintel, ID.tears, ID.nosferatu, ID.cosmos, ID.metropolis])
    app.services.progress.setBookmark(ADULT.guid, ID.sintel, 300)
    const l = home()
    const row = byCtx(l).tasteCommunity!
    expect(row).toMatchObject({
      displayName: 'Senin Gibi İzleyenler Bunları Seviyor',
      communityId: 'tc_07',
      videoIds: [ID.tears, ID.nosferatu, ID.cosmos, ID.metropolis],
    })
    const i = contexts(l).indexOf('gems')
    expect(contexts(l)[i + 1]).toBe('tasteCommunity')
    // çocuk: yalnız Metropolis görünür → en az öğe kuralıyla düşer
    audience.assign(KID.guid, 'tc_07')
    expect(contexts(home(KID))).not.toContain('tasteCommunity')
    // topluluk yok → satır yok
    audience.assign(ADULT.guid, null)
    expect(contexts(home())).not.toContain('tasteCommunity')
  })

  it('Diziler / Filmler: en çok iki satır, yalnız o türden başlıklar', () => {
    const { microgenres } = installIntelligence(app)
    microgenres.set([
      ...FIXTURE_MICROGENRES,
      mg('mg_f_sessiz', 'Sessiz ve Kara Filmler', [ID.nosferatu, ID.metropolis, ID.tears, ID.sintel, ID.caminandes]),
      mg('mg_g_dizi', 'Kısa Bölümlü Diziler', [ID.caminandes], { type: 'SHOW' }),
    ])
    microgenres.bump()
    const movies = home(ADULT, 'movies')
    const rows = movies.lists.filter((x) => x.context === 'microgenre')
    expect(rows.length).toBeLessThanOrEqual(2)
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      expect(r.listId).toContain('_m.microgenre_')
      for (const v of r.videoIds) expect(app.services.catalog.getTitle(v)!.type).toBe('MOVIE')
    }
    // Örnek içerikte tek dizi var → Diziler sayfasında mikro tür satırı yok (en az öğe kuralı)
    expect(contexts(home(ADULT, 'shows'))).not.toContain('microgenre')
  })

  it('en az öğe kuralı yeni satırlara da uygulanır', () => {
    installIntelligence(app)
    for (const x of home().lists)
      if (!['billboard', 'bridge', 'continueWatching', 'queue'].includes(x.context))
        expect(x.videoIds.length).toBeGreaterThanOrEqual(MIN_ROW_ITEMS)
  })
})

describe('önbellek: sürüm değişince tazelenir', () => {
  let app: FastifyInstance
  beforeEach(async () => {
    app = await createAlanApp()
  })
  afterEach(async () => {
    await app.close()
  })
  const ctxFor = (pp: Passport = passport(ADULT)): FalcorRouteContext => ({
    req: fakeRequest(),
    passport: pp,
    services: app.services,
    config: app.config,
    flags: FLAGS,
  })
  const summaries = async () => {
    const g = (await evaluatePaths(ctxFor(), [['lolomo', { from: 0, to: 15 }, 'summary']])).jsonGraph
    const lists = (g.lists ?? {}) as Record<string, { summary?: { value?: Record<string, unknown> } }>
    const order = Object.values((g.lolomos as Record<string, Record<string, { value: string[] }>>)[ADULT.guid]!)
      .filter((r) => Array.isArray(r?.value))
      .map((r) => r.value[1]!)
    return order.map((id) => lists[id]!.summary!.value!)
  }

  it('mikro türler yeniden üretilince (revision) ana sayfa ve gerekçeler yeni veriyi gösterir', async () => {
    const { microgenres } = installIntelligence(app)
    app.services.progress.setBookmark(ADULT.guid, ID.sintel, 300)
    const before = await summaries()
    expect(before.filter((s) => s.context === 'microgenre').map((s) => s.microgenreId)).toEqual([
      'mg_b_buyu',
      'mg_d_klasik',
      'mg_e_aile',
    ])
    expect(before.find((s) => s.context === 'becauseYouWatched')!.reason).toBe('Açık Kaynakla Üretilmiş Kısa Filmler')

    // Etiketler değişti: mikro türler yeniden adlandı / küçüldü
    microgenres.set(
      FIXTURE_MICROGENRES.map((m) =>
        m.id === 'mg_b_buyu'
          ? { ...m, name: 'Masal Gibi Fantastik Filmler' }
          : m.id === 'mg_h2_acik'
            ? { ...m, name: 'Blender Stüdyosundan Kısa Filmler' }
            : m.id === 'mg_d_klasik'
              ? { ...m, titleIds: [ID.nosferatu, ID.metropolis], size: 2 }
              : m,
      ),
    )
    microgenres.bump()
    const after = await summaries()
    expect(after.filter((s) => s.context === 'microgenre').map((s) => [s.microgenreId, s.displayName])).toEqual([
      ['mg_b_buyu', 'Masal Gibi Fantastik Filmler'],
      ['mg_e_aile', 'Ailece İzlenecek Kısa Yapımlar'],
    ])
    expect(after.find((s) => s.context === 'becauseYouWatched')!.reason).toBe('Blender Stüdyosundan Kısa Filmler')
  })

  it('gömme sürümü değişince benzerler tazelenir; topluluk koşusu değişince satır da', async () => {
    const { embeddings, audience } = installIntelligence(app)
    const top = () => blendedSimilars(app.services, ID.nosferatu)[0]!.titleId
    expect(top()).toBe(ID.metropolis)
    // Nosferatu'nun vektörü artık Cosmos'a çok yakın; künye işaretiyle birlikte yine de değişmeli
    embeddings.setVector(ID.nosferatu, [0.6, 0.3, 0.1])
    embeddings.setVector(ID.metropolis, [-1, 0, 0])
    expect(top()).toBe(ID.metropolis) // sürüm artmadan önbellekten
    embeddings.bump()
    const sig = blendedSimilars(app.services, ID.nosferatu).find((x) => x.titleId === ID.metropolis)!
    expect(sig.signals.find((s) => s.name === 'gomme')!.value).toBeCloseTo((-0.6 / Math.hypot(0.6, 0.3, 0.1) + 1) / 2)

    audience.assign(ADULT.guid, 'tc_01')
    audience.setTop('tc_01', [ID.tears, ID.cosmos, ID.metropolis])
    audience.setTop('tc_02', [ID.nosferatu, ID.spring, ID.bbb])
    expect((await summaries()).find((s) => s.context === 'tasteCommunity')!.communityId).toBe('tc_01')
    audience.assign(ADULT.guid, 'tc_02')
    audience.newRun()
    expect((await summaries()).find((s) => s.context === 'tasteCommunity')!.communityId).toBe('tc_02')
  })
})

describe('Falcor ve açılış tohumu', () => {
  let app: FastifyInstance
  afterEach(async () => {
    await app.close()
  })

  it('lists[..].summary yeni alanları taşır (pathEvaluator üzerinden)', async () => {
    app = await createAlanApp()
    const { audience } = installIntelligence(app)
    audience.assign(ADULT.guid, 'tc_03')
    audience.setTop('tc_03', [ID.tears, ID.nosferatu, ID.cosmos, ID.metropolis])
    app.services.progress.setBookmark(ADULT.guid, ID.sintel, 300)
    const ctx: FalcorRouteContext = {
      req: fakeRequest(),
      passport: passport(ADULT),
      services: app.services,
      config: app.config,
      flags: FLAGS,
    }
    const paths: FalcorPath[] = [['lolomo', { from: 0, to: 15 }, 'summary']]
    const g = (await evaluatePaths(ctx, paths)).jsonGraph
    const summaries = Object.values(g.lists as Record<string, { summary: { value: Record<string, unknown> } }>).map(
      (l) => l.summary.value,
    )
    const of = (c: string) => summaries.filter((s) => s.context === c)
    expect(of('becauseYouWatched')[0]).toMatchObject({
      displayName: 'Sintel adlı içeriği izlediğin için',
      reason: 'Açık Kaynakla Üretilmiş Kısa Filmler',
    })
    expect(of('tasteCommunity')[0]).toMatchObject({
      displayName: 'Senin Gibi İzleyenler Bunları Seviyor',
      communityId: 'tc_03',
      length: 4,
    })
    expect(of('microgenre').map((s) => s.microgenreId)).toEqual(['mg_b_buyu', 'mg_d_klasik', 'mg_e_aile'])
    // diğer satırlar yeni alanları taşımaz
    for (const s of of('genre')) expect(Object.keys(s)).not.toContain('microgenreId')
    // satır öğeleri ve tctx
    const mgList = of('microgenre')[0]!.id as string
    const items = (await evaluatePaths(ctx, [['lists', mgList, { from: 0, to: 1 }, 'title']])).jsonGraph
    expect(Object.keys((items.videos ?? {}) as object)).toHaveLength(2)
  })

  it('açılış tohumu: ilk satırlara düşen mikro tür satırı afiş yapraklarıyla tohumlanır', async () => {
    app = await createTestApp({ contentDir: FIXTURE_CONTENT_DIR })
    installIntelligence(app)
    const login = await app.inject({ method: 'POST', url: '/api/login' })
    const cookies = Object.fromEntries(login.cookies.map((c) => [c.name, c.value]))
    const guid = login.json<BootContext>().profiles.find((p) => !p.isKids)!.guid
    const sw = await app.inject({ method: 'POST', url: '/api/profiles/switch', cookies, payload: { guid } })
    for (const c of sw.cookies) cookies[c.name] = c.value
    const g = (await app.inject({ url: '/api/boot', cookies })).json<BootContext>().falcorCache as JsonGraph
    expect(g).toBeTruthy()
    const lists = g.lists as Record<string, Record<string, unknown> & { summary?: { value?: Record<string, unknown> } }>
    const seeded = Object.entries(lists).filter(([, l]) => l.summary?.value?.context === 'microgenre')
    expect(seeded.length).toBeGreaterThan(0)
    for (const [, l] of seeded) {
      const length = Number(l.summary!.value!.length)
      for (let i = 0; i < Math.min(length, 10); i++) {
        const r = l[String(i)] as { $type: string; value: (string | number)[] }
        expect(r.$type).toBe('ref')
        const v = (g.videos as Record<string, Record<string, unknown>>)[String(r.value[1])]!
        for (const leaf of ['summary', 'title', 'boxart', 'access']) expect(v[leaf], leaf).toBeTruthy()
      }
      expect(Object.keys(l.itemTctx as object).length).toBe(Math.min(length, 10))
    }
  })
})
