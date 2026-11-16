/**
 * Başlık olguları ve niyet karşılama (saf). Olgular dizin kurulurken bir kez çıkarılır (searchIndex.ts):
 * tür, ruh hâli, süre, yıl, köken, çocuk işareti ve — etiketleme servisi varsa — geçerli etiketler.
 *
 * Gevşetme: hepsini birden karşılayan başlık MIN_INTENT_RESULTS'tan azsa niyetler RELAX_ORDER sırasıyla (aynı türde
 * sonra yazılan önce) birer birer bırakılır; en az MIN_INTENT_RESULTS sonuç olunca ya da tek niyet kalınca durulur.
 * Sonra, bırakılanlardan geri eklenince sonucu daraltmayanlar geri alınır (sonuç aynı kalır, `relaxed` yalnız gerçekten
 * gevşetilenleri sayar). Biçim ilk bırakılır ("korku filmi"nde "film" çoğu zaman yalnız addır), tür en son: "ne izlemek
 * istediği" en güçlü işarettir. LIVE süzmez, hiç bırakılmaz.
 */
import type { ContentTitle } from '../../../../../shared/content-schema'
import type { GenreKey, MoodKey } from '../../../../../shared/taxonomy'
import { AUDIENCE_TAGS, type IntentKind, type IntentSpec } from './lexicon'
import type { ParsedIntent } from './parse'

export interface TitleFacts {
  type: 'MOVIE' | 'SHOW'
  year: number
  /** Film süresi ya da dizinin bölüm süresi ortancası (dk); bilinmiyorsa null */
  runtimeMin: number | null
  kids: boolean
  genres: readonly GenreKey[]
  moods: readonly MoodKey[]
  countries: readonly string[]
  /** Geçerli etiketler: 'd:<niteleyici>' ve 'f:<yüz>:<değer>' */
  tags: ReadonlySet<string>
}

/** Etiketleme servisinden gelen geçerli etiketlerin aramanın kullandığı kısmı */
export interface TitleTagFacts {
  descriptors: readonly string[]
  facets: Readonly<Record<string, readonly string[]>>
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? (s[mid] ?? null) : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2
}

export function titleFacts(t: ContentTitle, tags: TitleTagFacts | null = null): TitleFacts {
  const sec =
    t.type === 'MOVIE'
      ? t.runtimeSec
      : median(t.seasons.flatMap((s) => s.episodes.map((e) => e.runtimeSec).filter((r): r is number => r !== null)))
  const tagSet = new Set<string>()
  for (const d of tags?.descriptors ?? []) tagSet.add(`d:${d}`)
  for (const [facet, values] of Object.entries(tags?.facets ?? {}))
    for (const v of values) tagSet.add(`f:${facet}:${v}`)
  return {
    type: t.type,
    year: t.year,
    runtimeMin: sec ? Math.round(sec / 60) : null,
    kids: t.kids,
    genres: t.genres,
    moods: t.moods,
    countries: t.origin?.countries ?? [],
    tags: tagSet,
  }
}

/** Başlık bu niyeti karşılıyor mu? */
export function satisfies(spec: IntentSpec, f: TitleFacts): boolean {
  switch (spec.kind) {
    case 'GENRE':
      return spec.genres.some((g) => f.genres.includes(g))
    case 'MOOD':
      return spec.moods.some((m) => f.moods.includes(m)) || spec.tags.some((t) => f.tags.has(t))
    case 'DURATION': {
      const r = f.runtimeMin
      // Süresi bilinmeyen başlık yalnız "kısa"yı, türü ya da etiketi kısa olduğunu söylüyorsa karşılar.
      if (r === null) return spec.bare === 'short' && (f.genres.includes('kisa-film') || f.moods.includes('kisa-ve-oz'))
      return (spec.min === null || r >= spec.min) && (spec.max === null || r < spec.max)
    }
    case 'ERA':
      return (spec.from === null || f.year >= spec.from) && (spec.to === null || f.year <= spec.to)
    case 'TYPE':
      return f.type === spec.type
    case 'ORIGIN':
      return (
        spec.countries.some((c) => f.countries.includes(c)) ||
        (spec.countries.includes('TR') && f.genres.includes('yerli'))
      )
    case 'AUDIENCE':
      return (
        f.kids ||
        f.genres.includes('cocuk-aile') ||
        (spec.audience === 'family' && f.moods.includes('aile-boyu')) ||
        AUDIENCE_TAGS[spec.audience].some((t) => f.tags.has(`f:${t}`))
      )
    case 'LIVE':
      return true
  }
}

/** Başlığın karşıladığı niyetlerin kısa adları, sorgu sırasıyla: "Kısa · Düşündürücü · Bilim Kurgu" (yoksa null) */
export function intentReason(intents: readonly ParsedIntent[], f: TitleFacts): string | null {
  const parts = intents.filter((i) => i.kind !== 'LIVE' && satisfies(i.spec, f)).map((i) => i.short)
  return parts.length > 0 ? parts.join(' · ') : null
}

/* ───────────── Gevşetme ───────────── */

/** Önce bırakılan önce: biçim → dönem → süre → köken → ton → izleyici → tür */
export const RELAX_ORDER: readonly IntentKind[] = ['TYPE', 'ERA', 'DURATION', 'ORIGIN', 'MOOD', 'AUDIENCE', 'GENRE']
/** Bundan az sonuç varsa gevşetilir */
export const MIN_INTENT_RESULTS = 3

export interface Relaxed<T> {
  matches: T[]
  /** Bırakılan niyetler, bırakılma sırasıyla */
  relaxed: ParsedIntent[]
}

/** Tüm (süzen) niyetleri karşılayanlar; azsa gevşeterek. `factsOf` null dönen öğe hiçbir niyeti karşılamaz. */
export function matchIntents<T>(
  items: readonly T[],
  intents: readonly ParsedIntent[],
  factsOf: (item: T) => TitleFacts | null,
): Relaxed<T> {
  let active = intents.filter((i) => i.kind !== 'LIVE')
  const run = (list: readonly ParsedIntent[]) =>
    items.filter((x) => {
      const f = factsOf(x)
      return f !== null && list.every((i) => satisfies(i.spec, f))
    })
  if (active.length === 0) return { matches: [...items], relaxed: [] }
  const order = [...active]
    .map((intent, pos) => ({ intent, pos }))
    .sort((a, b) => RELAX_ORDER.indexOf(a.intent.kind) - RELAX_ORDER.indexOf(b.intent.kind) || b.pos - a.pos)
    .map((x) => x.intent)
  let dropped: ParsedIntent[] = []
  let matches = run(active)
  while (matches.length < MIN_INTENT_RESULTS && active.length > 1) {
    const drop = order[dropped.length]
    if (!drop) break
    dropped.push(drop)
    active = active.filter((i) => i !== drop)
    matches = run(active)
  }
  // Geri eklenince sonucu daraltmayan niyet gevşetilmiş sayılmaz (alt küme, aynı boyut → aynı küme).
  for (const d of [...dropped].reverse()) {
    if (run([...active, d]).length !== matches.length) continue
    active = [...active, d]
    dropped = dropped.filter((x) => x !== d)
  }
  return { matches, relaxed: dropped }
}
