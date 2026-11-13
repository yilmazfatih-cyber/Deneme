/**
 * Mikro tür üretecinin gerçek ölçekte hızı: tohumlu, gerçekçi dağılımlı 5000 sentetik başlık (türler, köken, yıl,
 * tekrar eden oyuncu/yönetmenler; sözlükteki ölçek ve yüzlerden etiketler). Süre ve sonuç büyüklüğü yazdırılır.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ContentTitle } from '../../shared/content-schema'
import type { EffectiveTags } from '../../shared/intelligence'
import { GENRES } from '../../shared/taxonomy'
import { SCALE_MAX, zVocabulary } from '../../shared/tagging-schema'
import { generateMicrogenres } from '../src/services/microgenres/generate'
import { similarTitles } from '../src/services/microgenres/similarity'
import { descriptorsOf, indexVocabulary } from '../src/services/tagging/vocabulary'

const VOCAB = zVocabulary.parse(
  JSON.parse(readFileSync(join(__dirname, '..', '..', 'content', 'tagging', 'vocabulary.json'), 'utf8')),
)
const INDEX = indexVocabulary(VOCAB)

/** mulberry32: tohumlu, deterministik */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Synthetic = { title: ContentTitle; tags: EffectiveTags }

function baseTitle(id: number, i: number, over: Partial<ContentTitle>): ContentTitle {
  return {
    videoId: id,
    slug: `s-${i}`,
    type: 'MOVIE',
    title: `Sentetik ${i}`,
    year: 2000,
    synopsis: 'Sentetik başlık özeti.',
    shortSynopsis: '',
    genres: ['dram'],
    moods: [],
    cast: [],
    directors: [],
    creators: [],
    keywords: [],
    maturity: { rating: 'GENEL', reasons: [] },
    kids: false,
    runtimeSec: null,
    sources: [],
    seasons: [],
    promo: null,
    supplementals: [],
    artwork: { boxart: null, storyArt: null, focal: '50% 35%', posterFit: 'contain' },
    license: { name: 'x', attribution: 'x' },
    availability: { addedAt: '2026-01-01', leavingAt: null, exclusive: false, requiredProduct: null },
    popularity: 50,
    ...over,
  } as ContentTitle
}

const tagsOf = (id: number, scales: Record<string, number>, facets: Record<string, string[]>): EffectiveTags => ({
  titleId: id,
  rubricVersion: VOCAB.version,
  basis: 'CONSENSUS',
  sheetCount: 3,
  agreement: 0.8,
  scales,
  facets,
  descriptors: descriptorsOf(INDEX, scales),
})

/**
 * Gerçekçi katalog: başlıklar 150 "kalıptan" (ör. "1990'lardan İngiliz suç dizisi") türer. Kalıp; türleri, ülkeyi,
 * dönemi, 1–2 belirgin ölçeği ve 2–4 yüz değerini taşır; başlık bunları gürültüyle devralır (gerçek etiketler
 * birbiriyle ilişkilidir). Diğer ölçekler çoğunlukla orta değerlerdedir; uç değerler seyrektir.
 */
function realisticCatalogue(n: number, seed = 42): Synthetic[] {
  const r = rng(seed)
  const zipf = <T>(xs: readonly T[], s = 1.1): T =>
    xs[Math.min(xs.length - 1, Math.floor(xs.length * Math.pow(r(), 1 + s)))]!
  const genres = Object.keys(GENRES)
  const countries = ['US', 'TR', 'GB', 'KR', 'JP', 'FR', 'DE', 'ES', 'IN', 'SE', 'IT', 'MX', 'BR', 'NL', 'DK', 'CA']
  const scaleKeys = VOCAB.scales.map((s) => s.key)
  const archetypes = Array.from({ length: 150 }, (_, a) => {
    const g = new Set([zipf(genres, 0.5)])
    if (r() < 0.6) g.add(zipf(genres, 0.5))
    const facets: Record<string, string[]> = {}
    for (const f of VOCAB.facets) if (r() < 0.45) facets[f.key] = [zipf(f.values, 0.6).key]
    const signature: Record<string, number> = {}
    for (let k = 0; k < 1 + Math.floor(r() * 2); k++)
      signature[zipf(scaleKeys, 0.3)] = r() < 0.75 ? 4 + Math.floor(r() * 2) : Math.floor(r() * 2)
    return {
      genres: [...g],
      type: r() < 0.65 ? ('MOVIE' as const) : ('SHOW' as const),
      country: zipf(countries, 0.7),
      year: 1950 + Math.floor(Math.pow(r(), 0.5) * 76),
      facets,
      signature,
      cast: Array.from({ length: 40 }, (_, i) => `Oyuncu ${a}-${i}`),
      directors: Array.from({ length: 12 }, (_, i) => `Yönetmen ${a}-${i}`),
    }
  })
  const out: Synthetic[] = []
  for (let i = 0; i < n; i++) {
    const id = 90_000_000 + i
    const a = zipf(archetypes, 0.8)
    const g = new Set(a.genres)
    if (r() < 0.2) g.add(zipf(genres, 0.5))
    const scales: Record<string, number> = {}
    for (const k of scaleKeys) {
      if (r() < 0.15) continue
      const sig = a.signature[k]
      scales[k] =
        sig !== undefined && r() < 0.8 ? sig : Math.max(0, Math.min(SCALE_MAX, 1 + Math.round((r() + r() - 1) * 1.5)))
    }
    const facets: Record<string, string[]> = {}
    for (const f of VOCAB.facets) {
      const vals = new Set((a.facets[f.key] ?? []).filter(() => r() < 0.75))
      if (r() < 0.25 && vals.size < f.max) vals.add(zipf(f.values, 0.8).key)
      if (vals.size) facets[f.key] = [...vals]
    }
    const title = baseTitle(id, i, {
      type: r() < 0.9 ? a.type : a.type === 'MOVIE' ? 'SHOW' : 'MOVIE',
      year: Math.max(1900, Math.min(2026, a.year + Math.round((r() - 0.5) * 16))),
      genres: [...g] as ContentTitle['genres'],
      cast: Array.from({ length: 2 + Math.floor(r() * 4) }, () => zipf(a.cast, 1.0)),
      directors: [zipf(a.directors, 1.0)],
      origin: { countries: [r() < 0.8 ? a.country : zipf(countries, 0.7)], languages: [] },
    })
    out.push({ title, tags: tagsOf(id, scales, facets) })
  }
  return out
}

// Ölçek testleri zaman sınırı taşır ve makine yüküne duyarlıdır; `npm run test:perf` (TVP_PERF=1) ile çalışır.
describe.skipIf(!process.env.TVP_PERF)('mikro tür üreteci — ölçek', () => {
  it('5000 başlık birkaç saniyede üretilir', () => {
    const titles = realisticCatalogue(5000)
    const g = generateMicrogenres({ index: INDEX, titles, minTitles: 2 })
    const t0 = performance.now()
    const sim = similarTitles(g, titles[0]!.title.videoId, 20)
    const simMs = Math.round(performance.now() - t0)
    console.log(
      `[mikro tür ölçek testi] 5000 başlık → ${g.stats.total} mikro tür (görünen ${g.stats.visible}, ` +
        `yuva dağılımı ${JSON.stringify(g.stats.bySpecificity)}), kapsanan ${g.stats.coveredTitles}; ` +
        `üretim ${g.tookMs} ms ${JSON.stringify(g.phaseMs)}; tek başlık benzerliği ${simMs} ms`,
    )
    expect(g.stats.total).toBeGreaterThan(5_000)
    expect(g.stats.coveredTitles).toBe(5000)
    // Boş makinede ~2 sn; tam paket paralel koşarken (dosyalar ayrı süreçlerde) yük altında 4–8 sn görüldü.
    expect(g.tookMs).toBeLessThan(20_000)
    expect(sim).toHaveLength(20)
    expect(new Set(g.items.map((m) => m.id)).size).toBe(g.items.length)
  }, 60_000)
})
