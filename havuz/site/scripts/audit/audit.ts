/**
 * Derlenmiş siteyi (dist/) baştan sona denetler: sayfa kuralları (rules.ts), kırık bağlantı ve çapa (links.ts),
 * hreflang karşılıklılığı, yinelenen başlık, sayfa ağırlığı bütçesi (budget.ts) ve site dosyaları
 * (robots.txt, site haritası, RSS, 404, simgeler, arama dizini).
 * Kim kullanır: scripts/check-site.ts. Testler: tests/unit/audit-rules.test.ts.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { attr, findAll, listHtmlFiles, pagePathOf, parseHtml, type HtmlDocument } from '../../src/integrations/html.ts'
import { BUDGET, formatKb, measurePage, type Weight } from './budget.ts'
import { classify, collectReferences } from './links.ts'
import { pageRules, type Issue, type PageContext } from './rules.ts'

export interface AuditOptions {
  /** dist klasörü (mutlak yol) */
  root: string
  /** "https://sedir.example" */
  site: string
  /** "/" ya da "/alt/klasor/" */
  base: string
  /** Varsayılan dil ("tr") ve kendi klasöründe yayınlanan diğer diller (["en"]). */
  defaultLang: string
  prefixedLangs: string[]
}

export interface AuditResult {
  pages: number
  issues: Issue[]
  heaviest: Record<keyof Weight, { file: string; bytes: number }>
}

interface LoadedPage {
  file: string
  url: string
  document: HtmlDocument
  bytes: number
  ids: Set<string>
}

const REQUIRED_FILES = [
  'index.html',
  '404.html',
  'robots.txt',
  'sitemap-index.xml',
  'rss.xml',
  'favicon.svg',
  'apple-touch-icon.png',
  'pagefind/pagefind.js',
]

export async function auditSite(options: AuditOptions): Promise<AuditResult> {
  const { root, site, base } = options
  const issues: Issue[] = []
  const prefix = base.slice(0, -1)

  /** Yayın yolu → dist içindeki dosya. Sayfa yolları index.html'e gider. */
  const fileFor = (published: string): string | undefined => {
    if (!(published === prefix || published.startsWith(base))) return undefined
    const relative = published.slice(base.length)
    const candidate = path.join(root, relative.endsWith('/') || relative === '' ? `${relative}index.html` : relative)
    return existsSync(candidate) && statSync(candidate).isFile() ? candidate : undefined
  }

  const pages: LoadedPage[] = []
  for (const file of await listHtmlFiles(root)) {
    if (file.startsWith('pagefind/')) continue
    const html = readFileSync(path.join(root, file), 'utf8')
    const document = parseHtml(html)
    const ids = new Set(
      findAll(document, (element) => attr(element, 'id') !== undefined).map((element) => attr(element, 'id') ?? ''),
    )
    pages.push({ file, url: `${prefix}${pagePathOf(file)}`, document, bytes: Buffer.byteLength(html, 'utf8'), ids })
  }
  const byUrl = new Map(pages.map((page) => [page.url, page]))

  for (const name of REQUIRED_FILES) {
    if (!existsSync(path.join(root, name)))
      issues.push({ file: name, rule: 'site-dosyasi', message: `${name} üretilmemiş. Derleme tamamlandı mı?` })
  }

  const assetCache = new Map<string, string | undefined>()
  const assets = {
    read: (published: string) => {
      if (!assetCache.has(published)) {
        const file = fileFor(published)
        assetCache.set(published, file ? readFileSync(file, 'utf8') : undefined)
      }
      return assetCache.get(published)
    },
  }

  const heaviest: AuditResult['heaviest'] = {
    html: { file: '', bytes: 0 },
    css: { file: '', bytes: 0 },
    js: { file: '', bytes: 0 },
  }

  for (const page of pages) {
    const firstSegment = page.url.slice(base.length).split('/')[0] ?? ''
    const expectedLang = options.prefixedLangs.includes(firstSegment) ? firstSegment : options.defaultLang
    const context: PageContext = {
      file: page.file,
      url: page.url,
      document: page.document,
      bytes: page.bytes,
      site,
      base,
      expectedLang,
    }
    for (const rule of pageRules) issues.push(...rule(context))

    // Bağlantılar ve çapalar
    for (const reference of collectReferences(page.document)) {
      const result = classify(reference.value, { site, base, pageUrl: page.url })
      if (result.type === 'skip') continue
      if (result.type === 'error') {
        issues.push({ file: page.file, rule: 'baglanti', message: `${reference.source}: ${result.message}` })
        continue
      }
      const targetFile = fileFor(result.path)
      if (targetFile === undefined) {
        issues.push({
          file: page.file,
          rule: 'kirik-baglanti',
          message: `${reference.source} "${reference.value}" → hedef bulunamadı. Adresi düzeltin ya da sayfayı oluşturun.`,
        })
        continue
      }
      if (result.hash !== '' && targetFile.endsWith('.html')) {
        const target = byUrl.get(result.path)
        const id = decodeURIComponent(result.hash)
        if (target && !target.ids.has(id)) {
          issues.push({
            file: page.file,
            rule: 'kirik-capa',
            message: `"${reference.value}" → hedef sayfada id="${id}" yok. Bölüm adını (ör. site.config.ts → nav ya da i18n → home.sections) kontrol edin.`,
          })
        }
      }
    }

    // Ağırlık bütçesi
    const toPath = (value: string) => {
      const result = classify(value, { site, base, pageUrl: page.url })
      return result.type === 'internal' ? result.path : undefined
    }
    const weight = measurePage(page.document, page.bytes, assets, toPath)
    for (const kind of ['html', 'css', 'js'] as const) {
      if (weight[kind] > heaviest[kind].bytes) heaviest[kind] = { file: page.file, bytes: weight[kind] }
      if (weight[kind] > BUDGET[kind]) {
        issues.push({
          file: page.file,
          rule: 'butce',
          message: `${kind.toLocaleUpperCase('en-US')} ${formatKb(weight[kind])}; sınır ${formatKb(BUDGET[kind])}. Sayfayı hafifletin ya da gerekçesini yazıp sınırı scripts/audit/budget.ts içinde değiştirin.`,
        })
      }
    }
  }

  issues.push(...checkUniqueTitles(pages), ...checkHreflang(pages, site), ...checkSiteFiles(options, fileFor, pages))
  return { pages: pages.length, issues, heaviest }
}

function checkUniqueTitles(pages: LoadedPage[]): Issue[] {
  // Başlık dil içinde tek olmalı ("Blog" hem Türkçe hem İngilizce sitede olabilir).
  const byTitle = new Map<string, string[]>()
  for (const page of pages) {
    const html = findAll(page.document, (element) => element.tagName === 'html')[0]
    const lang = html ? (attr(html, 'lang') ?? '') : ''
    const title = findAll(page.document, (element) => element.tagName === 'title')[0]
    const text = title ? title.childNodes.map((child) => ('value' in child ? child.value : '')).join('') : ''
    if (text === '') continue
    const key = `${lang}\u0000${text}`
    byTitle.set(key, [...(byTitle.get(key) ?? []), page.file])
  }
  return [...byTitle.entries()]
    .filter(([, files]) => files.length > 1)
    .map(([key, files]) => ({
      file: files[0] ?? '',
      rule: 'yinelenen-baslik',
      message: `"${key.split('\u0000')[1] ?? ''}" başlığı ${files.length} sayfada aynı: ${files.join(', ')}. Her sayfanın başlığı farklı olmalı.`,
    }))
}

function checkHreflang(pages: LoadedPage[], site: string): Issue[] {
  const issues: Issue[] = []
  const alternatesOf = (page: LoadedPage) =>
    new Map(
      findAll(
        page.document,
        (element) =>
          element.tagName === 'link' && attr(element, 'rel') === 'alternate' && attr(element, 'hreflang') !== undefined,
      ).map((element) => [attr(element, 'hreflang') ?? '', attr(element, 'href') ?? ''] as const),
    )
  const byAbsolute = new Map(pages.map((page) => [new URL(page.url, site).href, page]))
  for (const page of pages) {
    const own = new URL(page.url, site).href
    const alternates = alternatesOf(page)
    if (alternates.size === 0) continue
    if (![...alternates.values()].includes(own)) {
      issues.push({ file: page.file, rule: 'hreflang', message: 'hreflang listesi sayfanın kendisini içermiyor.' })
    }
    for (const [lang, href] of alternates) {
      if (lang === 'x-default' || href === own) continue
      const other = byAbsolute.get(href)
      if (other === undefined) continue
      if (![...alternatesOf(other).values()].includes(own)) {
        issues.push({
          file: page.file,
          rule: 'hreflang',
          message: `${lang} karşılığı (${href}) bu sayfayı geri göstermiyor. İki dosyada da aynı translationKey olmalı.`,
        })
      }
    }
  }
  return issues
}

function checkSiteFiles(
  options: AuditOptions,
  fileFor: (published: string) => string | undefined,
  pages: LoadedPage[],
): Issue[] {
  const issues: Issue[] = []
  const prefix = new URL(options.base, options.site).href
  const robots = fileFor(`${options.base}robots.txt`)
  if (robots && !readFileSync(robots, 'utf8').includes(`Sitemap: ${prefix}sitemap-index.xml`)) {
    issues.push({
      file: 'robots.txt',
      rule: 'robots',
      message: `robots.txt "Sitemap: ${prefix}sitemap-index.xml" satırını içermeli.`,
    })
  }
  const index = fileFor(`${options.base}sitemap-index.xml`)
  if (index) {
    const listed = new Set<string>()
    for (const [, loc] of readFileSync(index, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/gu)) {
      if (!loc?.startsWith(prefix)) {
        issues.push({
          file: 'sitemap-index.xml',
          rule: 'site-haritasi',
          message: `Adres "${prefix}" ile başlamıyor: ${loc}`,
        })
        continue
      }
      const sitemap = fileFor(new URL(loc).pathname)
      if (!sitemap) continue
      for (const [, url] of readFileSync(sitemap, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/gu)) {
        if (!url) continue
        listed.add(url)
        if (!url.startsWith(prefix) || fileFor(new URL(url).pathname) === undefined) {
          issues.push({
            file: path.basename(sitemap),
            rule: 'site-haritasi',
            message: `Site haritasındaki adres bulunamadı: ${url}`,
          })
        }
      }
    }
    for (const page of pages) {
      const absolute = new URL(page.url, options.site).href
      const noindex =
        findAll(page.document, (element) => element.tagName === 'meta' && attr(element, 'name') === 'robots').length > 0
      if (!noindex && !listed.has(absolute)) {
        issues.push({ file: page.file, rule: 'site-haritasi', message: `Sayfa site haritasında yok: ${absolute}` })
      }
    }
  }
  for (const feed of [
    `${options.base}rss.xml`,
    ...options.prefixedLangs.map((lang) => `${options.base}${lang}/rss.xml`),
  ]) {
    const file = fileFor(feed)
    if (!file) continue
    for (const [, link] of readFileSync(file, 'utf8').matchAll(/<link>([^<]+)<\/link>/gu)) {
      if (link && link.startsWith(prefix) && fileFor(new URL(link).pathname) === undefined) {
        issues.push({
          file: feed.slice(options.base.length),
          rule: 'rss',
          message: `RSS bağlantısı bulunamadı: ${link}`,
        })
      }
    }
  }
  return issues
}
