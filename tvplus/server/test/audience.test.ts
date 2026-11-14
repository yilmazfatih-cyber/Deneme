/**
 * Zevk toplulukları: ekilmiş zevk kalıplarının geri bulunması, belirlenimcilik, k seçimi, küçük kümelerin dağıtılması,
 * uç durumlar, adlandırma, profil ataması, arka planda tazeleme, REST uçları ve yazma koruması.
 * Diğer servisler sahte (server/test/intelligence-fixtures.ts); katalog gerçek test içeriğidir.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { HEADERS } from '../../shared/constants'
import type { ContentTitle } from '../../shared/content-schema'
import type { BootContext } from '../../shared/types'
import type { CommunitiesResponse, TasteCommunity } from '../../shared/intelligence'
import { audienceInternals } from '../src/services/audience/plugin'
import { restoreModel, serialiseModel } from '../src/services/audience/service'
import { nameCommunity } from '../src/services/audience/describe'
import { createTestApp } from './helpers'
import {
  createFakeMicrogenres,
  createFakeTagging,
  createFakeViewing,
  installFakes,
  makeMicrogenre,
  makeTitle,
  plantArchetypes,
  purity,
  realCatalogPools,
  type Archetype,
  type FakePlay,
} from './intelligence-fixtures'

const apps: FastifyInstance[] = []
afterEach(async () => {
  while (apps.length) await apps.pop()!.close()
})

async function appWith(plays: FakePlay[], extra: Parameters<typeof installFakes>[1] = {}) {
  const app = await createTestApp()
  apps.push(app)
  const viewing = createFakeViewing({ plays })
  installFakes(app, { viewing, tagging: createFakeTagging(), microgenres: createFakeMicrogenres(), ...extra })
  return { app, viewing }
}

function archetypes(app: FastifyInstance, sizes = [140, 110, 90, 60]): Archetype[] {
  const pools = realCatalogPools(app.services.catalog.allTitles())
  return [
    { name: 'bilim', pool: pools.bilim, viewers: sizes[0]!, device: 'TV', countries: ['TR', 'DE', 'NL'] },
    { name: 'sessiz', pool: pools.sessiz, viewers: sizes[1]!, device: 'WEB', countries: ['TR', 'FR'] },
    { name: 'animasyon', pool: pools.animasyon, viewers: sizes[2]!, device: 'MOBILE', countries: ['TR'] },
    { name: 'yasam', pool: pools.yasam, viewers: sizes[3]!, device: 'TV', countries: ['AZ', 'TR'] },
  ]
}

function assignments(app: FastifyInstance, viewers: Iterable<string>): Map<string, string> {
  const out = new Map<string, string>()
  for (const v of viewers) {
    const a = app.services.audience.ofViewer(v)
    if (a) out.set(v, a.communityId)
  }
  return out
}

/** Hesap zamanından bağımsız karşılaştırma */
const stable = (c: TasteCommunity[]) => JSON.stringify(c)

describe('zevk toplulukları — boş ve uç durumlar', () => {
  it('veri yokken çökmez: boş liste, null çalıştırma, null profil', async () => {
    const { app } = await appWith([])
    const a = app.services.audience
    expect(a.run()).toBeNull()
    expect(a.communities()).toEqual([])
    expect(a.get('tc_01')).toBeNull()
    expect(a.ofProfile('yok')).toBeNull()
    expect(a.ofViewer('v_yok')).toBeNull()
    expect(a.topTitles('tc_01', 5)).toEqual([])
    const run = a.recompute()
    expect(run.k).toBe(0)
    expect(run.viewers).toBe(0)
    expect(run.silhouette).toBeNull()
    const res = await app.inject({ method: 'GET', url: '/api/studio/communities' })
    expect(res.statusCode).toBe(200)
    expect(res.json<CommunitiesResponse>()).toEqual({ run: null, items: [] })
  })

  it('stub servislerle (sahte takılmadan) de çalışır', async () => {
    const app = await createTestApp()
    apps.push(app)
    expect(app.services.audience.communities()).toEqual([])
    const res = await app.inject({ method: 'POST', url: '/api/studio/communities/recompute', payload: {} })
    expect(res.statusCode).toBe(200)
    expect(res.json().k).toBe(0)
  })

  it('tek izleyici → tek topluluk; tek başlıklı izleyici atanmaz ama en yakın topluluğu bulunur', async () => {
    const t = 80010001
    const plays: FakePlay[] = [
      { viewerId: 'v_a', titleId: t, ts: 1, watchedSec: 3000 },
      { viewerId: 'v_a', titleId: 80010002, ts: 2, watchedSec: 3000 },
      { viewerId: 'v_tek', titleId: t, ts: 3, watchedSec: 3000 },
    ]
    const { app } = await appWith(plays)
    const titles = new Set(app.services.catalog.allTitles().map((x) => x.videoId))
    expect(titles.has(t) && titles.has(80010002)).toBe(true)
    const run = app.services.audience.recompute()
    expect(run.viewers).toBe(1)
    expect(run.k).toBe(1)
    expect(audienceRun(app).unassigned).toBe(1)
    expect(app.services.audience.communities()[0]).toMatchObject({ id: 'tc_01', name: 'Tüm İzleyiciler', share: 1 })
    expect(app.services.audience.communities()[0]!.topFeatures[0]!.lift).toBe(1)
    expect(app.services.audience.ofViewer('v_a')?.communityId).toBe('tc_01')
    expect(app.services.audience.ofViewer('v_tek')?.communityId).toBe('tc_01')
  })

  it("izleyici sayısı istenen k'dan azsa k veriyle sınırlanır", async () => {
    const { app } = await appWith([])
    const pools = archetypes(app)
    const planted = plantArchetypes(pools.map((a) => ({ ...a, viewers: 1 })).slice(0, 3), { seed: 3, allTitles: [] })
    const viewing = createFakeViewing({ plays: planted.plays })
    installFakes(app, { viewing })
    const run = app.services.audience.recompute({ k: 10 })
    expect(run.viewers).toBe(3)
    expect(run.k).toBeLessThanOrEqual(3)
    expect(run.k).toBeGreaterThanOrEqual(1)
  })
})

function audienceRun(app: FastifyInstance): {
  unassigned: number
  candidates: { k: number; silhouette: number | null }[]
} {
  return app.services.audience.run() as unknown as {
    unassigned: number
    candidates: { k: number; silhouette: number | null }[]
  }
}

describe('zevk toplulukları — ekilmiş kalıplar', () => {
  it('temiz veride dört kalıbı bulur (saflık ≥ 0,9), büyüklüğe göre sıralar, adlandırır', async () => {
    const { app } = await appWith([])
    const arch = archetypes(app)
    const all = app.services.catalog.allTitles().map((t) => t.videoId)
    const planted = plantArchetypes(arch, { seed: 11, allTitles: all })
    installFakes(app, { viewing: createFakeViewing({ plays: planted.plays }) })
    const run = app.services.audience.recompute({ seed: 5 })
    expect(run.viewers).toBe(400)
    expect(run.k).toBe(4)
    expect(run.silhouette).not.toBeNull()
    expect(run.silhouette!).toBeGreaterThan(0.2)
    const comms = app.services.audience.communities()
    expect(comms.map((c) => c.id)).toEqual(['tc_01', 'tc_02', 'tc_03', 'tc_04'])
    for (let i = 1; i < comms.length; i++) expect(comms[i]!.size).toBeLessThanOrEqual(comms[i - 1]!.size)
    expect(comms.reduce((s, c) => s + c.share, 0)).toBeCloseTo(1, 3)
    expect(comms.reduce((s, c) => s + c.hoursShare, 0)).toBeCloseTo(1, 3)
    expect(new Set(comms.map((c) => c.name)).size).toBe(4)
    for (const c of comms) {
      expect(c.name.length).toBeGreaterThan(3)
      expect(c.topFeatures.length).toBeGreaterThan(0)
      expect(c.topFeatures.every((f) => f.lift > 1)).toBe(true)
      expect(c.topTitles.length).toBeGreaterThan(0)
      expect(c.cohesion).toBeGreaterThan(0)
      expect(c.cohesion).toBeLessThanOrEqual(1)
    }
    const p = purity(assignments(app, planted.truth.keys()), planted.truth)
    expect(p).toBeGreaterThanOrEqual(0.9)
    // En büyük topluluk "bilim" kalıbı: cihaz TV, birden çok ülke; öne çıkan başlıklar o havuzdan
    const bilim = comms[0]!
    expect(bilim.size).toBe(140)
    expect(bilim.devices.TV).toBe(1)
    expect(Object.keys(bilim.countries).sort()).toEqual(['DE', 'NL', 'TR'])
    const pool = new Set(arch[0]!.pool)
    expect(bilim.topTitles.every((t) => pool.has(t.titleId))).toBe(true)
    expect(app.services.audience.topTitles('tc_01', 3)).toHaveLength(3)
    expect(app.services.audience.get('tc_02')?.size).toBe(110)
  })

  it('gürültülü veride de anlamlı (saflık ≥ 0,75)', async () => {
    const { app } = await appWith([])
    const all = app.services.catalog.allTitles().map((t) => t.videoId)
    const planted = plantArchetypes(archetypes(app), { seed: 12, allTitles: all, noise: 0.2 })
    installFakes(app, { viewing: createFakeViewing({ plays: planted.plays }) })
    const run = app.services.audience.recompute()
    expect(run.k).toBeGreaterThanOrEqual(3)
    const p = purity(assignments(app, planted.truth.keys()), planted.truth)
    expect(p).toBeGreaterThanOrEqual(0.75)
  })

  it('belirlenimci: aynı veri + tohum → aynı topluluklar; olguların sırası sonucu değiştirmez', async () => {
    const { app } = await appWith([])
    const all = app.services.catalog.allTitles().map((t) => t.videoId)
    const planted = plantArchetypes(archetypes(app), { seed: 13, allTitles: all, noise: 0.1 })
    installFakes(app, { viewing: createFakeViewing({ plays: planted.plays }) })
    const r1 = app.services.audience.recompute({ seed: 99 })
    const c1 = stable(app.services.audience.communities())
    const a1 = [...assignments(app, planted.truth.keys())]
    const r2 = app.services.audience.recompute({ seed: 99 })
    expect(r2.runId).toBe(r1.runId)
    expect(stable(app.services.audience.communities())).toBe(c1)
    // Ters sırada oynatmalar
    installFakes(app, { viewing: createFakeViewing({ plays: [...planted.plays].reverse() }) })
    const r3 = app.services.audience.recompute({ seed: 99 })
    expect(r3.runId).toBe(r1.runId)
    expect(stable(app.services.audience.communities())).toBe(c1)
    expect([...assignments(app, planted.truth.keys())]).toEqual(a1)
  })

  it('k adaylar arasından siluetle seçilir (düzlükte en ince); açık k verilince o kullanılır', async () => {
    const { app } = await appWith([])
    const all = app.services.catalog.allTitles().map((t) => t.videoId)
    const planted = plantArchetypes(archetypes(app), { seed: 14, allTitles: all })
    installFakes(app, { viewing: createFakeViewing({ plays: planted.plays }) })
    const run = app.services.audience.recompute()
    const cands = audienceRun(app).candidates
    expect(cands.length).toBeGreaterThan(3)
    // Siluet düzlüğü kuralı: en iyiye 0,01 yakın adaylardan en büyük k
    const bestSil = Math.max(...cands.map((c) => c.silhouette ?? -2))
    const plateau = cands.filter((c) => (c.silhouette ?? -2) >= bestSil - 0.01).map((c) => c.k)
    expect(run.k).toBe(Math.max(...plateau))
    expect(run.k).toBe(4)
    expect(Math.max(...cands.map((c) => c.k))).toBeLessThanOrEqual(Math.min(app.config.maxCommunities, 20))
    const forced = app.services.audience.recompute({ k: 2 })
    expect(forced.k).toBe(2)
    expect(audienceRun(app).candidates).toHaveLength(1)
  })

  it('küçük kümeler dağıtılıp komşularına katılır', async () => {
    // Sentetik katalog: dört ayrık zevk + yalnız 3 izleyicili beşinci (spor)
    const groups: ContentTitle['genres'][] = [
      ['belgesel', 'doga-bilim'],
      ['komedi', 'sessiz-sinema'],
      ['animasyon'],
      ['dram', 'romantik'],
      ['spor'],
    ]
    const titles = groups.flatMap((genres, gi) => Array.from({ length: gi === 4 ? 3 : 8 }, () => makeTitle({ genres })))
    const poolOf = (gi: number) => titles.filter((t) => t.genres[0] === groups[gi]![0]).map((t) => t.videoId)
    const arch: Archetype[] = [
      { name: 'a', pool: poolOf(0), viewers: 80 },
      { name: 'b', pool: poolOf(1), viewers: 70 },
      { name: 'c', pool: poolOf(2), viewers: 60 },
      { name: 'd', pool: poolOf(3), viewers: 50 },
      { name: 'kucuk', pool: poolOf(4), viewers: 3, titlesPerViewer: [3, 3] },
    ]
    const planted = plantArchetypes(arch, { seed: 15, allTitles: [] })
    const { app } = await appWith(planted.plays, { titles })
    const run = app.services.audience.recompute({ k: 5 })
    expect(run.k).toBe(4)
    const comms = app.services.audience.communities()
    const minSize = Math.ceil((0.2 * run.viewers) / 5)
    for (const c of comms) expect(c.size).toBeGreaterThanOrEqual(minSize)
    expect(comms.reduce((s, c) => s + c.size, 0)).toBe(run.viewers)
    expect(
      purity(
        assignments(
          app,
          [...planted.truth.keys()].filter((v) => planted.truth.get(v) !== 'kucuk'),
        ),
        planted.truth,
      ),
    ).toBe(1)
    // Otomatik k da dört ayrık zevki bulur
    expect(app.services.audience.recompute().k).toBe(4)
  })
})

describe('zevk toplulukları — adlandırma ve etiketler', () => {
  it('etiket ve mikro türler varsa özellik vektörüne ve ada girer', async () => {
    const { app } = await appWith([])
    const arch = archetypes(app)
    const all = app.services.catalog.allTitles().map((t) => t.videoId)
    const planted = plantArchetypes(arch, { seed: 21, allTitles: all })
    const vocabulary = {
      version: '2026.11-1',
      scales: [
        {
          key: 'ogreticilik',
          name: 'Öğreticilik',
          question: 'Ne kadar öğretici?',
          group: 'FORM' as const,
          levels: [0, 1, 2, 3, 4, 5].map((v) => ({ value: v, label: `${v}`, description: `${v}` })),
          descriptors: [{ key: 'dusundurucu-d', min: 4, max: 5, adjective: 'Düşündürücü' }],
        },
      ],
      facets: [
        {
          key: 'mekan',
          name: 'Mekân',
          question: 'Nerede geçiyor?',
          slot: 'SETTING' as const,
          multi: true,
          max: 2,
          values: [
            { key: 'uzay', name: 'Uzay', phrase: 'Uzayda Geçen' },
            { key: 'sehir', name: 'Şehir', phrase: 'Şehirde Geçen' },
          ],
        },
      ],
      naming: {
        genreNouns: { belgesel: { movie: 'Belgesel Filmleri', show: 'Belgesel Dizileri', mixed: 'Belgeseller' } },
        regions: [],
        eras: [],
        order: ['ADJECTIVE' as const],
      },
    }
    const tags: Record<number, { descriptors: string[]; facets: Record<string, string[]> }> = {}
    for (const id of arch[0]!.pool) tags[id] = { descriptors: ['dusundurucu-d'], facets: { mekan: ['uzay'] } }
    for (const id of arch[1]!.pool) tags[id] = { descriptors: [], facets: { mekan: ['sehir'] } }
    const micro = makeMicrogenre('mg_bilimuzay', 'Bilim ve Uzay Belgeselleri', 'belgesel', arch[0]!.pool, 2)
    installFakes(app, {
      viewing: createFakeViewing({ plays: planted.plays }),
      tagging: createFakeTagging(tags, vocabulary),
      microgenres: createFakeMicrogenres([micro]),
    })
    const run = app.services.audience.recompute()
    expect(run.k).toBe(4)
    const bilim = app.services.audience.communities()[0]!
    expect(bilim.name).toContain('Bilim ve Uzay Belgeselleri')
    expect(bilim.name).toMatch(/Düşündürücü|Uzay/)
    const kinds = new Set(bilim.topFeatures.map((f) => f.kind))
    expect(kinds.has('MICROGENRE')).toBe(true)
    expect(bilim.topFeatures.find((f) => f.kind === 'FACET')?.name).toBe('Mekân: Uzay')
  })

  it('ad: baş (mikro tür ya da türün çoğulu) + ikinci tür + niteleyici; çakışmada ayırt edici özellik eklenir', () => {
    const nouns = { movie: 'Belgesel Filmleri', show: 'Belgesel Dizileri', mixed: 'Belgeseller' }
    const f = (kind: 'GENRE' | 'DESCRIPTOR' | 'FACET' | 'MICROGENRE', label: string, lift = 3, score = 1) => ({
      def: { kind, key: label, name: label, label, ...(kind === 'GENRE' && label === 'Belgesel' ? { nouns } : {}) },
      score,
      lift,
    })
    const taken = new Set<string>()
    const base = [
      f('GENRE', 'Belgesel'),
      f('GENRE', 'Doğa ve Bilim'),
      f('FACET', 'Uzay'),
      f('DESCRIPTOR', 'Düşündürücü'),
    ]
    expect(nameCommunity(base, taken, 'mixed')).toBe('Belgeseller · Doğa ve Bilim · Düşündürücü')
    expect(nameCommunity(base, taken, 'show')).toBe('Belgesel Dizileri · Doğa ve Bilim · Düşündürücü')
    // Aynı ad alınmışsa sıradaki ayırt edici özellik eklenir
    expect(nameCommunity(base, taken, 'mixed')).toBe('Belgeseller · Doğa ve Bilim · Düşündürücü · Uzay')
    // Kaldıracı en iyi türe yakın mikro tür baş olur; adında geçen tür ve sıfat yinelenmez
    const micro = [
      f('GENRE', 'Doğa ve Bilim', 5),
      f('MICROGENRE', 'Düşündürücü Uzay Keşfi Hakkında Doğa ve Bilim Yapımları', 4.5),
      f('GENRE', 'Teknoloji', 4),
      f('DESCRIPTOR', 'Düşündürücü'),
      f('DESCRIPTOR', 'Öğretici'),
    ]
    expect(nameCommunity(micro, taken)).toBe(
      'Düşündürücü Uzay Keşfi Hakkında Doğa ve Bilim Yapımları · Teknoloji · Öğretici',
    )
    // Mikro tür belirgin biçimde daha az ayırt ediciyse tür baştadır; zayıf ikinci tür eklenmez
    expect(
      nameCommunity([f('GENRE', 'Korku', 9), f('MICROGENRE', 'Kısa Filmler', 2), f('GENRE', 'Dram', 2, 0.1)], taken),
    ).toBe('Korku')
    expect(nameCommunity([], taken)).toBe('Karışık Zevkler')
  })
})

describe('zevk toplulukları — profil, tazeleme, kalıcılık', () => {
  it('ofProfile: geçmişi olan profil en yakın topluluğa, geçmişsiz profil null', async () => {
    const { app, viewing } = await appWith([])
    const arch = archetypes(app)
    const all = app.services.catalog.allTitles().map((t) => t.videoId)
    const planted = plantArchetypes(arch, { seed: 31, allTitles: all })
    viewing.addPlays(planted.plays)
    app.services.audience.recompute()
    expect(app.services.audience.ofProfile('profil-1')).toBeNull()
    const vid = viewing.viewerIdOfProfile('profil-1')
    // Profil yalnız sessiz klasikler izliyor (kümelemeye girmedi; anında en yakın merkez)
    const sessiz = arch[1]!.pool
    const bySessiz = assignments(
      app,
      [...planted.truth].filter(([, t]) => t === 'sessiz').map(([v]) => v),
    )
    const sessizCommunity = [...bySessiz.values()][0]!
    const before = app.services.audience.run()!.runId
    viewing.addPlays(sessiz.slice(0, 3).map((titleId, i) => ({ viewerId: vid, titleId, ts: 10 + i, watchedSec: 3600 })))
    const a = app.services.audience.ofProfile('profil-1')
    expect(a?.communityId).toBe(sessizCommunity)
    expect(a!.similarity).toBeGreaterThan(0.3)
    // Okuma arka plan hesabı başlattı; önceki çalıştırma sunulmaya devam etti
    expect(app.services.audience.run()!.runId).toBe(before)
    await audienceInternals(app).idle()
  })

  it('izleme verisi değişince arka planda yeniden hesaplar, o sırada öncekini sunar', async () => {
    const { app, viewing } = await appWith([])
    const arch = archetypes(app, [60, 50, 40, 30])
    const all = app.services.catalog.allTitles().map((t) => t.videoId)
    const first = plantArchetypes(arch, { seed: 41, allTitles: all })
    viewing.addPlays(first.plays)
    // İlk okuma: çalıştırma yok, veri küçük → eşzamanlı
    const r1 = app.services.audience.run()
    expect(r1).not.toBeNull()
    const unassigned1 = audienceRun(app).unassigned
    expect(r1!.viewers + unassigned1).toBe(180)
    expect(audienceInternals(app).busy()).toBe(false)
    // Yeni izleyiciler gelir
    const more = plantArchetypes(
      arch.map((a) => ({ ...a, name: `${a.name}2` })),
      { seed: 42, allTitles: all },
    )
    viewing.addPlays(more.plays)
    const served = app.services.audience.communities()
    expect(audienceInternals(app).busy()).toBe(true)
    expect(app.services.audience.run()!.runId).toBe(r1!.runId)
    expect(served.reduce((s, c) => s + c.size, 0)).toBe(r1!.viewers)
    await audienceInternals(app).idle()
    const r2 = app.services.audience.run()!
    expect(r2.viewers + audienceRun(app).unassigned).toBe(360)
    expect(r2.runId).not.toBe(r1!.runId)
    expect(audienceInternals(app).busy()).toBe(false)
    // Mikro tür sayacı değişince de tazelenir
    const mg = createFakeMicrogenres()
    installFakes(app, { microgenres: mg })
    app.services.audience.run()
    await audienceInternals(app).idle()
    expect(app.services.audience.run()!.viewers).toBe(r2.viewers)
  })

  it('büyük veride ilk hesap da arka planda: servis boş döner, REST ucu hesabı bekler (olay döngüsü kilitlenmez)', async () => {
    const { app, viewing } = await appWith([])
    const all = app.services.catalog.allTitles().map((t) => t.videoId)
    const planted = plantArchetypes(archetypes(app, [500, 400, 300, 200]), { seed: 43, allTitles: all, noise: 0.05 })
    viewing.addPlays(planted.plays)
    expect(viewing.facts().length).toBeGreaterThan(5000)
    expect(app.services.audience.run()).toBeNull()
    expect(app.services.audience.ofProfile('p')).toBeNull()
    expect(audienceInternals(app).busy()).toBe(true)
    const res = await app.inject({ method: 'GET', url: '/api/studio/communities' })
    expect(res.statusCode).toBe(200)
    expect(res.json<CommunitiesResponse>().run!.k).toBe(4)
    expect(app.services.audience.communities()).toHaveLength(4)
  })

  it('son çalıştırma (model) kalıcıdır: yeni süreç onu hemen sunar, atamaları en yakın merkezden bulur, arka planda tazeler', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'tvplus-audience-'))
    const app1 = await createTestApp({ dataDir })
    const all = app1.services.catalog.allTitles().map((t) => t.videoId)
    const planted = plantArchetypes(archetypes(app1, [40, 30, 30, 20]), { seed: 51, allTitles: all })
    installFakes(app1, { viewing: createFakeViewing({ plays: planted.plays }) })
    const run1 = app1.services.audience.recompute()
    const comms1 = app1.services.audience.communities()
    const someViewer = [...planted.truth.keys()][7]!
    const a1 = app1.services.audience.ofViewer(someViewer)
    await app1.close() // kapanışta depo diske yazılır

    const app2 = await createTestApp({ dataDir })
    apps.push(app2)
    installFakes(app2, { viewing: createFakeViewing({ plays: planted.plays }) })
    expect(app2.services.audience.run()!.runId).toBe(run1.runId)
    expect(app2.services.audience.communities()).toEqual(comms1)
    // Atamalar taşınmaz: geri yüklenen modelde izleyicinin topluluğu kendi olgularından en yakın merkezle bulunur
    expect(app2.services.audience.ofViewer(someViewer)?.communityId).toBe(a1!.communityId)
    expect(app2.services.audience.ofViewer(someViewer)!.similarity).toBeCloseTo(a1!.similarity, 3)
    expect(audienceInternals(app2).busy()).toBe(true)
    await audienceInternals(app2).idle()
    expect(app2.services.audience.run()!.runId).toBe(run1.runId)
    expect(app2.services.audience.communities()).toEqual(comms1)
    // Serileştirme turu kayıpsız
    const m = restoreModel(JSON.parse(JSON.stringify(audienceInternals(app2).persisted()!)))!
    expect(m.communities).toEqual(comms1)
    expect(serialiseModel(m).k).toBe(run1.k)
    expect(JSON.stringify(audienceInternals(app2).persisted()).length).toBeLessThan(200_000)
  })
})

describe('zevk toplulukları — REST', () => {
  it('liste, tek topluluk, 404, kimlik ve gövde doğrulaması', async () => {
    const { app } = await appWith([])
    const all = app.services.catalog.allTitles().map((t) => t.videoId)
    installFakes(app, {
      viewing: createFakeViewing({ plays: plantArchetypes(archetypes(app), { seed: 61, allTitles: all }).plays }),
    })
    const list = await app.inject({ method: 'GET', url: '/api/studio/communities' })
    expect(list.statusCode).toBe(200)
    const body = list.json<CommunitiesResponse>()
    expect(body.run!.k).toBe(body.items.length)
    const one = await app.inject({ method: 'GET', url: `/api/studio/communities/${body.items[0]!.id}` })
    expect(one.statusCode).toBe(200)
    expect(one.json<TasteCommunity>().name).toBe(body.items[0]!.name)
    expect((await app.inject({ method: 'GET', url: '/api/studio/communities/tc_99' })).statusCode).toBe(404)
    const bad = await app.inject({ method: 'GET', url: '/api/studio/communities/xyz' })
    expect(bad.statusCode).toBe(400)
    expect(bad.json().error.message).toMatch(/Topluluk kimliği/)
    for (const payload of [{ k: 0 }, { k: 2.5 }, { seed: -1 }, { k: 3, fazla: true }, { k: '3' }]) {
      const r = await app.inject({ method: 'POST', url: '/api/studio/communities/recompute', payload })
      expect(r.statusCode).toBe(400)
      expect(r.json().error.code).toBe('VALIDATION_FAILED')
    }
    const ok = await app.inject({
      method: 'POST',
      url: '/api/studio/communities/recompute',
      payload: { k: 3, seed: 7 },
    })
    expect(ok.statusCode).toBe(200)
    expect(ok.json().k).toBe(3)
    expect(ok.json().seed).toBe(7)
  })

  it('yazma koruması: oturumla gelen yeniden hesaplama authURL ister', async () => {
    const app = await createTestApp({ studioAccess: 'member' })
    apps.push(app)
    const anon = await app.inject({ method: 'GET', url: '/api/studio/communities' })
    expect(anon.statusCode).toBe(401)
    const cookies: Record<string, string> = {}
    const take = (res: { cookies: { name: string; value: string }[] }) => {
      for (const c of res.cookies) cookies[c.name] = c.value
    }
    const login = await app.inject({ method: 'POST', url: '/api/login' })
    take(login)
    const sw = await app.inject({
      method: 'POST',
      url: '/api/profiles/switch',
      cookies,
      payload: { guid: login.json<BootContext>().profiles[0]!.guid },
    })
    take(sw)
    const boot = sw.json<BootContext>()
    expect((await app.inject({ method: 'GET', url: '/api/studio/communities', cookies })).statusCode).toBe(200)
    const noCsrf = await app.inject({ method: 'POST', url: '/api/studio/communities/recompute', cookies, payload: {} })
    expect(noCsrf.statusCode).toBe(403)
    const withCsrf = await app.inject({
      method: 'POST',
      url: '/api/studio/communities/recompute',
      cookies,
      headers: { [HEADERS.AUTH_URL]: boot.authURL! },
      payload: {},
    })
    expect(withCsrf.statusCode).toBe(200)
  })
})
