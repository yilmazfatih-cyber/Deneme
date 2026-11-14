/**
 * Tahmin modeli: doğrusal cebir, ALS, bölmeler, ölçümler, tabanlara karşı başarı, içerik kulesi (soğuk başlangıç),
 * fold-in, eşleşme yüzdesi, açıklama, çocuk görünürlüğü, kalıcılık, belirlenimcilik, arka plan eğitimi, REST.
 * Diğer servisler sahte (server/test/intelligence-fixtures.ts → plantTasteWorld); zevk toplulukları gerçek servistir.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { HEADERS } from '../../shared/constants'
import type { PredictionModelInfo, TrainingRun, ViewerPrediction, ViewingFact } from '../../shared/intelligence'
import type { BootContext } from '../../shared/types'
import { alsLoss, trainAls } from '../src/services/predictions/als'
import {
  buildCsr,
  buildInteractions,
  DEFAULT_SPLIT,
  ROLE_COLD,
  ROLE_TEST,
  splitInteractions,
} from '../src/services/predictions/data'
import {
  cholesky,
  choleskySolve,
  conjugateGradient,
  gram,
  matVec,
  mulberry32,
  solveSpd,
} from '../src/services/predictions/linalg'
import { MetricAccumulator, topK } from '../src/services/predictions/metrics'
import { predictionInternals } from '../src/services/predictions/plugin'
import { matchOf } from '../src/services/predictions/ranker'
import { runSync } from '../src/services/predictions/service'
import { createTestApp } from './helpers'
import {
  createFakeMicrogenres,
  createFakeTagging,
  createFakeViewing,
  installFakes,
  plantTasteWorld,
  type FakeViewing,
  type TasteWorld,
} from './intelligence-fixtures'

const apps: FastifyInstance[] = []
afterEach(async () => {
  while (apps.length) await apps.pop()!.close()
})

async function appWithWorld(
  w: TasteWorld,
  overrides: Parameters<typeof createTestApp>[0] = {},
): Promise<{ app: FastifyInstance; viewing: FakeViewing }> {
  const app = await createTestApp(overrides)
  const viewing = createFakeViewing({ facts: w.facts })
  installFakes(app, {
    viewing,
    tagging: createFakeTagging(w.tags),
    microgenres: createFakeMicrogenres(w.microgenres),
    titles: w.titles,
  })
  return { app, viewing }
}

/** Profilin sahte izleme olguları (FakeViewing: viewerIdOfProfile = 'v_profil_' + guid) */
function profileFacts(guid: string, titleIds: number[], ts = Date.parse('2026-10-20T20:00:00Z')): ViewingFact[] {
  return titleIds.map((titleId, k) => ({
    viewerId: `v_profil_${guid}`,
    titleId,
    source: 'TVPLUS',
    plays: 1,
    watchedSec: 3000,
    completions: 1,
    firstTs: ts + k * 60_000,
    lastTs: ts + k * 60_000,
    inList: false,
    rating: null,
    engagement: 0.9,
  }))
}

/* ═════════════ doğrusal cebir ═════════════ */

describe('tahmin modeli — doğrusal cebir', () => {
  const spd = (n: number, seed: number) => {
    const r = mulberry32(seed)
    const m = new Float64Array(n * n)
    for (let k = 0; k < m.length; k++) m[k] = r() - 0.5
    const a = new Float64Array(n * n)
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        let s = 0
        for (let k = 0; k < n; k++) s += m[i * n + k]! * m[j * n + k]!
        a[i * n + j] = s + (i === j ? 0.5 : 0)
      }
    return a
  }

  it('Cholesky çözümü A·x = b sağlar; elle hesaplanmış 2×2 örnek', () => {
    const a = Float64Array.from([4, 2, 2, 3])
    expect(cholesky(a, 2)).toBe(true)
    expect(a[0]).toBeCloseTo(2, 12)
    expect(a[2]).toBeCloseTo(1, 12)
    expect(a[3]).toBeCloseTo(Math.SQRT2, 12)
    const b = Float64Array.from([2, 1])
    choleskySolve(a, 2, b)
    // 4x + 2y = 2, 2x + 3y = 1 → x = 0.5, y = 0
    expect(b[0]).toBeCloseTo(0.5, 12)
    expect(b[1]).toBeCloseTo(0, 12)
    const big = spd(12, 3)
    const rhs = Float64Array.from({ length: 12 }, (_, k) => k - 5)
    const x = Float64Array.from(rhs)
    solveSpd(Float64Array.from(big), 12, x)
    const back = new Float64Array(12)
    matVec(big, 12, x, back)
    for (let k = 0; k < 12; k++) expect(back[k]).toBeCloseTo(rhs[k]!, 9)
  })

  it('pozitif tanımlı olmayan matris reddedilir; solveSpd tekil matriste köşegeni güçlendirip çözer', () => {
    expect(cholesky(Float64Array.from([1, 2, 2, 1]), 2)).toBe(false)
    const b = Float64Array.from([1, 1])
    solveSpd(Float64Array.from([1, 1, 1, 1]), 2, b)
    expect(Number.isFinite(b[0]!) && Number.isFinite(b[1]!)).toBe(true)
  })

  it('eşlenik gradyan n adımda tam çözüme ulaşır; Gram matrisi YᵀY', () => {
    const n = 8
    const a = spd(n, 9)
    const b = Float64Array.from({ length: n }, (_, k) => Math.sin(k))
    const exact = Float64Array.from(b)
    solveSpd(Float64Array.from(a), n, exact)
    const x = new Float64Array(n)
    const scratch = { r: new Float64Array(n), p: new Float64Array(n), ap: new Float64Array(n) }
    conjugateGradient((p, out) => matVec(a, n, p, out), b, x, 3 * n, scratch)
    for (let k = 0; k < n; k++) expect(x[k]).toBeCloseTo(exact[k]!, 6)
    const y = Float32Array.from([1, 2, 3, 4, 5, 6])
    const g = gram(y, 3, 2, new Float64Array(4))
    expect(Array.from(g)).toEqual([1 + 9 + 25, 2 + 12 + 30, 2 + 12 + 30, 4 + 16 + 36])
  })
})

/* ═════════════ ölçümler ═════════════ */

describe('tahmin modeli — ölçüm hesabı', () => {
  it('topK: büyükten küçüğe, eşitlikte küçük dizin, izin verilmeyen atlanır', () => {
    const s = [0.5, 0.9, 0.9, 0.1, 0.7, NaN]
    expect(topK(s, 3, () => true)).toEqual([1, 2, 4])
    expect(topK(s, 10, (t) => t !== 2)).toEqual([1, 4, 0, 3])
  })

  it('Recall@10, NDCG@10, isabet ve kapsam elle hesaplanan değerlerle aynı', () => {
    const acc = new MetricAccumulator(20)
    // izleyici 1: hedefler {3, 7}; sıralama 3 başta, 7 üçüncü
    acc.add([3, 1, 7, 2, 4, 5, 6, 8, 9, 10], new Set([3, 7]))
    // izleyici 2: hedef {19}; listede yok
    acc.add([1, 2, 3, 4, 5, 6, 8, 9, 10, 11], new Set([19]))
    const r = acc.result()
    expect(r.recallAt10).toBeCloseTo((1 + 0) / 2, 4)
    const dcg = 1 / Math.log2(2) + 1 / Math.log2(4)
    const idcg = 1 / Math.log2(2) + 1 / Math.log2(3)
    expect(r.ndcgAt10).toBeCloseTo(Math.round(((dcg / idcg + 0) / 2) * 10_000) / 10_000, 4)
    expect(r.hitRateAt10).toBe(0.5)
    expect(r.coverage).toBeCloseTo(11 / 20, 4)
    // 10'dan çok hedef: recall paydası min(10, |hedef|)
    const many = new MetricAccumulator(30)
    many.add([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], new Set(Array.from({ length: 15 }, (_, k) => k)))
    expect(many.result().recallAt10).toBe(1)
    expect(many.result().ndcgAt10).toBe(1)
  })

  it('eşleşme yüzdesi 1–99 arasında ve logite göre tekdüze', () => {
    let prev = 0
    for (let z = -12; z <= 12; z += 0.25) {
      const m = matchOf(z)
      expect(m).toBeGreaterThanOrEqual(prev)
      expect(m).toBeGreaterThanOrEqual(1)
      expect(m).toBeLessThanOrEqual(99)
      prev = m
    }
    expect(matchOf(0)).toBe(50)
  })
})

/* ═════════════ veri, bölmeler, ALS ═════════════ */

describe('tahmin modeli — bölmeler ve ALS', () => {
  const world = plantTasteWorld({ seed: 11, viewersPerArchetype: 60 })
  const titleIds = world.titles.map((t) => t.videoId)
  const data = runSync(buildInteractions(world.facts, titleIds))

  it('zamana göre bölme sızdırmaz: her sınama başlığı kesitten sonra biter, soğuk başlığın hiçbir etkileşimi eğitime girmez', () => {
    const split = runSync(splitInteractions(data, { ...DEFAULT_SPLIT, seed: 5 }))
    expect(split.coldTitles).toBeGreaterThan(0)
    let tested = 0
    for (let v = 0; v < data.viewerIds.length; v++) {
      let maxPre = -Infinity
      let minTest = Infinity
      let nonCold = 0
      let nTest = 0
      for (let q = data.ptr[v]!; q < data.ptr[v + 1]!; q++) {
        const cold = split.cold[data.i[q]!] === 1
        expect(cold).toBe(split.role[q] === ROLE_COLD)
        if (cold) continue
        nonCold++
        if (split.role[q] === ROLE_TEST) {
          nTest++
          minTest = Math.min(minTest, data.lastTs[q]!)
        } else maxPre = Math.max(maxPre, data.lastTs[q]!)
      }
      if (nonCold >= DEFAULT_SPLIT.minHistory) {
        expect(nTest).toBeGreaterThanOrEqual(1)
        expect(nTest).toBe(Math.max(1, Math.round(DEFAULT_SPLIT.testShare * nonCold)))
        expect(minTest).toBeGreaterThanOrEqual(maxPre)
        expect(split.testCutoff[v]).toBe(maxPre)
        tested++
      } else expect(nTest).toBe(0)
    }
    expect(tested).toBeGreaterThan(100)
    // aynı tohum → aynı bölme; farklı tohum → farklı soğuk başlıklar
    const again = runSync(splitInteractions(data, { ...DEFAULT_SPLIT, seed: 5 }))
    expect(Buffer.from(again.role).equals(Buffer.from(split.role))).toBe(true)
    const other = runSync(splitInteractions(data, { ...DEFAULT_SPLIT, seed: 6 }))
    expect(Buffer.from(other.cold).equals(Buffer.from(split.cold))).toBe(false)
  })

  it('ALS kaybı her yinelemede düşer (Cholesky ve eşlenik gradyan) ve ekilmiş yapıyı bulur', () => {
    const { byViewer, byTitle } = runSync(buildCsr(data, () => true))
    for (const solver of ['cholesky', 'cg'] as const) {
      const res = runSync(
        trainAls(byViewer, byTitle, { factors: 8, iterations: 8, regularization: 1, alpha: 20, seed: 3, solver }),
      )
      expect(res.solver).toBe(solver)
      for (let k = 1; k < res.loss.length; k++) expect(res.loss[k]!).toBeLessThanOrEqual(res.loss[k - 1]! + 1e-6)
      expect(res.loss[res.loss.length - 1]!).toBeLessThan(res.loss[0]! * 0.9)
      // kayıp işlevi bağımsız hesapla aynı
      const again = runSync(alsLoss(byViewer, res.x, res.y, 8, 1, 20))
      expect(again).toBeCloseTo(res.loss[res.loss.length - 1]!, 5)
      // ekilmiş yapı: izleyicinin en yüksek puanlı 5 başlığının çoğu kendi arketip havuzunda
      let inPool = 0
      let total = 0
      for (let v = 0; v < data.viewerIds.length; v += 7) {
        const pool = new Set(world.pools.get(world.truth.get(data.viewerIds[v]!)!)!)
        const scores = Array.from({ length: data.titleIds.length }, (_, t) => {
          let s = 0
          for (let c = 0; c < 8; c++) s += res.x[v * 8 + c]! * res.y[t * 8 + c]!
          return s
        })
        for (const t of topK(scores, 5, () => true)) {
          total++
          if (pool.has(data.titleIds[t]!)) inPool++
        }
      }
      expect(inPool / total).toBeGreaterThan(0.85)
    }
  })
})

/* ═════════════ eğitilmiş model (paylaşılan) ═════════════ */

describe('tahmin modeli — eğitim, ölçüm ve sunum', () => {
  const world = plantTasteWorld({ seed: 7, adultEvery: 7 })
  let app: FastifyInstance
  let viewing: FakeViewing
  let run: TrainingRun & { coldStartPopularity: { ndcgAt10: number } | null; modelHash: string | null }
  beforeAll(async () => {
    const r = await appWithWorld(world)
    app = r.app
    viewing = r.viewing
    run = await predictionInternals(app).trainNow({ seed: 3 })
  }, 60_000)
  afterAll(async () => {
    await app.close()
  })

  it('model hazır; kart sentetik veriyi söyler, sıralayıcı ağırlıkları ve içerik işaretleri dolu', () => {
    expect(run.status).toBe('DONE')
    expect(run.error).toBeNull()
    const info: PredictionModelInfo = app.services.predictions.info()
    expect(info.ready).toBe(true)
    expect(info.trainedAt).not.toBeNull()
    expect(info.note).toContain('SENTETİK')
    expect(info.features.map((f) => f.name)).toEqual([
      'isbirlikci',
      'icerik',
      'populerlik',
      'yenilik',
      'topluluk',
      'yarim',
      'listede',
    ])
    expect(info.features.some((f) => f.weight !== 0)).toBe(true)
    expect(info.contentSignals.tags).toBe(true)
    expect(info.contentSignals.microgenres).toBe(true)
    expect(run.viewers).toBe(world.truth.size)
    expect(run.interactions).toBe(world.facts.length)
    expect(run.loss.length).toBe(run.params.iterations)
  })

  it('model popülerlik ve tür yakınlığı tabanlarını açık farkla geçer (sınama kümesi)', () => {
    const m = run.metrics!
    expect(m.model.recallAt10).toBeGreaterThan(m.popularity.recallAt10 + 0.25)
    expect(m.model.recallAt10).toBeGreaterThan(m.genreAffinity.recallAt10 + 0.1)
    expect(m.model.ndcgAt10).toBeGreaterThan(m.genreAffinity.ndcgAt10 + 0.1)
    expect(m.model.hitRateAt10).toBeGreaterThan(m.popularity.hitRateAt10)
    expect(m.model.coverage).toBeGreaterThan(m.popularity.coverage)
  })

  it('soğuk başlangıç: eğitimde hiç görülmemiş başlıklar içerik kulesiyle popülerlikten iyi sıralanır', () => {
    const m = run.metrics!
    expect(m.coldStart).not.toBeNull()
    expect(m.coldStart!.ndcgAt10).toBeGreaterThan(run.coldStartPopularity!.ndcgAt10 + 0.1)
  })

  it('eğitimde etkileşimi olmayan yeni başlık, arketipinin izleyicilerinde yeni başlıklar arasında ilk ve üst dilimde', async () => {
    // Her havuza etkileşimsiz bir başlık eklenmiş dünya (yalnız içerik kulesi puanlayabilir)
    const w2 = plantTasteWorld({ seed: 7, perPool: 15 })
    const fresh = new Set<number>()
    for (const pool of w2.pools.values()) fresh.add(pool[pool.length - 1]!)
    const facts = w2.facts.filter((f) => !fresh.has(f.titleId))
    const { app: a2 } = await appWithWorld({ ...w2, facts })
    apps.push(a2)
    const impl = predictionInternals(a2)
    await impl.trainNow({ seed: 3 })
    let firstAmongNew = 0
    let relRank = 0
    let n = 0
    for (const [arch, pool] of w2.pools) {
      const newTitle = pool[pool.length - 1]!
      const viewers = [...w2.truth].filter(([, a]) => a === arch).slice(0, 10)
      for (const [viewerId] of viewers) {
        const picks = impl.predict({ viewerId }, 100).picks
        const rank = picks.findIndex((x) => x.titleId === newTitle)
        expect(rank).toBeGreaterThanOrEqual(0)
        const firstNew = picks.find((x) => fresh.has(x.titleId))!
        if (firstNew.titleId === newTitle) firstAmongNew++
        relRank += rank / picks.length
        n++
      }
    }
    expect(firstAmongNew / n).toBeGreaterThan(0.9)
    // Katalogdaki yeri: ortalama ilk %35 (önünde yalnız kendi havuzunun izlenmemişleri ve genel popülerler kalır)
    expect(relRank / n).toBeLessThan(0.35)
  })

  it('geçmişsiz profil: match null, scores boş; topPicks kişisel olmayan yedek (match 0)', () => {
    const p = app.services.predictions
    const t = world.titles[0]!.videoId
    expect(p.match('yeni-profil', t)).toBeNull()
    expect(p.scores('yeni-profil', [t]).size).toBe(0)
    expect(p.explain('yeni-profil', t)).toBeNull()
    const picks = p.topPicks('yeni-profil', 5)
    expect(picks.length).toBe(5)
    expect(picks.every((x) => x.match === 0)).toBe(true)
  })

  it('fold-in: birkaç oynatmadan sonra tahminler kişiselleşir (yeniden eğitim yok)', () => {
    const p = app.services.predictions
    const revBefore = p.revision()
    const pool = world.pools.get('uzay')!
    viewing.setFacts([...world.facts, ...profileFacts('belgeselci', pool.slice(0, 3))])
    const picks = p.topPicks('belgeselci', 6, { excludeWatched: true })
    const inPool = picks.filter((x) => pool.includes(x.titleId)).length
    expect(inPool).toBeGreaterThanOrEqual(5)
    expect(picks.every((x) => !pool.slice(0, 3).includes(x.titleId))).toBe(true)
    const m = p.match('belgeselci', pool[5]!)
    expect(m).not.toBeNull()
    const other = world.pools.get('romantik')![0]!
    expect(m!).toBeGreaterThan(p.match('belgeselci', other)!)
    expect(p.revision()).toBe(revBefore)
    viewing.setFacts(world.facts)
  })

  it('eşleşme yüzdesi tek izleyici için katalog boyunca yayılır ve puanla tekdüze', () => {
    const impl = predictionInternals(app)
    const viewerId = [...world.truth.keys()][3]!
    const all = impl.predict({ viewerId }, 100).picks
    expect(all.length).toBeGreaterThan(50)
    const matches = all.map((x) => x.match)
    expect(Math.max(...matches) - Math.min(...matches)).toBeGreaterThanOrEqual(50)
    expect(matches.filter((m) => m >= 99).length / matches.length).toBeLessThan(0.3)
    for (let k = 1; k < all.length; k++) {
      expect(all[k]!.score).toBeLessThanOrEqual(all[k - 1]!.score)
      expect(all[k]!.match).toBeLessThanOrEqual(all[k - 1]!.match)
    }
  })

  it('açıklama: parçaların katkıları logite toplanır; becauseOf izlenenlerden; Türkçe gerekçe', () => {
    const impl = predictionInternals(app)
    const viewerId = [...world.truth.keys()][3]!
    const pred: ViewerPrediction = impl.predict({ viewerId }, 3)
    const top = pred.picks[0]!
    const e = impl.explainFor({ viewerId }, top.titleId)!
    expect(e).not.toBeNull()
    const sum = e.parts.reduce((s, x) => s + x.contribution, 0)
    expect(sum).toBeCloseTo(e.score, 4)
    expect(e.score).toBeCloseTo(top.score, 5)
    expect(e.match).toBe(top.match)
    const history = new Set(pred.history.map((h) => h.titleId))
    expect(e.becauseOf.length).toBeGreaterThan(0)
    for (const b of e.becauseOf) expect(history.has(b.titleId)).toBe(true)
    expect(e.reasons.length).toBeGreaterThan(0)
    expect(e.reasons.join(' ')).toMatch(/İzlediğin|topluluğ|Yeni|Çok|benziyor|Zevkine/)
  })

  it('çocuk profili 18+ başlıkları görmez (topPicks, match, scores)', async () => {
    const login = await app.inject({ method: 'POST', url: '/api/login' })
    const kid = login.json<BootContext>().profiles.find((p) => p.isKids)!
    expect(kid).toBeDefined()
    const adult = world.titles.filter((t) => t.maturity.rating === '18+').map((t) => t.videoId)
    expect(adult.length).toBeGreaterThan(0)
    const p = app.services.predictions
    viewing.setFacts([...world.facts, ...profileFacts(kid.guid, world.pools.get('savas')!.slice(0, 3))])
    const picks = p.topPicks(kid.guid, 100)
    expect(picks.length).toBeGreaterThan(0)
    expect(picks.some((x) => adult.includes(x.titleId))).toBe(false)
    expect(p.match(kid.guid, adult[0]!)).toBeNull()
    expect(p.scores(kid.guid, adult).size).toBe(0)
    viewing.setFacts(world.facts)
  })

  it('topPicks türe göre süzer', () => {
    const viewerId = [...world.truth.keys()].find((v) => world.truth.get(v) === 'sitcom')!
    const guid = 'dizi-sever'
    const p = app.services.predictions
    viewing.setFacts([...world.facts, ...profileFacts(guid, world.pools.get('sitcom')!.slice(0, 2))])
    const shows = p.topPicks(guid, 10, { type: 'SHOW' })
    expect(shows.length).toBeGreaterThan(0)
    for (const s of shows) expect(world.titles.find((t) => t.videoId === s.titleId)!.type).toBe('SHOW')
    expect(viewerId).toBeDefined()
    viewing.setFacts(world.facts)
  })
})

/* ═════════════ yaşam döngüsü ═════════════ */

describe('tahmin modeli — kalıcılık, belirlenimcilik, yeniden eğitim kararı', () => {
  it('kalıcılık: yeniden açılışta model eğitilmeden yüklenir, tahminler aynı', async () => {
    const world = plantTasteWorld({ seed: 21, viewersPerArchetype: 50 })
    const dataDir = mkdtempSync(join(tmpdir(), 'tvplus-tahmin-'))
    const { app: a1, viewing: v1 } = await appWithWorld(world, { dataDir })
    apps.push(a1)
    expect(a1.services.predictions.ready()).toBe(false)
    await predictionInternals(a1).trainNow({ seed: 4 })
    v1.setFacts([...world.facts, ...profileFacts('kalici', world.pools.get('gerilim')!.slice(0, 2))])
    const before = a1.services.predictions.topPicks('kalici', 10)
    const ex1 = a1.services.predictions.explain('kalici', before[0]!.titleId)
    const runs1 = predictionInternals(a1).runs().length

    const { app: a2, viewing: v2 } = await appWithWorld(world, { dataDir })
    apps.push(a2)
    v2.setFacts(v1.facts())
    const impl2 = predictionInternals(a2)
    expect(a2.services.predictions.ready()).toBe(true)
    expect(impl2.busy()).toBe(false)
    expect(a2.services.predictions.topPicks('kalici', 10)).toEqual(before)
    expect(a2.services.predictions.explain('kalici', before[0]!.titleId)).toEqual(ex1)
    expect(impl2.runs().length).toBe(runs1)
    // veri anlamlı değişmedi → yeniden eğitim yok (iki profil olgusu < %5)
    expect(impl2.checkNow().decision).toBe('unchanged')
    expect(impl2.busy()).toBe(false)
  }, 60_000)

  it('anlamlı değişiklikte yeniden eğitim kararı; küçük değişiklikte değil', async () => {
    const world = plantTasteWorld({ seed: 22, viewersPerArchetype: 40 })
    const { app, viewing } = await appWithWorld(world)
    apps.push(app)
    const impl = predictionInternals(app)
    expect(impl.checkNow().decision).toBe('train')
    await impl.idle()
    expect(impl.ready()).toBe(true)
    viewing.setFacts([...world.facts, ...profileFacts('az', [world.titles[0]!.videoId])])
    expect(impl.checkNow().decision).toBe('unchanged')
    const more = plantTasteWorld({ seed: 23, viewersPerArchetype: 10 }).facts.map((f) => ({
      ...f,
      viewerId: `${f.viewerId}_ek`,
      titleId: world.titles[world.titles.findIndex((t) => t.title.endsWith(' 1'))]!.videoId,
    }))
    viewing.setFacts([...world.facts, ...more])
    const r = impl.checkNow()
    expect(r.decision).toBe('train')
    expect(r.reason).toMatch(/etkileşim|izleyici/)
    await impl.idle()
    expect(impl.runs().filter((x) => x.status === 'DONE').length).toBe(2)
  }, 60_000)

  it('belirlenimcilik: aynı veri + tohum → aynı ağırlıklar ve ölçümler; başka tohum → farklı', async () => {
    const world = plantTasteWorld({ seed: 31, viewersPerArchetype: 40 })
    const { app } = await appWithWorld(world)
    apps.push(app)
    const impl = predictionInternals(app)
    const r1 = await impl.trainNow({ seed: 9 })
    const w1 = Buffer.from(impl.model()!.V.buffer).toString('base64')
    const r2 = await impl.trainNow({ seed: 9 })
    const w2 = Buffer.from(impl.model()!.V.buffer).toString('base64')
    expect(w2).toBe(w1)
    expect(r2.metrics).toEqual(r1.metrics)
    expect(r2.loss).toEqual(r1.loss)
    expect(r2.modelHash).toBe(r1.modelHash)
    expect(impl.model()!.ranker).toEqual(impl.model()!.ranker)
    const r3 = await impl.trainNow({ seed: 10 })
    expect(r3.modelHash).not.toBe(r1.modelHash)
    // ikinci uygulamada (başka süreç durumu) aynı sonuç
    const { app: other } = await appWithWorld(world)
    apps.push(other)
    const r4 = await predictionInternals(other).trainNow({ seed: 9 })
    expect(r4.modelHash).toBe(r1.modelHash)
    expect(r4.metrics).toEqual(r1.metrics)
  }, 60_000)

  it('arka plan eğitimi olay döngüsünü kilitlemez; eğitim sürerken önceki model yanıt verir', async () => {
    const world = plantTasteWorld({ seed: 41, viewersPerArchetype: 600, perPool: 40, titlesPerViewer: [10, 20] })
    const { app } = await appWithWorld(world)
    apps.push(app)
    const impl = predictionInternals(app)
    await impl.trainNow({ seed: 1, factors: 8, iterations: 2 })
    expect(impl.ready()).toBe(true)
    const prev = impl.model()
    const run = impl.startTraining({ seed: 2, factors: 24, iterations: 6 })
    expect(run.status).toBe('RUNNING')
    expect(impl.info().run!.status).toBe('RUNNING')
    let maxGap = 0
    let last = performance.now()
    let ticks = 0
    let readyDuring = true
    const timer = setInterval(() => {
      const now = performance.now()
      maxGap = Math.max(maxGap, now - last)
      last = now
      ticks++
      if (impl.busy() && (!impl.ready() || impl.model() !== prev)) readyDuring = false
    }, 5)
    await impl.idle()
    clearInterval(timer)
    expect(run.status).toBe('DONE')
    expect(ticks).toBeGreaterThan(5)
    expect(readyDuring).toBe(true)
    expect(maxGap).toBeLessThan(150)
    expect(impl.model()).not.toBe(prev)
  }, 60_000)

  it('veri yoksa eğitim FAILED olur ve açıklama yazar; model hazır olmaz', async () => {
    const app = await createTestApp()
    apps.push(app)
    installFakes(app, {
      viewing: createFakeViewing(),
      tagging: createFakeTagging(),
      microgenres: createFakeMicrogenres(),
    })
    const impl = predictionInternals(app)
    expect(impl.checkNow().decision).toBe('no-data')
    const run = await impl.trainNow()
    expect(run.status).toBe('FAILED')
    expect(run.error).toMatch(/yeterli izleme verisi yok/)
    expect(impl.ready()).toBe(false)
    expect(app.services.predictions.topPicks('x', 5)).toEqual([])
  })
})

/* ═════════════ REST ═════════════ */

describe('tahmin modeli — REST', () => {
  it('uçlar: kart, eğitim (RUNNING), çalıştırmalar, örnek izleyiciler, tahmin, açıklama; doğrulama', async () => {
    const world = plantTasteWorld({ seed: 51, viewersPerArchetype: 40 })
    const { app } = await appWithWorld(world)
    apps.push(app)
    const card = await app.inject({ method: 'GET', url: '/api/studio/model' })
    expect(card.statusCode).toBe(200)
    expect(card.json<PredictionModelInfo>().ready).toBe(false)
    const notReady = await app.inject({
      method: 'GET',
      url: `/api/studio/model/explain?viewerId=v_x&titleId=${world.titles[0]!.videoId}`,
    })
    expect(notReady.statusCode).toBe(409)

    for (const payload of [{ factors: 1 }, { iterations: 0 }, { alpha: -1 }, { bilinmeyen: 1 }, { seed: 1.5 }]) {
      const bad = await app.inject({ method: 'POST', url: '/api/studio/model/train', payload })
      expect(bad.statusCode).toBe(400)
      expect(bad.json().error.code).toBe('VALIDATION_FAILED')
    }
    const started = await app.inject({
      method: 'POST',
      url: '/api/studio/model/train',
      payload: { seed: 2, factors: 8 },
    })
    expect(started.statusCode).toBe(200)
    const run = started.json<TrainingRun>()
    expect(run.status).toBe('RUNNING')
    expect(run.params).toMatchObject({ seed: 2, factors: 8 })
    await predictionInternals(app).idle()

    const runs = await app.inject({ method: 'GET', url: '/api/studio/model/runs' })
    expect(runs.json<TrainingRun[]>()[0]!.runId).toBe(run.runId)
    expect(runs.json<TrainingRun[]>()[0]!.status).toBe('DONE')

    const comm = app.services.audience.communities()
    expect(comm.length).toBeGreaterThan(1)
    const vs = await app.inject({ method: 'GET', url: `/api/studio/model/viewers?communityId=${comm[0]!.id}&first=5` })
    expect(vs.statusCode).toBe(200)
    const sample = vs.json<{ viewerId: string; communityId: string; titles: number; hours: number }[]>()
    expect(sample.length).toBe(5)
    expect(sample.every((s) => s.communityId === comm[0]!.id && s.titles > 0)).toBe(true)

    const pr = await app.inject({
      method: 'GET',
      url: `/api/studio/model/predict?viewerId=${sample[0]!.viewerId}&first=10`,
    })
    expect(pr.statusCode).toBe(200)
    const pred = pr.json<ViewerPrediction>()
    expect(pred.picks.length).toBe(10)
    expect(pred.history.length).toBe(sample[0]!.titles)
    const hist = new Set(pred.history.map((h) => h.titleId))
    expect(pred.picks.some((p) => hist.has(p.titleId))).toBe(false)

    const ex = await app.inject({
      method: 'GET',
      url: `/api/studio/model/explain?viewerId=${sample[0]!.viewerId}&titleId=${pred.picks[0]!.titleId}`,
    })
    expect(ex.statusCode).toBe(200)
    expect(ex.json().match).toBe(pred.picks[0]!.match)

    for (const url of [
      '/api/studio/model/predict',
      '/api/studio/model/predict?viewerId=a&profileGuid=b',
      '/api/studio/model/predict?viewerId=a&first=0',
      '/api/studio/model/explain?viewerId=a',
      '/api/studio/model/viewers?communityId=x',
    ]) {
      const bad = await app.inject({ method: 'GET', url })
      expect(bad.statusCode, url).toBe(400)
    }
    const none = await app.inject({ method: 'GET', url: `/api/studio/model/explain?viewerId=v_yok&titleId=1` })
    expect(none.statusCode).toBe(404)
  }, 60_000)

  it('yazma koruması: oturumla gelen eğitim isteği authURL ister', async () => {
    const app = await createTestApp({ studioAccess: 'member' })
    apps.push(app)
    expect((await app.inject({ method: 'GET', url: '/api/studio/model' })).statusCode).toBe(401)
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
    expect((await app.inject({ method: 'GET', url: '/api/studio/model', cookies })).statusCode).toBe(200)
    const noCsrf = await app.inject({ method: 'POST', url: '/api/studio/model/train', cookies, payload: {} })
    expect(noCsrf.statusCode).toBe(403)
    const ok = await app.inject({
      method: 'POST',
      url: '/api/studio/model/train',
      cookies,
      headers: { [HEADERS.AUTH_URL]: boot.authURL! },
      payload: { factors: 4, iterations: 1 },
    })
    expect(ok.statusCode).toBe(200)
    await predictionInternals(app).idle()
  })
})
