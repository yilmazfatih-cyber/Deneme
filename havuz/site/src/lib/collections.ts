/**
 * İçerik listeleri üzerindeki saf işlemler: sıralama, taslak süzme, okuma süresi, etiketler, ilgili yazılar,
 * belge grupları, önceki/sonraki belge, çeviri eşleştirme. Astro'ya bağımlı değildir; birim testleri vardır.
 * Kim kullanır: src/lib/content.ts (astro:content sorgularını sarar), testler.
 * Genişletme: yeni bir liste işlemi → buraya saf bir işlev, tests/unit/collections.test.ts'e örnek.
 */
import { countWords, markdownToPlainText } from './text.ts'
import { slugify } from './slug.ts'

/** Okuma hızı (kelime/dakika). Türkçe ve İngilizce düz yazı için yaygın kabul edilen ortalama. */
export const WORDS_PER_MINUTE = 200

export interface Dated {
  data: { date: Date; draft: boolean; title: string }
}

/** Yayın tarihine göre yeniden eskiye; aynı gün yayınlananlar başlığa göre (belirlenimci sıra). */
export function sortByDateDesc<T extends Dated>(entries: readonly T[]): T[] {
  return [...entries].sort(
    (a, b) => b.data.date.valueOf() - a.data.date.valueOf() || a.data.title.localeCompare(b.data.title, 'tr'),
  )
}

/** Taslaklar yalnız geliştirme sunucusunda görünür. */
export function isVisible(entry: { data: { draft: boolean } }, includeDrafts: boolean): boolean {
  return includeDrafts || !entry.data.draft
}

/** Markdown gövdesinden okuma süresi (dakika, en az 1). */
export function readingMinutes(markdown: string): number {
  return Math.max(1, Math.round(countWords(markdownToPlainText(markdown)) / WORDS_PER_MINUTE))
}

export interface TagInfo {
  name: string
  slug: string
  count: number
}

/** Yazılardaki etiketleri toplar: çok kullanılandan aza, eşitse ada göre. Aynı kısa ada düşen etiketler birleşir. */
export function collectTags(entries: readonly { data: { tags: readonly string[] } }[], lang: string): TagInfo[] {
  const bySlug = new Map<string, TagInfo>()
  for (const entry of entries) {
    for (const name of new Set(entry.data.tags)) {
      const slug = slugify(name)
      const existing = bySlug.get(slug)
      if (existing) existing.count += 1
      else bySlug.set(slug, { name, slug, count: 1 })
    }
  }
  return [...bySlug.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, lang))
}

/** Ortak etiket sayısına göre ilgili yazılar; eşitlikte daha yeni olan önce. Yazının kendisi dışarıda kalır. */
export function relatedEntries<T extends Dated & { id: string; data: { tags: readonly string[] } }>(
  current: T,
  all: readonly T[],
  limit = 3,
): T[] {
  const tags = new Set(current.data.tags.map(slugify))
  return sortByDateDesc(all.filter((entry) => entry.id !== current.id))
    .map((entry) => ({ entry, score: entry.data.tags.filter((tag) => tags.has(slugify(tag))).length }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ entry }) => entry)
}

export interface Ordered {
  id: string
  data: { order: number; group: string; title: string }
}

/** Belgeleri `order` değerine göre sıralar (eşitse başlığa göre). */
export function sortByOrder<T extends Ordered>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => a.data.order - b.data.order || a.data.title.localeCompare(b.data.title, 'tr'))
}

/** Sıralı belgeleri yan menü gruplarına ayırır; grupların sırası ilk belgelerinin sırasıdır. */
export function groupByGroup<T extends Ordered>(entries: readonly T[]): { group: string; items: T[] }[] {
  const groups: { group: string; items: T[] }[] = []
  for (const entry of sortByOrder(entries)) {
    const existing = groups.find((candidate) => candidate.group === entry.data.group)
    if (existing) existing.items.push(entry)
    else groups.push({ group: entry.data.group, items: [entry] })
  }
  return groups
}

/** Okuma sırasına göre önceki ve sonraki belge (yan menüdeki sırayla aynı). */
export function neighbours<T extends Ordered>(entries: readonly T[], id: string): { previous?: T; next?: T } {
  const flat = groupByGroup(entries).flatMap((group) => group.items)
  const index = flat.findIndex((entry) => entry.id === id)
  if (index === -1) return {}
  const result: { previous?: T; next?: T } = {}
  const previous = flat[index - 1]
  const next = flat[index + 1]
  if (previous) result.previous = previous
  if (next) result.next = next
  return result
}

/**
 * Aynı `translationKey` değerini taşıyan girdileri (farklı dillerdeki çevirileri) bulur.
 * `localeOf` girdinin dilini verir. Sonuç: dil → girdi.
 */
export function translationsOf<
  T extends { id: string; data: { translationKey?: string | undefined } },
  L extends string,
>(entry: T, all: readonly T[], localeOf: (entry: T) => L): Partial<Record<L, T>> {
  const result: Partial<Record<L, T>> = { [localeOf(entry)]: entry } as Partial<Record<L, T>>
  const key = entry.data.translationKey
  if (key === undefined) return result
  for (const candidate of all) {
    if (candidate.data.translationKey === key) result[localeOf(candidate)] = candidate
  }
  return result
}
