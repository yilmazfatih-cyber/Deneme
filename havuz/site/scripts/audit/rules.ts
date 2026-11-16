/**
 * Derlenmiş sayfa (dist/…/index.html) kuralları. Her kural bir sayfayı inceler ve sorun listesi döner.
 * Kim kullanır: scripts/audit/audit.ts (bütün siteyi gezer), tests/unit/audit-rules.test.ts (örnek HTML ile).
 * Genişletme: yeni kural → `PageRule` imzalı bir işlev yazın, `pageRules` listesine ekleyin, testine iyi/kötü örnek koyun.
 * İleti kuralı: Türkçe, sorunun yerini ve nasıl düzeltileceğini söyler.
 */
import { attr, findAll, meta, textContent, type HtmlDocument, type HtmlElement } from '../../src/integrations/html.ts'

export interface Issue {
  /** dist içindeki dosya: "blog/yazi/index.html" */
  file: string
  rule: string
  message: string
}

export interface PageContext {
  file: string
  /** Sayfanın yayın yolu (alt klasör dâhil): "/depo/blog/yazi/" */
  url: string
  document: HtmlDocument
  /** HTML dosyasının bayt cinsinden boyutu */
  bytes: number
  /** Kök adres: "https://sedir.example" */
  site: string
  /** Alt klasör: "/" ya da "/depo/" */
  base: string
  /** Sayfanın dili olması gereken değer (yoldan çıkarılır): "tr", "en" */
  expectedLang: string
}

export type PageRule = (page: PageContext) => Issue[]

const issue = (page: PageContext, rule: string, message: string): Issue => ({ file: page.file, rule, message })
const length = (value: string) => [...value].length

export const singleH1: PageRule = (page) => {
  const count = findAll(page.document, (element) => element.tagName === 'h1').length
  if (count === 1) return []
  return [
    issue(
      page,
      'tek-h1',
      count === 0
        ? 'Sayfada h1 yok. Her sayfanın tek bir ana başlığı olmalı (görünümde <h1> ekleyin).'
        : `Sayfada ${count} adet h1 var. Yalnız bir tane olmalı; alt başlıklar için h2/h3 kullanın.`,
    ),
  ]
}

export const htmlLang: PageRule = (page) => {
  const html = findAll(page.document, (element) => element.tagName === 'html')[0]
  const lang = html ? attr(html, 'lang') : undefined
  if (lang === undefined || lang === '')
    return [
      issue(
        page,
        'lang',
        '<html lang="…"> eksik. BaseLayout bunu site.config.ts → locales.<dil>.lang değerinden yazar.',
      ),
    ]
  if (!lang.startsWith(page.expectedLang)) {
    return [
      issue(
        page,
        'lang',
        `<html lang="${lang}"> ama bu adresteki sayfa "${page.expectedLang}" dilinde olmalı. Sayfa doğru dil klasöründe mi?`,
      ),
    ]
  }
  return []
}

export const titleRule: PageRule = (page) => {
  const element = findAll(page.document, (candidate) => candidate.tagName === 'title')[0]
  const title = element ? textContent(element) : ''
  if (title === '') return [issue(page, 'title', '<title> eksik ya da boş.')]
  if (length(title) > 80) {
    return [
      issue(
        page,
        'title',
        `<title> çok uzun (${length(title)} karakter, en fazla 80). İçeriğin "title" alanını kısaltın.`,
      ),
    ]
  }
  return []
}

export const descriptionRule: PageRule = (page) => {
  const description = meta(page.document, 'description')
  if (description === undefined || description.trim() === '') {
    return [issue(page, 'aciklama', '<meta name="description"> eksik. Sayfanın açıklamasını (description) yazın.')]
  }
  const size = length(description)
  if (size < 50 || size > 160) {
    return [
      issue(
        page,
        'aciklama',
        `Açıklama ${size} karakter; 50–160 arası olmalı. İçeriğin "description" alanını düzenleyin.`,
      ),
    ]
  }
  return []
}

export const canonicalRule: PageRule = (page) => {
  const link = findAll(page.document, (element) => element.tagName === 'link' && attr(element, 'rel') === 'canonical')
  if (link.length !== 1)
    return [
      issue(page, 'canonical', `Sayfada ${link.length} adet canonical bağlantısı var; tam olarak bir tane olmalı.`),
    ]
  const href = attr(link[0] as HtmlElement, 'href') ?? ''
  const expected = new URL(page.url, page.site).href
  if (page.file !== '404.html' && href !== expected) {
    return [
      issue(
        page,
        'canonical',
        `canonical "${href}" olmalıydı: "${expected}". Site adresi (SITE_URL) ve alt klasör (SITE_BASE) doğru mu?`,
      ),
    ]
  }
  return []
}

const REQUIRED_META = ['og:title', 'og:description', 'og:image', 'og:url', 'og:type', 'og:site_name', 'twitter:card']

export const openGraphRule: PageRule = (page) => {
  const issues: Issue[] = []
  for (const key of REQUIRED_META) {
    const value = meta(page.document, key)
    if (value === undefined || value.trim() === '')
      issues.push(issue(page, 'open-graph', `<meta property="${key}"> eksik (Seo.astro).`))
  }
  const image = meta(page.document, 'og:image')
  const prefix = new URL(page.base, page.site).href
  if (image !== undefined && !image.startsWith(prefix)) {
    issues.push(issue(page, 'open-graph', `og:image tam adres olmalı ve "${prefix}" ile başlamalı: ${image}`))
  }
  return issues
}

export const imageRule: PageRule = (page) => {
  const issues: Issue[] = []
  for (const image of findAll(page.document, (element) => element.tagName === 'img')) {
    const source = attr(image, 'src') ?? '(adres yok)'
    if (attr(image, 'alt') === undefined) {
      issues.push(
        issue(
          page,
          'gorsel-alt',
          `Görselde alt metni yok: ${source}. Görseli anlatan bir alt="…" yazın (süs görseli ise alt="").`,
        ),
      )
    }
    if (attr(image, 'width') === undefined || attr(image, 'height') === undefined) {
      issues.push(
        issue(
          page,
          'gorsel-boyut',
          `Görselde width/height yok: ${source}. Boyutsuz görsel yüklenince sayfa kayar (CLS); astro:assets ile ekleyin.`,
        ),
      )
    }
  }
  return issues
}

export const duplicateIdRule: PageRule = (page) => {
  const seen = new Map<string, number>()
  for (const element of findAll(page.document, (candidate) => attr(candidate, 'id') !== undefined)) {
    const id = attr(element, 'id') ?? ''
    seen.set(id, (seen.get(id) ?? 0) + 1)
  }
  return [...seen.entries()]
    .filter(([, count]) => count > 1)
    .map(([id, count]) => issue(page, 'yinelenen-id', `id="${id}" sayfada ${count} kez geçiyor; her id tek olmalı.`))
}

interface JsonLdNode {
  '@context'?: unknown
  '@type'?: unknown
  [key: string]: unknown
}

function checkJsonLdType(page: PageContext, data: JsonLdNode): Issue[] {
  const type = data['@type']
  const missing = (keys: string[]) =>
    keys
      .filter((key) => data[key] === undefined || data[key] === '')
      .map((key) => issue(page, 'json-ld', `${String(type)} içinde "${key}" eksik.`))
  if (type === 'BlogPosting' || type === 'TechArticle')
    return missing(['headline', 'datePublished', 'image', 'author', 'url'])
  if (type === 'Organization') return missing(['name', 'url', 'logo'])
  if (type === 'WebSite') return missing(['name', 'url'])
  if (type === 'BreadcrumbList') {
    const items = Array.isArray(data.itemListElement)
      ? (data.itemListElement as { position?: unknown; item?: unknown }[])
      : []
    if (items.length < 2) return [issue(page, 'json-ld', 'BreadcrumbList en az iki öğe içermeli.')]
    return items.flatMap((item, index) =>
      item.position !== index + 1 || typeof item.item !== 'string' || !item.item.startsWith('http')
        ? [
            issue(
              page,
              'json-ld',
              `BreadcrumbList ${index + 1}. öğe: position ${index + 1} ve tam adres (item) olmalı.`,
            ),
          ]
        : [],
    )
  }
  if (type === 'FAQPage') {
    const questions = Array.isArray(data.mainEntity)
      ? (data.mainEntity as { name?: unknown; acceptedAnswer?: { text?: unknown } }[])
      : []
    if (questions.length === 0) return [issue(page, 'json-ld', 'FAQPage en az bir soru içermeli.')]
    return questions.flatMap((question, index) =>
      typeof question.name !== 'string' || typeof question.acceptedAnswer?.text !== 'string'
        ? [issue(page, 'json-ld', `FAQPage ${index + 1}. soruda soru (name) ya da yanıt (acceptedAnswer.text) eksik.`)]
        : [],
    )
  }
  return []
}

export const jsonLdRule: PageRule = (page) => {
  const issues: Issue[] = []
  for (const script of findAll(
    page.document,
    (element) => element.tagName === 'script' && attr(element, 'type') === 'application/ld+json',
  )) {
    let data: JsonLdNode
    try {
      data = JSON.parse(textContent(script)) as JsonLdNode
    } catch (error) {
      issues.push(issue(page, 'json-ld', `JSON-LD geçerli JSON değil: ${(error as Error).message}`))
      continue
    }
    if (data['@context'] !== 'https://schema.org')
      issues.push(issue(page, 'json-ld', 'JSON-LD "@context": "https://schema.org" taşımalı.'))
    if (typeof data['@type'] !== 'string') issues.push(issue(page, 'json-ld', 'JSON-LD bir "@type" taşımalı.'))
    issues.push(...checkJsonLdType(page, data))
  }
  return issues
}

/** Bütün sayfa kuralları (bağlantı ve bütçe kuralları site düzeyinde, audit.ts içindedir). */
export const pageRules: PageRule[] = [
  singleH1,
  htmlLang,
  titleRule,
  descriptionRule,
  canonicalRule,
  openGraphRule,
  imageRule,
  duplicateIdRule,
  jsonLdRule,
]
