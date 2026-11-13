/**
 * Zevk toplulukları — ölçek: 200 000 izleyici (≈ 850 000 izleyici × başlık özeti), etiketli katalog.
 * Seyrek vektörler + tipli diziler; n² geçiş yok. Süre ve olay döngüsü gecikmesi ölçülüp yazdırılır.
 */
import { describe, expect, it } from 'vitest'
import { audienceInternals } from '../src/services/audience/plugin'
import { createTestApp } from './helpers'
import {
  createFakeMicrogenres,
  createFakeTagging,
  createFakeViewing,
  installFakes,
  makeMicrogenre,
  realCatalogPools,
  rng,
  syntheticFacts,
} from './intelligence-fixtures'

const N = 200_000

describe('zevk toplulukları — ölçek', () => {
  it(`${N.toLocaleString('tr-TR')} izleyiciyi makul sürede kümeler; arka plan hesabı olay döngüsünü kilitlemez`, async () => {
    const app = await createTestApp()
    try {
      const titles = app.services.catalog.allTitles()
      const pools = Object.values(realCatalogPools(titles))
      // Etiketler: her başlığa havuzuna özgü ve ortak yüz değerleri, bir niteleyici; havuz başına iki mikro tür
      const r = rng(7)
      const tags: Record<number, { descriptors: string[]; facets: Record<string, string[]> }> = {}
      pools.forEach((pool, pi) => {
        for (const id of pool) {
          tags[id] = {
            descriptors: [`nit-${pi}`],
            facets: { konu: [`k${pi}-${Math.floor(r() * 4)}`, `ortak-${Math.floor(r() * 6)}`], mekan: [`m${Math.floor(r() * 8)}`] },
          }
        }
      })
      const micro = pools.flatMap((pool, pi) => [
        makeMicrogenre(`mg_${pi}a`, `Mikro ${pi}A`, 'belgesel', pool.slice(0, Math.ceil(pool.length / 2)), 1),
        makeMicrogenre(`mg_${pi}b`, `Mikro ${pi}B`, 'belgesel', pool.slice(Math.floor(pool.length / 2)), 2),
      ])
      const facts = syntheticFacts(N, pools, { seed: 1 })
      const viewing = createFakeViewing()
      const countries = ['TR', 'DE', 'AZ', 'NL', 'FR']
      viewing.setFacts(facts, (id) => ({ device: 'TV', country: countries[id.charCodeAt(id.length - 1) % 5]! }))
      installFakes(app, { viewing, tagging: createFakeTagging(tags), microgenres: createFakeMicrogenres(micro) })
      viewing.facts() // sahte deponun olgu önbelleği ölçüme girmesin

      const t0 = performance.now()
      const run = app.services.audience.recompute()
      const syncMs = performance.now() - t0
      expect(run.viewers + (run as unknown as { unassigned: number }).unassigned).toBe(N)
      expect(run.k).toBe(4)
      expect(run.silhouette!).toBeGreaterThan(0.5)
      expect(syncMs).toBeLessThan(60_000)

      // Arka plan: veri değişti → okuma önceki çalıştırmayı sunar; hesap dilimlenerek sürer
      viewing.bump()
      viewing.facts()
      let maxLag = 0
      let last = performance.now()
      const timer = setInterval(() => {
        const now = performance.now()
        maxLag = Math.max(maxLag, now - last - 5)
        last = now
      }, 5)
      const t1 = performance.now()
      expect(app.services.audience.run()!.runId).toBe(run.runId)
      await audienceInternals(app).idle()
      clearInterval(timer)
      const bgMs = performance.now() - t1
      expect(app.services.audience.run()!.runId).toBe(run.runId) // aynı veri → aynı sonuç
      console.log(
        `[ölçek] izleyici=${N} olgu=${facts.length} özellik=${run.featureCount} k=${run.k} siluet=${run.silhouette} ` +
          `eşzamanlı=${Math.round(syncMs)}ms arka-plan=${Math.round(bgMs)}ms en-büyük-döngü-gecikmesi=${Math.round(maxLag)}ms ` +
          `bellek=${Math.round(process.memoryUsage().heapUsed / 1e6)}MB`,
      )
      expect(maxLag).toBeLessThan(500)
    } finally {
      await app.close()
    }
  }, 180_000)
})
