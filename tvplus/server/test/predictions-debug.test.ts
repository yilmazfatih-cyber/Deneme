import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { it } from 'vitest'
import { predictionInternals } from '../src/services/predictions/plugin'
import { createTestApp } from './helpers'
import { createFakeMicrogenres, createFakeTagging, createFakeViewing, installFakes, plantTasteWorld } from './intelligence-fixtures'
it('debug', async () => {
  const world = plantTasteWorld({ seed: 21, viewersPerArchetype: 50 })
  const dataDir = mkdtempSync(join(tmpdir(), 'tvplus-tahmin-'))
  const mk = async () => {
    const app = await createTestApp({ dataDir })
    const viewing = createFakeViewing({ facts: world.facts })
    installFakes(app, { viewing, tagging: createFakeTagging(world.tags), microgenres: createFakeMicrogenres(world.microgenres), titles: world.titles })
    return { app, viewing }
  }
  const pf = world.pools.get('gerilim')!.slice(0, 2).map((titleId) => ({ viewerId: 'v_profil_kalici', titleId, source: 'TVPLUS' as const, plays: 1, watchedSec: 3000, completions: 1, firstTs: 1, lastTs: 1, inList: false, rating: null, engagement: 0.9 }))
  const a = await mk()
  await predictionInternals(a.app).trainNow({ seed: 4 })
  a.viewing.setFacts([...world.facts, ...pf])
  const b = await mk()
  b.viewing.setFacts([...world.facts, ...pf])
  const ma = predictionInternals(a.app).model()!, mb = predictionInternals(b.app).model()!
  for (const k of ['V','C','counts','popularity','addedAt','gram'] as const) console.log('DBG', k, Buffer.from(ma[k].buffer, ma[k].byteOffset, ma[k].byteLength).equals(Buffer.from(mb[k].buffer, mb[k].byteOffset, mb[k].byteLength)), ma[k].length, mb[k].length)
  console.log('DBG', JSON.stringify(ma.adjust), JSON.stringify(mb.adjust), ma.f, mb.f, ma.params.alpha, mb.params.alpha)
  for (const x of [a, b]) console.log('DBG hist', JSON.stringify(predictionInternals(x.app).predict({ profileGuid: 'kalici' }, 2)), x.viewing.revision(), x.viewing.factsOfViewer('v_profil_kalici').length)
  for (const x of [a, b]) {
    const p = x.app.services.predictions.topPicks('kalici', 3)
    console.log('DBG', JSON.stringify(p), JSON.stringify(x.app.services.audience.ofProfile('kalici')), JSON.stringify(predictionInternals(x.app).model()!.ranker))
    console.log('DBG', JSON.stringify(x.app.services.predictions.explain('kalici', p[0]!.titleId)?.parts))
  }
  await a.app.close(); await b.app.close()
}, 60000)
