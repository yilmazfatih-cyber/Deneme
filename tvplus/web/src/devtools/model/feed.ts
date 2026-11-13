/** "Akış" sekmesi: ham olay listesi (en yeni başta, en çok 300 satır) ve kategori sayımları. */
import type { DevCategory, DevEvent } from '../../lib/devbus'

export const FEED_MAX = 300

export interface FeedState {
  rows: DevEvent[] // en yeni başta
  byCat: Partial<Record<DevCategory, number>>
}

export function initialFeed(): FeedState {
  return { rows: [], byCat: {} }
}

/** Bir paket olayı ekler (paket eskiden yeniye sıralı gelir). */
export function reduceFeed(s: FeedState, events: readonly DevEvent[]): FeedState {
  if (!events.length) return s
  const byCat = { ...s.byCat }
  for (const e of events) byCat[e.cat] = (byCat[e.cat] ?? 0) + 1
  const fresh = events.slice(-FEED_MAX).reverse()
  return { rows: [...fresh, ...s.rows].slice(0, FEED_MAX), byCat }
}

export function filterFeed(rows: readonly DevEvent[], cats: ReadonlySet<DevCategory>): DevEvent[] {
  return cats.size ? rows.filter((r) => cats.has(r.cat)) : rows.slice()
}

/** Kategori çipinin Türkçe adı. */
export const CATEGORY_LABEL: Record<DevCategory, string> = {
  graphql: 'GraphQL',
  falcor: 'Falcor',
  rest: 'REST',
  cache: 'önbellek',
  prefetch: 'ön yükleme',
  ftl: 'FTL',
  msl: 'MSL',
  manifest: 'manifest',
  range: 'aralık',
  abr: 'ABR',
  buffer: 'tampon',
  cdn: 'CDN',
  ttml: 'TTML',
  embed: 'gömme',
  player: 'oynatıcı',
  'event-log': 'olay günlüğü',
  push: 'bildirim',
  session: 'oturum',
}

export const ALL_CATEGORIES = Object.keys(CATEGORY_LABEL) as DevCategory[]
