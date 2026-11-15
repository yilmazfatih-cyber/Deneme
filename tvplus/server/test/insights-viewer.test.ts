/**
 * Yönetici paneli: GET /api/studio/me/insight — profilin segmenti ve kararın bileşenleri (explainViewer ofProfile ile
 * aynı karar, katkıların toplamı benzerliğe eşit), ana sayfa satırları ve dayanakları, alt türler, model durumları.
 * Katalog, etiketleme ve mikro türler gerçek (test içeriği); izleme verisi sahte (intelligence-fixtures).
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { HEADERS, ROUTES } from '../../shared/constants'
import type { ViewerInsight } from '../../shared/intelligence'
import type { BootContext } from '../../shared/types'
import type { ProfileRecord } from '../src/kernel/context'
import type { Services } from '../src/kernel/services'
import { audienceInternals } from '../src/services/audience/plugin'
import { DEMO_ACCOUNT_ID } from '../src/services/identity/plugin'
import { buildViewerInsight, describeDefinition, INSIGHT_LIMITS } from '../src/services/insights/viewer'
import { fakeAudience } from './fixtures/intelligence'
import { createTestApp } from './helpers'
import { createFakeViewing, plantArchetypes, realCatalogPools, type FakeViewing } from './intelligence-fixtures'

const apps: FastifyInstance[] = []
afterEach(async () => {
  while (apps.length) await apps.pop()!.close()
})

const NOW = new Date('2026-11-13T09:00:00.000Z')

async function setup(): Promise<{
  app: FastifyInstance
  viewing: FakeViewing
  adult: ProfileRecord
  kid: ProfileRecord
}> {
  const app = await createTestApp()
  apps.push(app)
  const viewing = createFakeViewing()
  app.services.viewing = viewing
  const profiles = app.services.identity.listProfiles(DEMO_ACCOUNT_ID)
  const adult = profiles.find((p) => !p.isKids)!
  const kid = profiles.find((p) => p.isKids)!
  return { app, viewing, adult, kid }
}

/** Dört ayrık zevk kalıbıyla topluluklar hesaplanır */
function plant(app: FastifyInstance, viewing: FakeViewing) {
  const pools = realCatalogPools(app.services.catalog.allTitles())
  const planted = plantArchetypes(
    [
      { name: 'bilim', pool: pools.bilim, viewers: 60 },
      { name: 'sessiz', pool: pools.sessiz, viewers: 50 },
      { name: 'animasyon', pool: pools.animasyon, viewers: 40 },
      { name: 'yasam', pool: pools.yasam, viewers: 30 },
    ],
    { seed: 7, allTitles: app.services.catalog.allTitles().map((t) => t.videoId) },
  )
  viewing.addPlays(planted.plays)
  app.services.audience.recompute()
  return { pools, planted }
}

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0)
const isSortedDesc = (xs: number[]) => xs.every((x, i) => i === 0 || xs[i - 1]! >= x)

describe('Yönetici paneli: segment kararı', () => {
  it('geçmişsiz profil: NO_HISTORY, segment yok; satırlar ve alt türler yine listelenir', async () => {
    const { app, viewing, adult } = await setup()
    plant(app, viewing)
    const ins = buildViewerInsight(app.services, adult, NOW, app.config)
    expect(ins.segmentStatus).toBe('NO_HISTORY')
    expect(ins.segment).toBeNull()
    expect(ins.viewerId).toBe(viewing.viewerIdOfProfile(adult.guid))
    expect(ins.history).toMatchObject({ titles: 0, engagedTitles: 0, hours: 0, plays: 0, firstTs: null, lastTs: null })
    expect(ins.run?.runId).toBe(app.services.audience.run()!.runId)
    expect(ins.sampleData).toBe(true)
    expect(ins.rows.length).toBeGreaterThan(0)
    expect(ins.rows.some((r) => r.context === 'billboard')).toBe(false)
    for (const r of ins.rows) {
      expect(r.basis.length).toBeGreaterThan(0)
      expect(r.size).toBeGreaterThanOrEqual(0)
    }
    const top10 = ins.rows.find((r) => r.context.startsWith('top10'))
    if (top10) expect(top10.personal).toBe(false)
    expect(ins.subgenres.length).toBeGreaterThan(0)
    for (const s of ins.subgenres) {
      expect(s.score).toBe(0) // geçmiş yok: en büyük alt türler
      expect(s.definition.length).toBeGreaterThan(0)
      expect(s.watched).toEqual([])
      expect(ins.rows.find((r) => r.context === 'microgenre' && r.title === s.name)?.personal).toBe(false)
    }
    expect(ins.search.modelVersion).toMatch(/^lr-1 · \d+ güncelleme$/)
    expect(ins.search.features.map((f) => f.name)).toContain('metin')
    expect(ins.model).toMatchObject({ ready: false, picks: [] })
  })

  it('geçmişli profil: ASSIGNED, topluluk ve benzerlik ofProfile ile aynı; bileşenler sıralı ve toplamı benzerlik', async () => {
    const { app, viewing, adult } = await setup()
    const { pools } = plant(app, viewing)
    const vid = viewing.viewerIdOfProfile(adult.guid)
    const watched = pools.sessiz.slice(0, 3)
    viewing.addPlays(
      watched.map((titleId, i) => ({
        viewerId: vid,
        titleId,
        ts: NOW.getTime() - 86_400_000 * (i + 1),
        watchedSec: 3600,
      })),
    )
    await audienceInternals(app).idle()

    const ins = buildViewerInsight(app.services, adult, NOW, app.config)
    const want = app.services.audience.ofProfile(adult.guid)!
    expect(want).not.toBeNull()
    expect(ins.segmentStatus).toBe('ASSIGNED')
    const seg = ins.segment!
    expect(seg.communityId).toBe(want.communityId)
    expect(seg.similarity).toBe(want.similarity)
    expect(seg.inRun).toBe(false)
    expect(seg.name).toBe(app.services.audience.get(want.communityId)!.name)
    expect(seg.traits.length).toBeLessThanOrEqual(INSIGHT_LIMITS.traits)

    expect(ins.history.titles).toBe(3)
    expect(ins.history.engagedTitles).toBe(3)
    expect(ins.history.hours).toBe(3)
    expect(ins.history.top.map((t) => t.titleId).sort()).toEqual([...watched].sort())

    // why / drivers: büyükten küçüğe, sınırlı
    expect(seg.why.length).toBeGreaterThan(0)
    expect(seg.why.length).toBeLessThanOrEqual(INSIGHT_LIMITS.why)
    expect(isSortedDesc(seg.why.map((w) => w.contribution))).toBe(true)
    for (const w of seg.why) expect(w.contribution).toBeCloseTo(w.viewerWeight * w.communityWeight, 5)
    expect(seg.drivers.length).toBeGreaterThan(0)
    expect(isSortedDesc(seg.drivers.map((d) => d.contribution))).toBe(true)
    for (const d of seg.drivers) expect(watched).toContain(d.titleId)

    // Tam ayrıştırma: tüm bileşenlerin toplamı benzerliğe eşit
    const exp = audienceInternals(app).explainViewer(vid)
    expect(exp.communityId).toBe(want.communityId)
    expect(exp.similarity).toBe(want.similarity)
    expect(sum(exp.features.map((f) => f.contribution))).toBeCloseTo(want.similarity, 3)
    expect(sum(exp.titles.map((t) => t.contribution))).toBeCloseTo(want.similarity, 3)
    expect(exp.titles.length).toBe(3)
    // Seçilen topluluk benzerliklerin en büyüğü (çalıştırma dışı: en yakın merkez)
    expect(exp.similarities[0]!.communityId).toBe(want.communityId)

    // Alternatifler: seçilen hariç, büyükten küçüğe, en çok 3
    expect(seg.alternatives.length).toBeLessThanOrEqual(INSIGHT_LIMITS.alternatives)
    expect(seg.alternatives.some((a) => a.communityId === want.communityId)).toBe(false)
    expect(isSortedDesc(seg.alternatives.map((a) => a.similarity))).toBe(true)
    if (seg.alternatives.length) expect(seg.alternatives[0]!.similarity).toBeLessThanOrEqual(seg.similarity)

    // Seçimler: izlenmemiş ve görünür
    expect(seg.picks.length).toBeLessThanOrEqual(INSIGHT_LIMITS.picks)
    for (const p of seg.picks) {
      expect(watched).not.toContain(p.titleId)
      expect(app.services.catalog.isVisibleTo(adult, p.titleId)).toBe(true)
    }
    const top = app.services.audience.topTitles(want.communityId, 60).map((t) => t.titleId)
    expect(top.some((id) => watched.includes(id))).toBe(true) // süzgeç gerçekten bir şey eledi

    // Topluluk satırı kişisel ve dayanağı topluluk
    const row = ins.rows.find((r) => r.context === 'tasteCommunity')
    if (row) expect(row.personal).toBe(true)
  })

  it('çalıştırmadaki izleyici: kümelemenin ataması ve benzerliği; bileşen toplamı benzerliğe eşit', async () => {
    const { app, viewing } = await setup()
    const { planted } = plant(app, viewing)
    const audience = audienceInternals(app)
    let checked = 0
    for (const viewerId of [...planted.truth.keys()].slice(0, 40)) {
      const want = audience.ofViewer(viewerId)
      const exp = audience.explainViewer(viewerId)
      if (!want) {
        expect(exp.status).not.toBe('ASSIGNED')
        continue
      }
      expect(exp.status).toBe('ASSIGNED')
      expect(exp.inRun).toBe(true)
      expect(exp.communityId).toBe(want.communityId)
      expect(exp.similarity).toBe(want.similarity)
      expect(sum(exp.features.map((f) => f.contribution))).toBeCloseTo(want.similarity, 3)
      expect(sum(exp.titles.map((t) => t.contribution))).toBeCloseTo(want.similarity, 3)
      expect(isSortedDesc(exp.similarities.map((s) => s.similarity))).toBe(true)
      expect(exp.similarities).toHaveLength(app.services.audience.communities().length)
      checked++
    }
    expect(checked).toBeGreaterThan(20)
  })

  it('model yok → NO_MODEL; ilgisi eşik altında kalan geçmiş → THIN_HISTORY', async () => {
    const { app, viewing, adult } = await setup()
    expect(buildViewerInsight(app.services, adult, NOW, app.config).segmentStatus).toBe('NO_MODEL')
    plant(app, viewing)
    const vid = viewing.viewerIdOfProfile(adult.guid)
    const title = app.services.catalog.allTitles()[0]!.videoId
    // Oynatmadan türeyen ilgi en az 0,3'tür: eşiğin altına inmek için doğrudan olgu
    viewing.setFacts([
      {
        viewerId: vid,
        titleId: title,
        source: 'SYNTHETIC',
        plays: 1,
        watchedSec: 1,
        completions: 0,
        firstTs: NOW.getTime() - 1000,
        lastTs: NOW.getTime() - 1000,
        inList: false,
        rating: null,
        engagement: 0.01,
      },
    ])
    await audienceInternals(app).idle()
    const ins = buildViewerInsight(app.services, adult, NOW, app.config)
    expect(ins.segmentStatus).toBe('THIN_HISTORY')
    expect(ins.segment).toBeNull()
    expect(ins.history.titles).toBe(1)
    expect(ins.history.engagedTitles).toBe(0)
    expect(app.services.audience.ofProfile(adult.guid)).toBeNull()
  })

  it('çocuk profili: çalışır, seçimler ve alt türler çocuğa görünür başlıklardan', async () => {
    const { app, viewing, kid } = await setup()
    const { pools } = plant(app, viewing)
    const vid = viewing.viewerIdOfProfile(kid.guid)
    const kidTitles = pools.animasyon.filter((id) => app.services.catalog.isVisibleTo(kid, id)).slice(0, 3)
    expect(kidTitles.length).toBeGreaterThan(0)
    viewing.addPlays(
      kidTitles.map((titleId, i) => ({ viewerId: vid, titleId, ts: NOW.getTime() - i * 1000, watchedSec: 1800 })),
    )
    await audienceInternals(app).idle()
    const ins = buildViewerInsight(app.services, kid, NOW, app.config)
    expect(ins.profile).toEqual({ guid: kid.guid, name: kid.name, isKids: true })
    expect(['ASSIGNED', 'THIN_HISTORY']).toContain(ins.segmentStatus)
    for (const p of ins.segment?.picks ?? []) expect(app.services.catalog.isVisibleTo(kid, p.titleId)).toBe(true)
    for (const p of ins.model.picks) expect(app.services.catalog.isVisibleTo(kid, p.titleId)).toBe(true)
    expect(ins.rows.length).toBeGreaterThan(0)
  })

  it('servisler eksik ya da fırlatıyorsa düşmez', async () => {
    const { app, adult } = await setup()
    const empty = buildViewerInsight({}, adult, NOW)
    expect(empty).toMatchObject({ segmentStatus: 'NO_MODEL', segment: null, run: null, rows: [], subgenres: [] })
    expect(empty.search.modelVersion).toMatch(/^lr-1/)

    const boom = () => {
      throw new Error('servis çöktü')
    }
    const broken = {
      ...app.services,
      viewing: { ...app.services.viewing, factsOfViewer: boom, viewerIdOfProfile: boom },
      audience: { ...app.services.audience, run: boom, ofProfile: boom, explainViewer: boom, topTitles: boom },
      predictions: { ...app.services.predictions, ready: () => true, info: boom, topPicks: boom },
      microgenres: { ...app.services.microgenres, all: boom, revision: boom },
      tagging: { ...app.services.tagging, vocabulary: boom },
    } as unknown as Services
    const ins = buildViewerInsight(broken, adult, NOW, app.config)
    expect(ins.segmentStatus).toBe('NO_MODEL')
    expect(ins.model.picks).toEqual([])
    expect(ins.rows.length).toBeGreaterThan(0)
  })

  it('explainViewer uygulamayan topluluk servisi (sahte): ofProfile sonucu, bileşenler boş', async () => {
    const { app, adult } = await setup()
    const audience = fakeAudience()
    app.services.audience = audience
    audience.setTop(
      'tc_01',
      app.services.catalog.allTitles().map((t) => t.videoId),
    )
    expect(buildViewerInsight(app.services, adult, NOW, app.config).segmentStatus).toBe('NO_HISTORY')
    audience.assign(adult.guid, 'tc_01')
    const ins = buildViewerInsight(app.services, adult, NOW, app.config)
    expect(ins.segmentStatus).toBe('ASSIGNED')
    expect(ins.segment).toMatchObject({ communityId: 'tc_01', similarity: 0.8, why: [], drivers: [], alternatives: [] })
    expect(ins.segment!.picks.length).toBe(INSIGHT_LIMITS.picks)
  })
})

describe('Yönetici paneli: alt tür tanımı', () => {
  it('tür, biçim ve yuvalar okunur biçimde', () => {
    const vocab = {
      version: '2026.01-1',
      scales: [
        {
          key: 'ton',
          name: 'Ton',
          question: '?',
          group: 'TONE' as const,
          levels: [],
          descriptors: [{ key: 'dusundurucu', min: 4, max: 5, adjective: 'Düşündürücü' }],
        },
      ],
      facets: [
        {
          key: 'konu',
          name: 'Konu',
          question: '?',
          slot: 'SUBJECT' as const,
          multi: true,
          max: 3,
          values: [
            { key: 'doga', name: 'Doğa' },
            { key: 'uzay', name: 'Uzay' },
          ],
        },
      ],
      naming: { genreNouns: {}, regions: [], eras: [], order: ['ADJECTIVE' as const] },
    }
    expect(
      describeDefinition(
        {
          core: 'belgesel',
          type: 'MOVIE',
          slots: [
            { slot: 'SUBJECT', key: 'konu:doga' },
            { slot: 'ADJECTIVE', key: 'dusundurucu' },
            { slot: 'PERSON', key: 'buster-keaton' },
          ],
        },
        vocab,
      ),
    ).toMatch(/· Film · Konu: Doğa · Ton: Düşündürücü · Kişi: Buster Keaton$/)
    expect(describeDefinition({ core: 'yok-boyle', type: null, slots: [{ slot: 'REGION', key: 'kore' }] }, null)).toBe(
      'yok-boyle · Köken: kore',
    )
  })
})

describe('Yönetici paneli: REST', () => {
  it('profil yoksa 409 PROFILE_REQUIRED; profil seçiliyse ViewerInsight', async () => {
    const { app } = await setup()
    const anon = await app.inject({ url: ROUTES.STUDIO_INSIGHT })
    expect(anon.statusCode).toBe(409)
    expect(anon.json().error.code).toBe('PROFILE_REQUIRED')

    const login = await app.inject({ method: 'POST', url: ROUTES.LOGIN, payload: {} })
    const cookies: Record<string, string> = {}
    const take = (res: typeof login) => {
      for (const c of res.cookies) if (c.value) cookies[c.name] = c.value
    }
    take(login)
    const boot = login.json<BootContext>()
    const adult = boot.profiles.find((p) => !p.isKids)!
    expect((await app.inject({ url: ROUTES.STUDIO_INSIGHT, cookies })).statusCode).toBe(409)
    take(
      await app.inject({
        method: 'POST',
        url: ROUTES.PROFILE_SWITCH,
        cookies,
        headers: { [HEADERS.AUTH_URL]: boot.authURL! },
        payload: { guid: adult.guid },
      }),
    )
    const res = await app.inject({ url: ROUTES.STUDIO_INSIGHT, cookies })
    expect(res.statusCode).toBe(200)
    expect(res.headers['cache-control']).toBe('no-store')
    const body = res.json<ViewerInsight>()
    expect(body.profile.guid).toBe(adult.guid)
    expect(body.viewerId).toBe(app.services.viewing.viewerIdOfProfile(adult.guid))
    expect(Array.isArray(body.rows)).toBe(true)
  })
})
