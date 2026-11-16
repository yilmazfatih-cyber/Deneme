/**
 * Derleme sonrası (astro:build:done) her sayfa için paylaşım görseli üretir. Hiçbir ayar gerektirmez:
 * sayfanın <meta property="og:image"> etiketinin gösterdiği yola (/og/…png) sayfanın og:title ve og:description
 * değerleriyle bir kart çizer. Sağ üstteki etiket, sayfanın kırıntı yolundan (BreadcrumbList) gelir.
 * Aynı içerik için görsel önbellekten alınır (node_modules/.cache/havuz-site-og/), ikinci derleme hızlıdır.
 * Kim kullanır: astro.config.ts. Çizim: src/integrations/og-render.ts.
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AstroIntegration } from 'astro'
import { buildTheme } from '../lib/theme.ts'
import { attr, findAll, listHtmlFiles, meta, parseHtml, type HtmlDocument } from './html.ts'
import { renderOgCard, renderTouchIcon, TEMPLATE_VERSION, type OgCard } from './og-render.ts'

/** Kırıntı yolunun sondan bir önceki öğesi: ["Sedir", "Blog", "Yazı"] → "Blog". */
export function kickerFromJsonLd(document: HtmlDocument): string {
  for (const script of findAll(
    document,
    (element) => element.tagName === 'script' && attr(element, 'type') === 'application/ld+json',
  )) {
    const text = script.childNodes.map((child) => ('value' in child ? child.value : '')).join('')
    try {
      const data = JSON.parse(text) as { '@type'?: string; itemListElement?: { name?: string }[] }
      const items = data['@type'] === 'BreadcrumbList' ? (data.itemListElement ?? []) : []
      if (items.length >= 3) return items[items.length - 2]?.name ?? ''
    } catch {
      // Geçersiz JSON-LD'yi denetim betiği ayrıca bildirir.
    }
  }
  return ''
}

export function ogImages(options: { siteName: string; brand: { primary: string; accent: string } }): AstroIntegration {
  let base = '/'
  let cacheDir = ''
  return {
    name: 'site-og-images',
    hooks: {
      'astro:config:done': ({ config }) => {
        base = config.base
        cacheDir = path.join(fileURLToPath(config.root), 'node_modules', '.cache', 'havuz-site-og')
      },
      'astro:build:done': async ({ dir, logger }) => {
        const root = fileURLToPath(dir)
        const light = buildTheme(options.brand, 'light')
        const colors: OgCard['colors'] = {
          page: light.page ?? '#ffffff',
          ink: light.ink ?? '#000000',
          muted: light.muted ?? '#555555',
          brand: light.brand ?? options.brand.primary,
          onBrand: light['on-brand'] ?? '#ffffff',
          brandSoft: light['brand-soft'] ?? '#eeeeee',
          brandInk: light['brand-ink'] ?? options.brand.primary,
          line: light.line ?? '#dddddd',
        }
        await mkdir(cacheDir, { recursive: true })
        let created = 0
        let cached = 0
        for (const file of await listHtmlFiles(root)) {
          const document = parseHtml(await readFile(path.join(root, file), 'utf8'))
          const image = meta(document, 'og:image')
          if (image === undefined) continue
          const imagePath = new URL(image).pathname
          const prefix = base.endsWith('/') ? base : `${base}/`
          if (!imagePath.startsWith(prefix)) {
            throw new Error(`${file}: og:image adresi alt klasörle ("${prefix}") başlamıyor: ${image}`)
          }
          const card: OgCard = {
            title: meta(document, 'og:title') ?? options.siteName,
            description: meta(document, 'og:description') ?? '',
            kicker: kickerFromJsonLd(document),
            siteName: meta(document, 'og:site_name') ?? options.siteName,
            host: new URL(image).host,
            colors,
          }
          const key = createHash('sha256').update(JSON.stringify({ card, TEMPLATE_VERSION })).digest('hex').slice(0, 24)
          const cacheFile = path.join(cacheDir, `${key}.png`)
          let png: Buffer
          try {
            png = await readFile(cacheFile)
            cached += 1
          } catch {
            const missing: string[] = []
            png = await renderOgCard(card, missing)
            if (missing.length > 0) {
              logger.warn(
                `${file}: paylaşım görselinde gösterilemeyen karakter: "${missing.join('')}" (kutu olarak çizildi).`,
              )
            }
            await writeFile(cacheFile, png)
            created += 1
          }
          const target = path.join(root, decodeURIComponent(imagePath.slice(prefix.length)))
          await mkdir(path.dirname(target), { recursive: true })
          await writeFile(target, png)
        }
        await writeFile(path.join(root, 'apple-touch-icon.png'), await renderTouchIcon(colors))
        logger.info(`Paylaşım görselleri hazır: ${created} yeni, ${cached} önbellekten.`)
      },
    },
  }
}
