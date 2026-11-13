/**
 * Tahmin modeli — ölçek: sentetik 100.000 izleyici × 5.000 başlık (TVP_PERF_VIEWERS / TVP_PERF_TITLES ile değişir).
 * Eğitim hattının tamamı (değerlendirme modeli, sıralayıcı, ölçüm, üretim modeli) arka plan sürücüsüyle (kısa dilimler)
 * koşar; süre, bellek ve olay döngüsünün en uzun duraklaması ölçülür ve yazdırılır.
 */
import { describe, expect, it } from 'vitest'
import type { ContentTitle } from '../../shared/content-schema'
import type { ViewingFact } from '../../shared/intelligence'
import { DEFAULT_PARAMS, emptyRun, train, type TrainInput } from '../src/services/predictions/train'
import { runAsync } from '../src/services/predictions/service'
import { makeTitle, rng } from './intelligence-fixtures'

const VIEWERS = Number(process.env.TVP_PERF_VIEWERS ?? 100_000)
const TITLES = Number(process.env.TVP_PERF_TITLES ?? 5_000)
const ARCHETYPES = 20
const GENRES = ['belgesel', 'komedi', 'dram', 'gerilim', 'romantik', 'animasyon', 'tarih', 'muzik'] as const

function world(): { titles: ContentTitle[]; facts: ViewingFact[]; archetypeOf: (v: string) => number } {
  const r = rng(99)
  const titles: ContentTitle[] = []
  for (let k = 0; k < TITLES; k++)
    titles.push(
      makeTitle({
        videoId: 95_000_000 + k,
        genres: [GENRES[k % GENRES.length]!, GENRES[(k * 7 + 3) % GENRES.length]!],
        moods: k % ARCHETYPES < 10 ? ['dusundurucu'] : ['eglenceli'],
      }),
    )
  // Her arketip kataloğun kendi dilimini sever (Zipf), %15 olasılıkla genel popülerlere kayar
  const per = Math.floor(TITLES / ARCHETYPES)
  const facts: ViewingFact[] = []
  const t0 = Date.parse('2026-08-01T00:00:00Z')
  for (let v = 0; v < VIEWERS; v++) {
    const a = v % ARCHETYPES
    const viewerId = `v_${v.toString(36).padStart(5, '0')}`
    const n = 5 + Math.floor(r() * 16)
    const seen = new Set<number>()
    for (let q = 0; q < n; q++) {
      const off = r() < 0.15
      const idx = off ? Math.floor(Math.pow(r(), 3) * TITLES) : a * per + Math.floor(Math.pow(r(), 2) * per)
      const titleId = 95_000_000 + idx
      if (seen.has(titleId)) continue
      seen.add(titleId)
      const ts = t0 + Math.floor(r() * 80 * 86_400_000)
      facts.push({
        viewerId,
        titleId,
        source: 'SYNTHETIC',
        plays: 1,
        watchedSec: 1800,
        completions: r() < 0.5 ? 1 : 0,
        firstTs: ts - 3_600_000,
        lastTs: ts,
        inList: false,
        rating: null,
        engagement: off ? 0.3 + 0.3 * r() : 0.5 + 0.5 * r(),
      })
    }
  }
  return { titles, facts, archetypeOf: (id: string) => parseInt(id.slice(2), 36) % ARCHETYPES }
}

describe('tahmin modeli — ölçek', () => {
  it(`${VIEWERS} izleyici × ${TITLES} başlık: olay döngüsünü kilitlemeden eğitilir`, async () => {
    const tg = performance.now()
    const w = world()
    const genMs = performance.now() - tg
    const input: TrainInput = {
      facts: w.facts,
      sources: ['SYNTHETIC'],
      synthetic: true,
      note: 'ölçek testi',
      titles: w.titles,
      content: {
        tags: () => null,
        microgenres: () => [],
        embedding: () => null,
      },
      communityOf: (v) => `tc_${String(w.archetypeOf(v) + 1).padStart(2, '0')}`,
      audienceRunId: null,
      embeddingLabel: null,
      fingerprint: {
        sources: ['SYNTHETIC'],
        interactions: w.facts.length,
        viewers: VIEWERS,
        engagementSum: 0,
        lastTs: 0,
        content: '',
        audience: null,
      },
    }
    const run = emptyRun('perf', DEFAULT_PARAMS, input)
    let maxGap = 0
    let last = performance.now()
    let peakRss = 0
    const timer = setInterval(() => {
      const now = performance.now()
      maxGap = Math.max(maxGap, now - last)
      last = now
      peakRss = Math.max(peakRss, process.memoryUsage().rss)
    }, 10)
    const t0 = performance.now()
    const out = await runAsync(train(input, DEFAULT_PARAMS, run, { factors: false, regularization: false }), 12, () => false)
    const ms = performance.now() - t0
    clearInterval(timer)
    const m = out.run.metrics!
    console.log(
      JSON.stringify(
        {
          viewers: out.run.viewers,
          titles: out.run.titles,
          interactions: out.run.interactions,
          generateMs: Math.round(genMs),
          trainMs: Math.round(ms),
          timings: out.run.timings,
          solver: out.run.solver,
          params: out.run.params,
          maxEventLoopGapMs: Math.round(maxGap),
          peakRssMb: Math.round(peakRss / 1e6),
          loss: out.run.loss,
          model: m.model,
          popularity: m.popularity,
          genreAffinity: m.genreAffinity,
          coldStart: m.coldStart,
          coldStartPopularity: out.run.coldStartPopularity,
        },
        null,
        1,
      ),
    )
    expect(out.model).not.toBeNull()
    expect(m.model.recallAt10).toBeGreaterThan(m.popularity.recallAt10)
    expect(maxGap).toBeLessThan(500)
  }, 600_000)
})
