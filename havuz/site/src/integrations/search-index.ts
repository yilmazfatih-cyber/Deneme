/**
 * Derleme sonrası (astro:build:done) site içi arama dizinini Pagefind ile üretir (dist/pagefind/).
 * Hangi sayfalar aranır: <main data-search-section="…"> taşıyanlar (BaseLayout'a `searchSection` verilen sayfalar).
 * Metinden çıkarılanlar: data-search-ignore taşıyan öğeler (menü, içindekiler, sayfalama…), betikler, simgeler.
 * Türkçe için metin iki biçimde dizinlenir: özgün + ASCII'ye katlanmış (src/lib/search-text.ts); arayüz sorguyu da
 * aynı biçimde katlar. Sonuçlarda sayfa başlığı, açıklaması ve bölüm adı gösterilir.
 * Kim kullanır: astro.config.ts. Arayüz: src/scripts/search-ui.ts.
 */
import { readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AstroIntegration } from 'astro'
import * as pagefind from 'pagefind'
import { foldForSearch } from '../lib/search-text.ts'
import { attr, findFirst, hasAttr, listHtmlFiles, meta, pagePathOf, parseHtml, textContent } from './html.ts'

/** Pagefind'ın kendi hazır arayüz dosyaları kullanılmıyor (kendi küçük arayüzümüz var); yayından çıkarılır. */
const UNUSED_PAGEFIND_FILES = [
  'pagefind-ui.js',
  'pagefind-ui.css',
  'pagefind-component-ui.js',
  'pagefind-component-ui.css',
  'pagefind-modular-ui.js',
  'pagefind-modular-ui.css',
  'pagefind-highlight.js',
]

const SKIP_TAGS = new Set(['script', 'style', 'svg', 'template', 'noscript', 'button', 'dialog', 'form'])

export function searchIndex(): AstroIntegration {
  return {
    name: 'site-search-index',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const root = fileURLToPath(dir)
        const { index, errors } = await pagefind.createIndex({})
        if (!index) throw new Error(`Arama dizini oluşturulamadı: ${errors.join(', ')}`)
        let count = 0
        for (const file of await listHtmlFiles(root)) {
          const document = parseHtml(await readFile(path.join(root, file), 'utf8'))
          const main = findFirst(
            document,
            (element) => element.tagName === 'main' && hasAttr(element, 'data-search-section'),
          )
          if (main === undefined) continue
          const html = findFirst(document, (element) => element.tagName === 'html')
          const lang = (html ? attr(html, 'lang') : undefined) ?? 'tr'
          const h1 = findFirst(main, (element) => element.tagName === 'h1')
          const title = h1 ? textContent(h1) : (meta(document, 'og:title') ?? '')
          const text = textContent(
            main,
            (element) =>
              SKIP_TAGS.has(element.tagName) ||
              hasAttr(element, 'data-search-ignore') ||
              attr(element, 'role') === 'img' ||
              attr(element, 'aria-hidden') === 'true',
          )
          // Pagefind, sonuç adresinin başına dizinin bulunduğu klasörü (alt klasör) kendisi ekler.
          const url = pagePathOf(file)
          const response = await index.addCustomRecord({
            url,
            language: lang.slice(0, 2),
            content: `${title}\n${text}\n${foldForSearch(`${title} ${text}`, lang)}`,
            meta: {
              title,
              description: meta(document, 'description') ?? '',
              section: attr(main, 'data-search-section') ?? '',
            },
          })
          if (response.errors.length > 0) logger.warn(`${file}: ${response.errors.join(', ')}`)
          count += 1
        }
        const output = path.join(root, 'pagefind')
        const written = await index.writeFiles({ outputPath: output })
        if (written.errors.length > 0) throw new Error(`Arama dizini yazılamadı: ${written.errors.join(', ')}`)
        await pagefind.close()
        await Promise.all(UNUSED_PAGEFIND_FILES.map((name) => rm(path.join(output, name), { force: true })))
        logger.info(`Arama dizini hazır: ${count} sayfa.`)
      },
    },
  }
}
