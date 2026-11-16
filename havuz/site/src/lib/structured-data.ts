/**
 * Yapısal veri (JSON-LD, schema.org) üreticileri. Arama motorları bu veriyle zengin sonuç (SSS, sayfa yolu,
 * yazı bilgisi) gösterebilir. Saf modül: tam adresleri çağıran verir.
 * Kim kullanır: src/components/Seo.astro ve sayfa görünümleri (src/views/), tests/unit/structured-data.test.ts.
 * Genişletme: yeni bir tür (ör. Product, Event) → aynı kalıpla bir işlev ekleyin; denetim betiği (scripts/check-site.ts)
 * her JSON-LD bloğunun geçerli JSON olduğunu ve @context/@type taşıdığını sınar.
 */

export type JsonLd = Record<string, unknown>

const CONTEXT = 'https://schema.org'

export interface OrganizationInput {
  name: string
  legalName: string
  url: string
  logo: string
  email: string
  telephone?: string | undefined
  foundingYear?: number | undefined
  sameAs: string[]
  address?: { street: string; city: string; postalCode?: string | undefined; country: string } | undefined
}

export function organization(input: OrganizationInput): JsonLd {
  const data: JsonLd = {
    '@context': CONTEXT,
    '@type': 'Organization',
    '@id': `${input.url}#organization`,
    name: input.name,
    legalName: input.legalName,
    url: input.url,
    logo: input.logo,
    email: input.email,
  }
  if (input.telephone) data.telephone = input.telephone
  if (input.foundingYear) data.foundingDate = String(input.foundingYear)
  if (input.sameAs.length > 0) data.sameAs = input.sameAs
  if (input.address) {
    data.address = {
      '@type': 'PostalAddress',
      streetAddress: input.address.street,
      addressLocality: input.address.city,
      ...(input.address.postalCode ? { postalCode: input.address.postalCode } : {}),
      addressCountry: input.address.country,
    }
  }
  return data
}

export function website(input: {
  name: string
  url: string
  description: string
  lang: string
  organizationUrl: string
}): JsonLd {
  return {
    '@context': CONTEXT,
    '@type': 'WebSite',
    '@id': `${input.url}#website`,
    name: input.name,
    url: input.url,
    description: input.description,
    inLanguage: input.lang,
    publisher: { '@id': `${input.organizationUrl}#organization` },
  }
}

export interface ArticleInput {
  type?: 'BlogPosting' | 'TechArticle'
  url: string
  headline: string
  description: string
  image: string
  datePublished: Date
  dateModified?: Date | undefined
  lang: string
  keywords: string[]
  author?: { name: string; url?: string | undefined } | undefined
  organizationUrl: string
  organizationName: string
}

export function article(input: ArticleInput): JsonLd {
  return {
    '@context': CONTEXT,
    '@type': input.type ?? 'BlogPosting',
    '@id': `${input.url}#article`,
    mainEntityOfPage: input.url,
    url: input.url,
    headline: input.headline,
    description: input.description,
    image: [input.image],
    datePublished: input.datePublished.toISOString(),
    dateModified: (input.dateModified ?? input.datePublished).toISOString(),
    inLanguage: input.lang,
    ...(input.keywords.length > 0 ? { keywords: input.keywords.join(', ') } : {}),
    author: input.author
      ? { '@type': 'Person', name: input.author.name, ...(input.author.url ? { url: input.author.url } : {}) }
      : { '@type': 'Organization', name: input.organizationName, url: input.organizationUrl },
    publisher: { '@id': `${input.organizationUrl}#organization` },
  }
}

export interface Crumb {
  label: string
  /** Tam adres. Son öğe (bulunulan sayfa) için de verilir. */
  url: string
}

export function breadcrumbList(crumbs: Crumb[]): JsonLd {
  return {
    '@context': CONTEXT,
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.label,
      item: crumb.url,
    })),
  }
}

export function faqPage(items: { question: string; answer: string }[]): JsonLd {
  return {
    '@context': CONTEXT,
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  }
}

/**
 * JSON-LD'yi <script> içine güvenle yazılacak metne çevirir. "<" kaçışlanır; böylece içerikte "</script>"
 * geçse bile sayfa bozulmaz (HTML'e kaçışsız kullanıcı verisi basılmaz kuralı).
 */
export function serializeJsonLd(data: JsonLd): string {
  return JSON.stringify(data)
    .replace(/</gu, '\\u003c')
    .replace(/\u2028/gu, '\\u2028')
    .replace(/\u2029/gu, '\\u2029')
}
