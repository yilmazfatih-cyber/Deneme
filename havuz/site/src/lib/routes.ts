/**
 * Adres haritası: her dilde hangi sayfa hangi adreste yayınlanır. Bütün adresler "mantıksal yol"dur (alt klasör
 * içermez); HTML'e yazılırken `link()` ile sarılır (src/lib/url.ts).
 * Kim kullanır: bütün sayfalar ve bileşenler (saf modül; testler ve betikler de içe aktarır).
 * Kural: buradaki klasör adları src/pages/ altındaki klasörlerle AYNI olmalıdır (tests/rules/routes.test.ts denetler).
 * Genişletme: yeni dil → SEGMENTS'e satır ekleyin; yeni sayfa türü → `paths`'e bir işlev ekleyin.
 */
import { defaultLocale, locales, type Locale } from '../site.config.ts'

interface Segments {
  /** Blog klasörü: /blog/ */
  blog: string
  /** Etiket sayfaları: /blog/etiket/<etiket>/ */
  tag: string
  /** Belgeler klasörü: /belgeler/ */
  docs: string
  /** İletişim sayfası: /iletisim/ */
  contact: string
}

// YENİ DİL BURAYA: adres parçaları src/pages/<dil>/ altındaki klasör ve dosya adlarıyla aynı olmalı.
const SEGMENTS: Record<Locale, Segments> = {
  tr: { blog: 'blog', tag: 'etiket', docs: 'belgeler', contact: 'iletisim' },
  en: { blog: 'blog', tag: 'tag', docs: 'docs', contact: 'contact' },
}

/** Dilin adres ön eki: varsayılan dil kökte ("") yayınlanır, diğerleri kendi klasöründe ("/en"). */
export function localePrefix(locale: Locale): string {
  return locale === defaultLocale ? '' : `/${locale}`
}

export function segments(locale: Locale): Segments {
  return SEGMENTS[locale]
}

/** Her sayfa türünün mantıksal yolu. Örnek: paths.post('tr', 'ilk-yazi') → "/blog/ilk-yazi/". */
export const paths = {
  home: (locale: Locale) => `${localePrefix(locale)}/`,
  blog: (locale: Locale, page = 1) =>
    page <= 1 ? `${localePrefix(locale)}/${SEGMENTS[locale].blog}/` : `${localePrefix(locale)}/${SEGMENTS[locale].blog}/${page}/`,
  post: (locale: Locale, slug: string) => `${localePrefix(locale)}/${SEGMENTS[locale].blog}/${slug}/`,
  tag: (locale: Locale, tagSlug: string) =>
    `${localePrefix(locale)}/${SEGMENTS[locale].blog}/${SEGMENTS[locale].tag}/${tagSlug}/`,
  docs: (locale: Locale) => `${localePrefix(locale)}/${SEGMENTS[locale].docs}/`,
  doc: (locale: Locale, slug: string) => `${localePrefix(locale)}/${SEGMENTS[locale].docs}/${slug}/`,
  contact: (locale: Locale) => `${localePrefix(locale)}/${SEGMENTS[locale].contact}/`,
  page: (locale: Locale, slug: string) => `${localePrefix(locale)}/${slug}/`,
  rss: (locale: Locale) => `${localePrefix(locale)}/rss.xml`,
}

/** Bir sayfanın bütün dillerdeki karşılığı (hreflang ve dil değiştirici için). */
export type Alternates = Partial<Record<Locale, string>>

/** Her dilde bulunan yapısal sayfalar (ana sayfa, blog, belgeler, iletişim) için karşılık tablosu üretir. */
export function alternatesFor(build: (locale: Locale) => string): Alternates {
  const result: Alternates = {}
  for (const locale of locales) result[locale] = build(locale)
  return result
}

/** Mantıksal yoldan dili bulur: "/en/blog/" → "en", "/blog/" → varsayılan dil. */
export function localeFromPath(pathname: string): Locale {
  const first = pathname.split('/').find((part) => part !== '')
  const match = locales.find((locale) => locale !== defaultLocale && locale === first)
  return match ?? defaultLocale
}

/**
 * İçerik dosyasının kimliğinden ("tr/ilk-yazi") dili ve kısa adı ayırır.
 * İçerik klasör düzeni: src/content/<koleksiyon>/<dil>/<kisa-ad>.md
 */
export function splitEntryId(id: string): { locale: Locale; slug: string } {
  const slash = id.indexOf('/')
  const first = slash === -1 ? id : id.slice(0, slash)
  const locale = locales.find((candidate) => candidate === first)
  if (locale === undefined || slash === -1) {
    throw new Error(
      `İçerik dosyası bir dil klasöründe olmalı: "${id}". Beklenen düzen: src/content/<koleksiyon>/<dil>/<kisa-ad>.md ` +
        `(diller: ${locales.join(', ')}).`,
    )
  }
  return { locale, slug: id.slice(slash + 1) }
}
