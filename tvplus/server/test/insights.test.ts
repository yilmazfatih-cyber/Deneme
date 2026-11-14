/**
 * İçgörüler ve planlayıcı: katalog karması (üst üste binen tür payları, null verim), kırılımlar, zaman çizelgesi
 * birikimi, plan (tam N, tekdüzelik, veri/yargı ağırlığı, maliyet ve bütçe, gerekçeler, boşluklar, beslenmeyen
 * topluluklar), genel bakış (iskelet servislerle) ve REST doğrulaması.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import type { ContentTitle } from '../../shared/content-schema'
import type { CatalogMix, MixRow, PlanResult, StudioOverview, Timeline } from '../../shared/intelligence'
import { insightsInternals } from '../src/services/insights/plugin'
import { largestRemainder, PLAN_NOTE } from '../src/services/insights/plan'
import { acquisitionOf } from '../src/services/insights/labels'
import { createTestApp } from './helpers'
import {
  createFakeMicrogenres,
  createFakeTagging,
  createFakeViewing,
  installFakes,
  makeMicrogenre,
  makeTitle,
  plantArchetypes,
  type FakePlay,
} from './intelligence-fixtures'

const apps: FastifyInstance[] = []
afterEach(async () => {
  while (apps.length) await apps.pop()!.close()
})

const NOW = Date.parse('2026-11-15T12:00:00Z')
const DAY = 86_400_000

/** Sabit katalog: 10 film + 2 dizi; dram ve komedi bazı başlıklarda üst üste biner. */
function catalog(): ContentTitle[] {
  let id = 91_000_000
  const t = (p: Parameters<typeof makeTitle>[0]) => makeTitle({ videoId: (id += 1000), ...p })
  return [
    t({ title: 'd1', genres: ['dram'], origin: { countries: ['TR'], languages: ['tr'] }, addedAt: '2026-09-03' }),
    t({ title: 'd2', genres: ['dram'], origin: { countries: ['TR'], languages: ['tr'] }, addedAt: '2026-09-10' }),
    t({ title: 'd3', genres: ['dram'], origin: { countries: ['US'], languages: ['en'] }, addedAt: '2026-10-01' }),
    t({ title: 'd4', genres: ['dram'], addedAt: '2026-10-05', acquisition: 'ORIGINAL' }),
    t({ title: 'dk1', genres: ['dram', 'komedi'], addedAt: '2026-10-20', youtube: true }),
    t({ title: 'dk2', genres: ['dram', 'komedi'], addedAt: '2026-11-02', licenseName: 'CC BY 4.0' }),
    t({ title: 'b1', genres: ['belgesel'], addedAt: '2026-09-01', rating: '7+' }),
    t({ title: 'b2', genres: ['belgesel'], addedAt: '2026-09-01', leavingAt: '2026-10-15' }),
    t({ title: 'b3', genres: ['belgesel'], addedAt: '2026-11-01', licenseName: 'Kamu malı' }),
    t({ title: 'k1', genres: ['korku'], addedAt: '2026-11-01', rating: '18+' }),
    t({
      type: 'SHOW',
      title: 's1',
      genres: ['komedi'],
      addedAt: '2026-10-01',
      origin: { countries: ['TR'], languages: ['tr'] },
    }),
    t({
      type: 'SHOW',
      title: 's2',
      genres: ['belgesel'],
      addedAt: '2026-10-01',
      origin: { countries: ['GB'], languages: ['en'] },
    }),
  ]
}

const byTitle = (titles: ContentTitle[]) => Object.fromEntries(titles.map((x) => [x.title, x.videoId]))

/** Saat cinsinden oynatmalar: [başlık adı, saat, gün önce] */
function playsOf(titles: ContentTitle[], spec: [string, number, number][]): FakePlay[] {
  const ids = byTitle(titles)
  return spec.map(([name, hours, daysAgo], i) => ({
    viewerId: `v_${i % 3}`,
    titleId: ids[name]!,
    ts: NOW - daysAgo * DAY,
    watchedSec: Math.round(hours * 3600),
  }))
}

async function appWith(titles: ContentTitle[], plays: FakePlay[], extra: Parameters<typeof installFakes>[1] = {}) {
  const app = await createTestApp()
  apps.push(app)
  const viewing = createFakeViewing({ plays })
  installFakes(app, { viewing, tagging: createFakeTagging(), microgenres: createFakeMicrogenres(), titles, ...extra })
  insightsInternals(app).now = () => NOW
  return { app, viewing }
}

const row = (rows: MixRow[], key: string) => rows.find((r) => r.key === key)!

const BASE: [string, number, number][] = [
  ['d1', 10, 5],
  ['d2', 6, 40],
  ['d3', 2, 10],
  ['dk1', 4, 3],
  ['b1', 20, 50],
  ['s1', 8, 2],
  ['s2', 10, 45],
]

describe('içgörüler — katalog karması', () => {
  it('tür payları üst üste biner; verim = izlenme payı / katalog payı', async () => {
    const titles = catalog()
    const { app } = await appWith(titles, playsOf(titles, BASE))
    const mix = app.services.insights.mix()
    expect(mix.totalTitles).toBe(12)
    expect(mix.totalHours).toBe(60)
    const dram = row(mix.byGenre, 'dram')
    expect(dram.titles).toBe(6)
    expect(dram.name).toBe('Dram')
    expect(dram.catalogShare).toBeCloseTo(0.5, 4)
    expect(dram.hours).toBe(22)
    expect(dram.viewShare).toBeCloseTo(22 / 60, 4)
    expect(dram.efficiency!).toBeCloseTo(22 / 60 / 0.5, 2)
    const komedi = row(mix.byGenre, 'komedi')
    expect(komedi.titles).toBe(3)
    expect(komedi.hours).toBe(12)
    // Üst üste binme: tür payları toplamı 1'i aşar; tekil kırılımlarda tam 1
    expect(mix.byGenre.reduce((s, r) => s + r.catalogShare, 0)).toBeGreaterThan(1)
    expect(mix.byGenre.reduce((s, r) => s + r.viewShare, 0)).toBeGreaterThan(1)
    for (const k of ['byType', 'byCountry', 'byLanguage', 'byAcquisition', 'byMaturity'] as const) {
      expect(mix[k].reduce((s, r) => s + r.catalogShare, 0)).toBeCloseTo(1, 3)
      expect(mix[k].reduce((s, r) => s + r.viewShare, 0)).toBeCloseTo(1, 3)
    }
    // İzlenmeyen tür: verim 0 (veri var, izlenme yok)
    expect(row(mix.byGenre, 'korku').efficiency).toBe(0)
    expect(row(mix.byType, 'SHOW')).toMatchObject({ name: 'Diziler', titles: 2, hours: 18 })
  })

  it('ülke, dil, edinim, RTÜK, yerli pay ve kapsam', async () => {
    const titles = catalog()
    const { app } = await appWith(titles, playsOf(titles, BASE))
    const mix = app.services.insights.mix()
    expect(row(mix.byCountry, 'TR')).toMatchObject({ name: 'Türkiye', titles: 3, hours: 24 })
    expect(row(mix.byCountry, 'ZZ')).toMatchObject({ name: 'Bilinmiyor', titles: 7 })
    expect(row(mix.byCountry, 'GB').name).toBe('Birleşik Krallık')
    expect(row(mix.byLanguage, 'en')).toMatchObject({ name: 'İngilizce', titles: 2, hours: 12 })
    expect(row(mix.byLanguage, 'und').name).toBe('Bilinmiyor')
    expect(row(mix.byAcquisition, 'ORIGINAL')).toMatchObject({ name: 'Kendi yapımı', titles: 1 })
    expect(row(mix.byAcquisition, 'EMBED')).toMatchObject({ titles: 1, hours: 4 })
    expect(row(mix.byAcquisition, 'OPEN').titles).toBe(2) // CC BY 4.0 + Kamu malı
    expect(row(mix.byAcquisition, 'LICENSED').titles).toBe(8)
    expect(row(mix.byMaturity, '18+').name).toBe('18+')
    expect(row(mix.byMaturity, 'GENEL').name).toBe('Genel İzleyici')
    expect(mix.local.catalogShare).toBeCloseTo(3 / 12, 4)
    expect(mix.local.viewShare).toBeCloseTo(24 / 60, 4)
    const movies = app.services.insights.mix({ scope: 'MOVIE' })
    expect(movies.scope).toBe('MOVIE')
    expect(movies.totalTitles).toBe(10)
    expect(movies.totalHours).toBe(42)
    expect(movies.byType.map((r) => r.key)).toEqual(['MOVIE'])
    const shows = app.services.insights.mix({ scope: 'SHOW' })
    expect(shows.totalTitles).toBe(2)
    expect(row(shows.byGenre, 'belgesel').viewShare).toBeCloseTo(10 / 18, 4)
  })

  it('izleme penceresi yalnız o aralıktaki saatleri sayar', async () => {
    const titles = catalog()
    const { app } = await appWith(titles, playsOf(titles, BASE))
    const res = await app.inject({ method: 'GET', url: '/api/studio/insights/mix?from=2026-11-01&to=2026-11-15' })
    expect(res.statusCode).toBe(200)
    const mix = res.json<CatalogMix>()
    expect(mix.window).toEqual({ from: '2026-11-01', to: '2026-11-15' })
    expect(mix.totalHours).toBe(24) // d1 10 + d3 2 + dk1 4 + s1 8
    expect(mix.sources).toEqual(['SYNTHETIC'])
  })

  it('izlenme verisi yokken verim null, paylar sıfır', async () => {
    const titles = catalog()
    const { app } = await appWith(titles, [])
    const mix = app.services.insights.mix()
    expect(mix.totalHours).toBe(0)
    expect(mix.byGenre.every((r) => r.efficiency === null && r.viewShare === 0)).toBe(true)
    expect(mix.local).toEqual({ catalogShare: 0.25, viewShare: 0 })
  })

  it('edinim türetme: açık alan → gömme kaynağı → açık lisans → lisanslı', () => {
    expect(acquisitionOf(makeTitle({ genres: ['dram'], acquisition: 'ORIGINAL', youtube: true }))).toBe('ORIGINAL')
    expect(acquisitionOf(makeTitle({ genres: ['dram'], youtube: true, licenseName: 'CC BY 3.0' }))).toBe('EMBED')
    expect(acquisitionOf(makeTitle({ genres: ['dram'], licenseName: 'CC BY 3.0' }))).toBe('OPEN')
    expect(acquisitionOf(makeTitle({ genres: ['dram'], licenseName: 'Kamu malı' }))).toBe('OPEN')
    expect(acquisitionOf(makeTitle({ genres: ['dram'], licenseName: 'Dağıtımcı sözleşmesi' }))).toBe('LICENSED')
    expect(acquisitionOf(makeTitle({ type: 'SHOW', genres: ['dram'], youtube: true }))).toBe('EMBED')
  })
})

describe('içgörüler — zaman çizelgesi', () => {
  it('katalog payı eklenme tarihine göre birikir, ayrılan düşer; izlenme payı o ayın saatleri', async () => {
    const titles = catalog()
    const { app } = await appWith(titles, playsOf(titles, BASE))
    const tl = app.services.insights.timeline({ dimension: 'genre', months: 3 })
    expect(tl.months).toEqual(['2026-09', '2026-10', '2026-11'])
    const s = (k: string) => tl.series.find((x) => x.key === k)!
    // Eylül sonu: d1, d2, b1, b2 → dram 2/4, belgesel 2/4
    expect(s('dram').catalogShare[0]).toBeCloseTo(0.5, 4)
    expect(s('belgesel').catalogShare[0]).toBeCloseTo(0.5, 4)
    // Ekim sonu: b2 ayrıldı; d1,d2,d3,d4,dk1,b1,s1,s2 → dram 5/8
    expect(s('dram').catalogShare[1]).toBeCloseTo(5 / 8, 4)
    expect(s('belgesel').catalogShare[1]).toBeCloseTo(2 / 8, 4)
    // Kasım sonu: tümü − b2 = 11
    expect(s('korku').catalogShare).toEqual([0, 0, round4(1 / 11)])
    // İzlenme — Eylül: b1 20 → belgesel 1 · Ekim: d2 6 + s2 10 · Kasım: d1 10 + d3 2 + dk1 4 + s1 8 = 24
    expect(s('belgesel').viewShare[0]).toBe(1)
    expect(s('dram').viewShare[1]).toBeCloseTo(6 / 16, 4)
    expect(s('belgesel').viewShare[1]).toBeCloseTo(10 / 16, 4)
    expect(s('dram').viewShare[2]).toBeCloseTo(16 / 24, 4)
    expect(s('komedi').viewShare[2]).toBeCloseTo(12 / 24, 4)
    expect(s('korku').viewShare).toEqual([0, 0, 0])
  })

  it('12 aylık çizelge; edinim ve köken boyutları; REST', async () => {
    const titles = catalog()
    const { app } = await appWith(titles, playsOf(titles, BASE))
    const res = await app.inject({ method: 'GET', url: '/api/studio/insights/timeline?dimension=acquisition' })
    expect(res.statusCode).toBe(200)
    const tl = res.json<Timeline>()
    expect(tl.months).toHaveLength(12)
    expect(tl.months[0]).toBe('2025-12')
    expect(tl.months[11]).toBe('2026-11')
    expect(tl.series.map((x) => x.key).sort()).toEqual(['EMBED', 'LICENSED', 'OPEN', 'ORIGINAL'])
    for (const x of tl.series) expect(x.catalogShare).toHaveLength(12)
    // Aylar boyunca payların toplamı (katalog dolu olan aylarda) 1
    const last = tl.series.reduce((sum, x) => sum + x.catalogShare[11]!, 0)
    expect(last).toBeCloseTo(1, 3)
    const origin = app.services.insights.timeline({ dimension: 'origin', months: 2 })
    expect(origin.series.find((x) => x.key === 'TR')!.name).toBe('Türkiye')
  })
})

const round4 = (x: number) => Math.round(x * 10000) / 10000

describe('içgörüler — planlayıcı', () => {
  const plan = (app: FastifyInstance, input: Parameters<FastifyInstance['services']['insights']['plan']>[0]) =>
    app.services.insights.plan(input)
  const slotsOf = (p: PlanResult) => Object.fromEntries(p.rows.map((r) => [r.key, r.slots]))

  it("başlıklar tam N'ye dağıtılır; her satırda gerekçe; sabit not", async () => {
    const titles = catalog()
    const { app } = await appWith(titles, playsOf(titles, BASE))
    for (const n of [1, 2, 7, 20, 33, 1000]) {
      const p = plan(app, { slots: n })
      expect(p.rows.reduce((s, r) => s + r.slots, 0)).toBe(n)
      expect(p.rows.reduce((s, r) => s + r.targetShare, 0)).toBeCloseTo(1, 3)
      expect(p.rows.every((r) => r.reasons.length > 0)).toBe(true)
    }
    const p = plan(app, { slots: 20 })
    expect(p.note).toBe(PLAN_NOTE)
    expect(p.input).toMatchObject({ slots: 20, scope: 'ALL', dataWeight: 0.7 })
    const dram = p.rows.find((r) => r.key === 'dram')!
    expect(dram.name).toBe('Dram')
    expect(dram.demandScore).toBeGreaterThan(0)
    expect(dram.demandScore).toBeLessThanOrEqual(1)
    expect(dram.judgmentScore).toBe(0.5)
    expect(dram.costEfficiency).toBeNull()
    // Belgesel: izlenme payı katalog payının üstünde (30/60 ÷ 4/12 = 1,5)
    const belgesel = p.rows.find((r) => r.key === 'belgesel')!
    expect(belgesel.reasons).toContain('İzlenme payı katalog payının 1,5 katı')
    expect(p.rows.find((r) => r.key === 'korku')!.reasons).toContain(
      'Katalogda izlendiğinden fazla yer tutuyor (0,0 kat)',
    )
    // Satırlar başlık sayısına göre sıralı
    for (let i = 1; i < p.rows.length; i++) expect(p.rows[i]!.slots).toBeLessThanOrEqual(p.rows[i - 1]!.slots)
  })

  it('talep artarsa (diğer girdiler aynı) tür daha az başlık almaz', async () => {
    const titles = catalog()
    const base = playsOf(titles, BASE)
    const { app, viewing } = await appWith(titles, base)
    const before = Array.from({ length: 30 }, (_, i) => slotsOf(plan(app, { slots: i + 1 })).korku!)
    for (const extra of [1, 3, 8, 20]) {
      viewing.addPlays(playsOf(titles, [['k1', extra, 20]]))
      const after = Array.from({ length: 30 }, (_, i) => slotsOf(plan(app, { slots: i + 1 })).korku!)
      after.forEach((v, i) => expect(v).toBeGreaterThanOrEqual(before[i]!))
      before.splice(0, before.length, ...after)
    }
    // Sonunda korku en çok izlenen türlerden: ilk sıralarda
    expect(plan(app, { slots: 20 }).rows[0]!.key).toBe('korku')
  })

  it('veri ağırlığı 1 yargıyı yok sayar; 0 veriyi yok sayar', async () => {
    const titles = catalog()
    const judgment = { korku: 1, dram: -1, spor: 1 }
    const { app, viewing } = await appWith(titles, playsOf(titles, BASE))
    const pure = plan(app, { slots: 20, dataWeight: 1 })
    const withJ = plan(app, { slots: 20, dataWeight: 1, judgment })
    // Yargıda geçen ama katalogda olmayan tür (spor) satır olarak eklenir; slotlar aynı kalır
    const common = (p: PlanResult) => p.rows.filter((r) => r.key !== 'spor').map((r) => [r.key, r.slots, r.targetShare])
    expect(withJ.rows.find((r) => r.key === 'spor')!.slots).toBe(0)
    expect(withJ.rows.find((r) => r.key === 'spor')!.reasons).toContain('Katalogda bu türde başlık yok')
    expect(common(withJ).sort()).toEqual(common(pure).sort())
    // Veri ağırlığı 0: farklı izleme verileriyle aynı dağılım
    const a = slotsOf(plan(app, { slots: 20, dataWeight: 0, judgment }))
    viewing.addPlays(
      playsOf(titles, [
        ['dk2', 50, 1],
        ['b3', 40, 2],
      ]),
    )
    const b = slotsOf(plan(app, { slots: 20, dataWeight: 0, judgment }))
    expect(b).toEqual(a)
    expect(a.korku).toBeGreaterThan(a.dram!)
    expect(a.dram).toBe(0)
    const j = plan(app, { slots: 20, dataWeight: 0.3, judgment })
    expect(j.rows.find((r) => r.key === 'dram')!.reasons).toContain('Editör yargısı: azalt')
    expect(j.rows.find((r) => r.key === 'korku')!.reasons).toContain('Editör yargısı: artır')
    expect(j.rows.find((r) => r.key === 'korku')!.judgmentScore).toBe(1)
  })

  it('maliyet saat/maliyet verimini hesaba katar; bütçe aşılmaz', async () => {
    const titles = catalog()
    const { app } = await appWith(titles, playsOf(titles, BASE))
    const costPerTitle = { dram: 100, belgesel: 20, komedi: 60, korku: 40 }
    const noCost = slotsOf(plan(app, { slots: 20 }))
    const withCost = plan(app, { slots: 20, costPerTitle })
    expect(withCost.rows.reduce((s, r) => s + r.slots, 0)).toBe(20)
    const bel = withCost.rows.find((r) => r.key === 'belgesel')!
    expect(bel.costEfficiency).toBeCloseTo(7.5 / 20, 3) // 30 saat / 4 başlık / 20
    expect(bel.slots).toBeGreaterThanOrEqual(noCost.belgesel!)
    expect(withCost.rows.find((r) => r.key === 'dram')!.slots).toBeLessThanOrEqual(noCost.dram!)
    expect(bel.reasons).toContain('Maliyetine göre çok izleniyor')
    const full = withCost.rows.reduce((s, r) => s + r.slots * costPerTitle[r.key as keyof typeof costPerTitle], 0)
    const budget = Math.floor(full / 2)
    const capped = plan(app, { slots: 20, costPerTitle, budget })
    const spend = capped.rows.reduce(
      (s, r) => s + r.slots * (costPerTitle[r.key as keyof typeof costPerTitle] ?? 55),
      0,
    )
    expect(spend).toBeLessThanOrEqual(budget)
    const total = capped.rows.reduce((s, r) => s + r.slots, 0)
    expect(total).toBeLessThan(20)
    expect(total).toBeGreaterThan(0)
    expect(capped.rows.some((r) => r.reasons.some((x) => x.startsWith('Bütçe sınırı:')))).toBe(true)
    // Bol bütçe: tam N
    const rich = plan(app, { slots: 20, costPerTitle, budget: 1e9 })
    expect(rich.rows.reduce((s, r) => s + r.slots, 0)).toBe(20)
  })

  it('son 4 haftadaki eğilim gerekçeye ve talebe girer', async () => {
    const titles = catalog()
    const spec: [string, number, number][] = [
      ['d1', 10, 40],
      ['d2', 10, 45],
      ['s1', 2, 35],
      ['s1', 12, 3],
      ['d3', 2, 5],
    ]
    const { app } = await appWith(titles, playsOf(titles, spec))
    const p = plan(app, { slots: 10 })
    expect(p.rows.find((r) => r.key === 'komedi')!.reasons).toContain('Son 4 haftada talep artıyor')
    expect(p.rows.find((r) => r.key === 'dram')!.reasons).toContain('Son 4 haftada talep azalıyor')
  })

  it('boşluklar: talebi yüksek, başlığı az mikro türler', async () => {
    const titles = catalog()
    const ids = byTitle(titles)
    const micro = [
      makeMicrogenre('mg_az', 'Belgesel Dizileri', 'belgesel', [ids.b1!, ids.s2!], 1),
      makeMicrogenre('mg_cok', 'Dramlar', 'dram', [ids.d1!, ids.d2!, ids.d3!, ids.d4!, ids.dk1!, ids.dk2!], 1),
      makeMicrogenre('mg_ayni', 'Aynı Küme', 'belgesel', [ids.s2!, ids.b1!], 2),
    ]
    const { app } = await appWith(titles, playsOf(titles, BASE), { microgenres: createFakeMicrogenres(micro) })
    const p = plan(app, { slots: 10 })
    expect(p.gaps.map((g) => g.microgenreId)).toEqual(['mg_az']) // aynı başlık kümesi bir kez
    expect(p.gaps[0]!.size).toBe(2)
    expect(p.gaps[0]!.demandLift).toBeCloseTo(30 / 60 / (2 / 12), 2)
  })

  it('yeterince beslenmeyen topluluklar: izlenme payı uygun katalog payından belirgin büyük', async () => {
    // Büyük ama dar havuzlu topluluk (korku: 2 başlık, izleyicilerin yarısı) + geniş havuzlu iki topluluk
    const titles = [
      ...Array.from({ length: 2 }, () => makeTitle({ genres: ['korku'] })),
      ...Array.from({ length: 12 }, () => makeTitle({ genres: ['belgesel', 'doga-bilim'] })),
      ...Array.from({ length: 12 }, () => makeTitle({ genres: ['komedi'] })),
    ]
    const pool = (g: string) => titles.filter((t) => t.genres[0] === g).map((t) => t.videoId)
    const planted = plantArchetypes(
      [
        { name: 'korku', pool: pool('korku'), viewers: 100, titlesPerViewer: [2, 2], hoursScale: 2 },
        { name: 'belgesel', pool: pool('belgesel'), viewers: 50 },
        { name: 'komedi', pool: pool('komedi'), viewers: 50 },
      ],
      { seed: 9, allTitles: [], startTs: NOW - 30 * DAY, days: 25 },
    )
    const { app } = await appWith(titles, planted.plays)
    expect(app.services.audience.recompute().k).toBe(3)
    const p = plan(app, { slots: 10 })
    expect(p.underserved).toHaveLength(1)
    const u = p.underserved[0]!
    expect(app.services.audience.get(u.communityId)!.topTitles.every((t) => pool('korku').includes(t.titleId))).toBe(
      true,
    )
    expect(u.supplyShare).toBeCloseTo(2 / 26, 3)
    expect(u.demandShare).toBeGreaterThan(0.3)
  })

  it('en büyük kalan: toplam her zaman tam; eşitlikte puan sonra anahtar', () => {
    const m = largestRemainder(
      [
        { key: 'a', share: 1, tiebreak: 0 },
        { key: 'b', share: 1, tiebreak: 1 },
        { key: 'c', share: 1, tiebreak: 0 },
      ],
      2,
    )
    expect(Object.fromEntries(m)).toEqual({ a: 1, b: 1, c: 0 })
    expect([...largestRemainder([{ key: 'a', share: 0, tiebreak: 0 }], 5).values()]).toEqual([5])
  })
})

describe('içgörüler — genel bakış ve iskelet servisler', () => {
  it('iskelet servislerle çökmez: genel bakış, karma, çizelge, plan', async () => {
    const app = await createTestApp()
    apps.push(app)
    const ov = await app.inject({ method: 'GET', url: '/api/studio/overview' })
    expect(ov.statusCode).toBe(200)
    const o = ov.json<StudioOverview>()
    const all = app.services.catalog.allTitles()
    expect(o.catalog.titles).toBe(all.length)
    expect(o.catalog.movies + o.catalog.shows).toBe(all.length)
    expect(o.tagging.consensus + o.tagging.sampleOnly + o.tagging.modelOnly + o.tagging.untagged).toBe(all.length)
    expect(Array.isArray(o.sources)).toBe(true)
    expect(o.audience === null || typeof o.audience.k === 'number').toBe(true)
    const mix = await app.inject({ method: 'GET', url: '/api/studio/insights/mix?type=MOVIE' })
    expect(mix.statusCode).toBe(200)
    expect(mix.json<CatalogMix>().totalTitles).toBe(all.filter((t) => t.type === 'MOVIE').length)
    const tl = await app.inject({ method: 'GET', url: '/api/studio/insights/timeline?dimension=genre&months=6' })
    expect(tl.statusCode).toBe(200)
    const pl = await app.inject({ method: 'POST', url: '/api/studio/plan', payload: { slots: 10 } })
    expect(pl.statusCode).toBe(200)
    const p = pl.json<PlanResult>()
    expect(p.rows.reduce((s, r) => s + r.slots, 0)).toBe(10)
    expect(p.gaps).toEqual([])
    expect(p.note).toBe(PLAN_NOTE)
  })

  it('genel bakış sahte servislerin sayılarını toplar', async () => {
    const titles = catalog()
    const tagging = createFakeTagging({
      [titles[0]!.videoId]: { basis: 'CONSENSUS' },
      [titles[1]!.videoId]: { basis: 'MODEL' },
    })
    const { app } = await appWith(titles, playsOf(titles, BASE), { tagging })
    app.services.audience.recompute()
    const o = (await app.inject({ method: 'GET', url: '/api/studio/overview' })).json<StudioOverview>()
    expect(o.catalog).toEqual({ titles: 12, movies: 10, shows: 2 })
    expect(o.tagging).toMatchObject({
      consensus: 1,
      modelOnly: 1,
      sampleOnly: 0,
      untagged: 10,
      rubricVersion: '2026.11-1',
    })
    expect(o.sources[0]!.source).toBe('SYNTHETIC')
    expect(o.audience!.viewers).toBeGreaterThan(0)
  })
})

describe('içgörüler — REST doğrulaması', () => {
  it('sorgu ve gövde katı doğrulanır; iletiler Türkçe ve alana özgü', async () => {
    const titles = catalog()
    const { app } = await appWith(titles, playsOf(titles, BASE))
    const get = (url: string) => app.inject({ method: 'GET', url })
    const post = (payload: unknown) =>
      app.inject({ method: 'POST', url: '/api/studio/plan', payload: payload as Record<string, unknown> })
    const cases: [Promise<{ statusCode: number; json: () => { error: { code: string; message: string } } }>, RegExp][] =
      [
        [get('/api/studio/insights/mix?type=FILM'), /'type'/],
        [get('/api/studio/insights/mix?from=2026-13-01'), /'from'/],
        [get('/api/studio/insights/mix?from=2026-02-30'), /'from'/],
        [get('/api/studio/insights/mix?from=2026-11-10&to=2026-11-01'), /'to'/],
        [get('/api/studio/insights/mix?tip=MOVIE'), /bilinmeyen alan \(tip\)/],
        [get('/api/studio/insights/mix?type=MOVIE&type=SHOW'), /'type'/],
        [get('/api/studio/insights/timeline?dimension=yil'), /'dimension'/],
        [get('/api/studio/insights/timeline?months=0'), /'months'/],
        [get('/api/studio/insights/timeline?months=61'), /'months'/],
        [get('/api/studio/insights/timeline?months=abc'), /'months'/],
        [post({}), /'slots'/],
        [post({ slots: 0 }), /'slots'/],
        [post({ slots: 2.5 }), /'slots'/],
        [post({ slots: 5, dataWeight: 1.5 }), /'dataWeight'/],
        [post({ slots: 5, scope: 'FILM' }), /'scope'/],
        [post({ slots: 5, judgment: { uzay: 1 } }), /'judgment'/],
        [post({ slots: 5, judgment: { dram: 3 } }), /'judgment'/],
        [post({ slots: 5, costPerTitle: { dram: 0 } }), /'costPerTitle'/],
        [post({ slots: 5, budget: 100 }), /'budget'/],
        [post({ slots: 5, fazla: 1 }), /bilinmeyen alan \(fazla\)/],
        [post([1, 2]), /JSON nesnesi/],
      ]
    for (const [p, re] of cases) {
      const res = await p
      expect(res.statusCode).toBe(400)
      expect(res.json().error.code).toBe('VALIDATION_FAILED')
      expect(res.json().error.message).toMatch(re)
    }
    const ok = await post({
      slots: 5,
      scope: 'MOVIE',
      dataWeight: 0.5,
      judgment: { dram: 0.5 },
      costPerTitle: { dram: 10 },
      budget: 1000,
    })
    expect(ok.statusCode).toBe(200)
    expect(ok.json<PlanResult>().input).toMatchObject({ slots: 5, scope: 'MOVIE', dataWeight: 0.5 })
    expect((await get('/api/studio/insights/mix?type=ALL&from=2026-01-01&to=2026-12-31')).statusCode).toBe(200)
  })
})
