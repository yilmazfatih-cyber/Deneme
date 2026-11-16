/**
 * İçerik sorguları (astro:content üzerine ince katman). Sayfalar içeriğe hep bu işlevlerle ulaşır:
 * dil süzme, taslak gizleme ve sıralama tek yerde yapılır.
 * Kim kullanır: src/pages/ ve src/views/ altındaki dosyalar. Saf mantık: src/lib/collections.ts (testli).
 * Genişletme: yeni koleksiyon için aynı kalıpla `getX(locale)` ekleyin.
 */
import { getCollection, type CollectionEntry, type DataEntryMap } from 'astro:content'
import type { Locale } from '../site.config.ts'
import { groupByGroup, isVisible, sortByDateDesc, sortByOrder, translationsOf } from './collections.ts'
import { paths, splitEntryId, type Alternates } from './routes.ts'

/** Taslaklar yalnız `npm run dev` sırasında görünür. */
const INCLUDE_DRAFTS = import.meta.env.DEV

export type Post = CollectionEntry<'blog'>
export type Doc = CollectionEntry<'belgeler'>
export type Page = CollectionEntry<'sayfalar'>

/** İçerik girdisinin dili ve kısa adı ("tr/ilk-yazi" → { locale: 'tr', slug: 'ilk-yazi' }). */
export const entryLocale = (entry: { id: string }): Locale => splitEntryId(entry.id).locale
export const entrySlug = (entry: { id: string }): string => splitEntryId(entry.id).slug

/** Bir dildeki yayımlanmış yazılar, yeniden eskiye. */
export async function getPosts(locale: Locale): Promise<Post[]> {
  const posts = await getCollection(
    'blog',
    (entry) => entryLocale(entry) === locale && isVisible(entry, INCLUDE_DRAFTS),
  )
  return sortByDateDesc(posts)
}

/** Bir dildeki belgeler, yan menü sırasıyla. */
export async function getDocs(locale: Locale): Promise<Doc[]> {
  const docs = await getCollection(
    'belgeler',
    (entry) => entryLocale(entry) === locale && isVisible(entry, INCLUDE_DRAFTS),
  )
  return sortByOrder(docs)
}

export async function getDocGroups(locale: Locale) {
  return groupByGroup(await getDocs(locale))
}

/** Bir dildeki serbest sayfalar (Hakkında, Gizlilik…). */
export async function getPages(locale: Locale): Promise<Page[]> {
  return getCollection('sayfalar', (entry) => entryLocale(entry) === locale && isVisible(entry, INCLUDE_DRAFTS))
}

type DataCollection = keyof DataEntryMap

/**
 * Veri koleksiyonunun o dildeki içeriği (src/content/<koleksiyon>/<dil>.json).
 * Dosya yoksa ne yapılacağını söyleyen bir hatayla durur.
 */
export async function getData<C extends DataCollection>(
  collection: C,
  locale: Locale,
): Promise<CollectionEntry<C>['data']> {
  const entries = await getCollection(collection)
  const entry = entries.find((candidate) => candidate.id === locale)
  if (entry === undefined) {
    throw new Error(
      `"${collection}" verisi "${locale}" dili için bulunamadı. src/content/${collection}/${locale}.json dosyasını oluşturun ` +
        `(var olan bir dilin dosyasını kopyalayıp çevirebilirsiniz).`,
    )
  }
  return entry.data
}

/** Bir girdinin bütün dillerdeki karşılıklarının adresleri (hreflang ve dil değiştirici için). */
export function alternatesOf<E extends { id: string; data: { translationKey?: string | undefined } }>(
  entry: E,
  all: readonly E[],
  pathOf: (locale: Locale, slug: string) => string,
): Alternates {
  const found = translationsOf(entry, all, entryLocale)
  const result: Alternates = {}
  for (const [locale, translation] of Object.entries(found) as [Locale, E][]) {
    result[locale] = pathOf(locale, entrySlug(translation))
  }
  return result
}

/** Bütün dillerdeki yazılar (çeviri eşleştirmek için). */
export const getAllPosts = () => getCollection('blog', (entry) => isVisible(entry, INCLUDE_DRAFTS))
export const getAllDocs = () => getCollection('belgeler', (entry) => isVisible(entry, INCLUDE_DRAFTS))
export const getAllPages = () => getCollection('sayfalar', (entry) => isVisible(entry, INCLUDE_DRAFTS))

export { paths }
