/**
 * Dinamik sayfaların (blog yazısı, etiket, belge, serbest sayfa) hangi adreslerde üretileceği.
 * Sayfa dosyaları (src/pages/…/[slug].astro) yalnız bu işlevleri çağırır; mantık tek yerde durur.
 * Genişletme: yeni bir içerik türü için aynı kalıpla bir `xPaths(locale)` işlevi yazın.
 */
import type { PaginateFunction } from 'astro'
import { collectTags } from './collections.ts'
import { entrySlug, getDocs, getPages, getPosts } from './content.ts'
import { slugify } from './slug.ts'
import { siteConfig, type Locale } from '../site.config.ts'

/** Blog listesi sayfaları: /blog/, /blog/2/, … */
export async function blogPagePaths(locale: Locale, paginate: PaginateFunction) {
  const posts = await getPosts(locale)
  return paginate(posts, { pageSize: siteConfig.blog.postsPerPage, props: { locale } })
}

/** Blog yazıları: /blog/<kisa-ad>/ */
export async function postPaths(locale: Locale) {
  const posts = await getPosts(locale)
  return posts.map((post) => ({ params: { slug: entrySlug(post) }, props: { post } }))
}

/** Etiket sayfaları: /blog/etiket/<etiket>/ */
export async function tagPaths(locale: Locale) {
  const posts = await getPosts(locale)
  return collectTags(posts, siteConfig.locales[locale].lang).map((tag) => ({
    params: { tag: tag.slug },
    props: { locale, tag, posts: posts.filter((post) => post.data.tags.some((name) => slugify(name) === tag.slug)) },
  }))
}

/** Belgeler: /belgeler/<kisa-ad>/ */
export async function docPaths(locale: Locale) {
  const docs = await getDocs(locale)
  return docs.map((doc) => ({ params: { slug: entrySlug(doc) }, props: { doc } }))
}

/** Serbest sayfalar: /<kisa-ad>/ */
export async function pagePaths(locale: Locale) {
  const pages = await getPages(locale)
  return pages.map((page) => ({ params: { slug: entrySlug(page) }, props: { page } }))
}
