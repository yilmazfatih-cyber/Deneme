/**
 * RSS akışı üretimi (dil başına bir akış: /rss.xml, /en/rss.xml). Bağlantılar tam adres olarak yazılır;
 * site alt klasörde yayınlansa da doğru çalışır.
 * Kim kullanır: src/pages/rss.xml.ts ve src/pages/en/rss.xml.ts.
 */
import rss from '@astrojs/rss'
import { useTranslations } from '../i18n/index.ts'
import { entrySlug, getPosts } from './content.ts'
import { paths } from './routes.ts'
import { fill } from './text.ts'
import { absoluteUrl } from './url.ts'
import { siteConfig, type Locale } from '../site.config.ts'

export async function blogFeed(locale: Locale): Promise<Response> {
  const t = useTranslations(locale)
  const posts = await getPosts(locale)
  return rss({
    title: fill(t.blog.feedTitle, { site: siteConfig.name }),
    description: t.blog.description,
    site: absoluteUrl(paths.home(locale)),
    trailingSlash: true,
    customData: `<language>${siteConfig.locales[locale].lang}</language>`,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.date,
      link: absoluteUrl(paths.post(locale, entrySlug(post))),
      categories: [...post.data.tags],
    })),
  })
}
