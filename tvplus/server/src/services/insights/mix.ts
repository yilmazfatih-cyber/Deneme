/**
 * Katalog karması ve zaman çizelgesi (docs/ICERIK_ZEKASI.md §7):
 *   catalogShare(x) = x'i taşıyan başlık / tüm başlık
 *   viewShare(x)    = x'i taşıyan başlıkların izlenen saati / tüm saat
 *   efficiency(x)   = viewShare / catalogShare (izleme ya da katalog payı yoksa null)
 * Bir yapım birden çok tür taşıdığından tür satırlarının payları toplamda 1'i aşabilir.
 */
import type { ContentTitle } from '../../../../shared/content-schema'
import type { CatalogMix, MixRow, Timeline, ViewingSource } from '../../../../shared/intelligence'
import {
  ACQUISITION_NAMES,
  TYPE_NAMES,
  acquisitionOf,
  countryName,
  countryOf,
  genreName,
  isLocal,
  languageName,
  languageOf,
  maturityName,
  round4,
} from './labels'

export type Scope = CatalogMix['scope']

export const inScope = (scope: Scope) => (t: ContentTitle) => scope === 'ALL' || t.type === scope

/** Bir kırılımın satırları: her anahtar için başlık sayısı, saat, paylar, verim. */
export function breakdown(
  titles: ContentTitle[],
  hoursOf: (titleId: number) => number,
  keysOf: (t: ContentTitle) => readonly string[],
  nameOf: (key: string) => string,
): MixRow[] {
  const total = titles.length
  let totalHours = 0
  const acc = new Map<string, { titles: number; hours: number }>()
  for (const t of titles) {
    const h = hoursOf(t.videoId)
    totalHours += h
    for (const key of new Set(keysOf(t))) {
      const a = acc.get(key) ?? { titles: 0, hours: 0 }
      a.titles++
      a.hours += h
      acc.set(key, a)
    }
  }
  return [...acc.entries()]
    .map(([key, a]): MixRow => {
      const catalogShare = total > 0 ? a.titles / total : 0
      const viewShare = totalHours > 0 ? a.hours / totalHours : 0
      return {
        key,
        name: nameOf(key),
        titles: a.titles,
        catalogShare: round4(catalogShare),
        hours: Math.round(a.hours * 100) / 100,
        viewShare: round4(viewShare),
        efficiency: totalHours > 0 && catalogShare > 0 ? Math.round((viewShare / catalogShare) * 1000) / 1000 : null,
      }
    })
    .sort((a, b) => b.titles - a.titles || b.hours - a.hours || (a.key < b.key ? -1 : 1))
}

export interface MixInput {
  titles: ContentTitle[]
  hoursByTitle: Map<number, number>
  scope: Scope
  window: { from: string | null; to: string | null }
  sources: ViewingSource[]
}

export function computeMix(input: MixInput): CatalogMix {
  const titles = input.titles.filter(inScope(input.scope))
  const hoursOf = (id: number) => Math.max(0, input.hoursByTitle.get(id) ?? 0)
  let totalHours = 0
  let localTitles = 0
  let localHours = 0
  for (const t of titles) {
    const h = hoursOf(t.videoId)
    totalHours += h
    if (isLocal(t)) {
      localTitles++
      localHours += h
    }
  }
  return {
    scope: input.scope,
    window: input.window,
    sources: input.sources,
    totalTitles: titles.length,
    totalHours: Math.round(totalHours * 100) / 100,
    byGenre: breakdown(titles, hoursOf, (t) => t.genres, genreName),
    byType: breakdown(
      titles,
      hoursOf,
      (t) => [t.type],
      (k) => TYPE_NAMES[k as ContentTitle['type']] ?? k,
    ),
    byCountry: breakdown(titles, hoursOf, (t) => [countryOf(t)], countryName),
    byLanguage: breakdown(titles, hoursOf, (t) => [languageOf(t)], languageName),
    byAcquisition: breakdown(
      titles,
      hoursOf,
      (t) => [acquisitionOf(t)],
      (k) => ACQUISITION_NAMES[k as keyof typeof ACQUISITION_NAMES] ?? k,
    ),
    byMaturity: breakdown(titles, hoursOf, (t) => [t.maturity.rating], maturityName),
    local: {
      catalogShare: titles.length > 0 ? round4(localTitles / titles.length) : 0,
      viewShare: totalHours > 0 ? round4(localHours / totalHours) : 0,
    },
  }
}

/** `count` ay, `lastMonth` ('YYYY-MM') dahil, eskiden yeniye. */
export function monthsEndingAt(lastMonth: string, count: number): string[] {
  const [y, m] = lastMonth.split('-').map(Number) as [number, number]
  const out: string[] = []
  for (let i = count - 1; i >= 0; i--) {
    const idx = y * 12 + (m - 1) - i
    out.push(`${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`)
  }
  return out
}

/** Ayın son günü 'YYYY-MM-DD' (eklenme/ayrılma tarihleriyle dize karşılaştırması için) */
function lastDayOf(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${month}-${String(d).padStart(2, '0')}`
}

export function timelineKeys(dimension: Timeline['dimension']): {
  keysOf: (t: ContentTitle) => readonly string[]
  nameOf: (k: string) => string
} {
  switch (dimension) {
    case 'genre':
      return { keysOf: (t) => t.genres, nameOf: genreName }
    case 'acquisition':
      return {
        keysOf: (t) => [acquisitionOf(t)],
        nameOf: (k) => ACQUISITION_NAMES[k as keyof typeof ACQUISITION_NAMES] ?? k,
      }
    case 'origin':
      return { keysOf: (t) => [countryOf(t)], nameOf: countryName }
  }
}

/**
 * Ay ay: o ayın sonunda katalogda olan başlıklar içinde x'in payı (eklenme tarihine göre birikimli; ayrılanlar düşer)
 * ve o ayın izleme saatinde x'in payı.
 */
export function computeTimeline(
  titles: ContentTitle[],
  monthly: Map<string, Map<number, number>>,
  dimension: Timeline['dimension'],
  months: string[],
): Timeline {
  const { keysOf, nameOf } = timelineKeys(dimension)
  const keySets = new Map<number, Set<string>>(titles.map((t) => [t.videoId, new Set(keysOf(t))]))
  const allKeys = new Set<string>()
  for (const s of keySets.values()) for (const k of s) allKeys.add(k)
  const catalog = new Map<string, number[]>([...allKeys].map((k) => [k, []]))
  const view = new Map<string, number[]>([...allKeys].map((k) => [k, []]))
  for (const month of months) {
    const end = lastDayOf(month)
    const present = titles.filter(
      (t) => t.availability.addedAt <= end && (t.availability.leavingAt === null || t.availability.leavingAt > end),
    )
    const counts = new Map<string, number>()
    for (const t of present) for (const k of keySets.get(t.videoId)!) counts.set(k, (counts.get(k) ?? 0) + 1)
    const hours = monthly.get(month) ?? new Map<number, number>()
    let totalHours = 0
    const keyHours = new Map<string, number>()
    for (const [titleId, h] of hours) {
      const ks = keySets.get(titleId)
      if (!ks || h <= 0) continue
      totalHours += h
      for (const k of ks) keyHours.set(k, (keyHours.get(k) ?? 0) + h)
    }
    for (const k of allKeys) {
      catalog.get(k)!.push(present.length > 0 ? round4((counts.get(k) ?? 0) / present.length) : 0)
      view.get(k)!.push(totalHours > 0 ? round4((keyHours.get(k) ?? 0) / totalHours) : 0)
    }
  }
  const last = (arr: number[]) => arr[arr.length - 1] ?? 0
  const series = [...allKeys]
    .map((key) => ({ key, name: nameOf(key), catalogShare: catalog.get(key)!, viewShare: view.get(key)! }))
    .sort(
      (a, b) =>
        last(b.catalogShare) - last(a.catalogShare) ||
        last(b.viewShare) - last(a.viewShare) ||
        (a.key < b.key ? -1 : 1),
    )
  return { dimension, months, series }
}
