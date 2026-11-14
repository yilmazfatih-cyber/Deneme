/**
 * Panel kapalıyken de seyrek olayları saklayan küçük toplayıcı.
 * devbus halka tamponu (600) oynatma sırasında saniyede birkaç aralık/tampon olayıyla dolar; panel oynatmanın
 * ortasında açılınca FTL, MSL ve manifest olayları çoktan düşmüş olurdu. Burada yalnızca seyrek kategoriler,
 * kategori başına sınırlı sayıda tutulur (olay başına tek bir harita araması; React çizimi yok).
 */
import { devbus, type DevCategory, type DevEvent } from '../lib/devbus'

const KEEP: Partial<Record<DevCategory, number>> = {
  graphql: 100,
  falcor: 100,
  'event-log': 200,
  session: 10,
  push: 20,
  ftl: 12,
  msl: 20,
  manifest: 30,
  abr: 40,
  cdn: 30,
  ttml: 10,
  embed: 30,
  player: 30,
  cache: 20, // yalnızca manifest önbellek olayları (aşağıda süzülür)
}

const kept = new Map<DevCategory, DevEvent[]>()
let started = false

export function startCollector(): void {
  if (started) return
  started = true
  devbus.subscribe((e) => {
    const max = KEEP[e.cat]
    if (!max) return
    if (e.cat === 'cache' && !e.label.startsWith('manifest:')) return
    let list = kept.get(e.cat)
    if (!list) kept.set(e.cat, (list = []))
    list.push(e)
    if (list.length > max) list.shift()
  })
}

/** İki olay listesini kimliğe göre birleştirir (tekrarsız, eskiden yeniye). */
export function mergeEvents(a: readonly DevEvent[], b: readonly DevEvent[]): DevEvent[] {
  const byId = new Map<number, DevEvent>()
  for (const e of a) byId.set(e.id, e)
  for (const e of b) byId.set(e.id, e)
  return [...byId.values()].sort((x, y) => x.id - y.id)
}

/** Panel açılırken kurulacak olaylar: halka tamponu + saklanan seyrek olaylar. */
export function hydrationEvents(): DevEvent[] {
  return mergeEvents([...kept.values()].flat(), devbus.snapshot())
}
