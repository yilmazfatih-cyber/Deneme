/**
 * Markdown / MDX işleme eklentileri (Sätteri "hast" eklentileri). İçerik dosyaları HTML'e çevrilirken çalışır;
 * yazarın hiçbir şey yapmasına gerek kalmadan şunları sağlar:
 *   1. Başlık kimlikleri Türkçe'ye uygun ASCII olur: "## Özellikler ve Fiyat" → id="ozellikler-ve-fiyat"
 *   2. "/" ile başlayan bağlantı ve görsel adreslerine yayın alt klasörü eklenir (/blog/ → /depo/blog/)
 *   3. Kod blokları başlık çubuğu ve "Kopyala" düğmesiyle sarılır
 *   4. Tablolar dar ekranda yatay kaydırılabilir bir bölgeye alınır
 *   5. `> [!NOTE]` biçimindeki alıntılar uyarı kutusuna dönüşür (NOTE, TIP, IMPORTANT, WARNING, CAUTION)
 *   6. Başlıklı görseller (`![alt](./a.png "Başlık")`) şekil + alt yazıya dönüşür
 *   7. Dipnot etiketleri dosyanın diline çevrilir
 * Kim kullanır: astro.config.ts (`markdown.processor`), tests/unit/markdown.test.ts.
 * Genişletme: yeni bir dönüşüm → aşağıya `defineHastPlugin` ile ekleyin, `createMarkdownPlugins` listesine koyun,
 * tests/unit/markdown.test.ts içine girdi/çıktı örneği yazın.
 */
import { defineHastPlugin, type HastNode, type HastPluginEntry, type HastVisitorContext } from 'satteri'
import { useTranslations } from '../i18n/index.ts'
import { isExternal, withBase } from '../lib/paths.ts'
import { createSlugCounter, slugify } from '../lib/slug.ts'
import { defaultLocale, locales, type Locale } from '../site.config.ts'

type ElementNode = Extract<HastNode, { type: 'element' }>

const isElement = (node: HastNode | undefined, tagName?: string): node is ElementNode =>
  node?.type === 'element' && (tagName === undefined || node.tagName === tagName)

const element = (tagName: string, properties: Record<string, unknown>, children: HastNode[] = []): ElementNode =>
  ({ type: 'element', tagName, properties, children }) as ElementNode

const text = (value: string): HastNode => ({ type: 'text', value })

/** Özelliği hem "dataTitle" hem "data-title" yazımıyla arar (kaynağa göre iki biçim de gelebilir). */
function readProperty(node: ElementNode, ...names: string[]): string | undefined {
  for (const name of names) {
    const value = (node.properties as Record<string, unknown>)[name]
    if (typeof value === 'string') return value
  }
  return undefined
}

/** Dosya yolundan dili bulur: …/src/content/<koleksiyon>/<dil>/dosya.md → dil; bulunamazsa varsayılan dil. */
export function localeFromFile(fileURL: URL | undefined): Locale {
  const match = /\/content\/[^/]+\/([a-z]{2})\//u.exec(fileURL?.pathname ?? '')
  return locales.find((locale) => locale === match?.[1]) ?? defaultLocale
}

const labels = (ctx: HastVisitorContext) => useTranslations(localeFromFile(ctx.fileURL))

/** 1. Başlık kimlikleri. Her belge için ayrı sayaç tutulur (aynı başlık iki kez geçerse "-2" eklenir). */
const headingIds: HastPluginEntry = () => {
  const unique = createSlugCounter()
  return defineHastPlugin({
    name: 'site-heading-ids',
    element: {
      filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
      visit(node, ctx) {
        if (readProperty(node, 'id') !== undefined) return
        ctx.setProperty(node, 'id', unique(slugify(ctx.textContent(node)) || 'bolum'))
      },
    },
  })
}

/** 2. İç adreslere alt klasörü ekler. */
function baseLinks(base: string): HastPluginEntry {
  const rewrite = (value: string | undefined) =>
    value !== undefined && value.startsWith('/') && !isExternal(value) ? withBase(value, base) : undefined
  return defineHastPlugin({
    name: 'site-base-links',
    element: [
      {
        filter: ['a'],
        visit(node, ctx) {
          const href = rewrite(readProperty(node, 'href'))
          if (href !== undefined) ctx.setProperty(node, 'href', href)
        },
      },
      {
        filter: ['img'],
        visit(node, ctx) {
          const src = rewrite(readProperty(node, 'src'))
          if (src !== undefined) ctx.setProperty(node, 'src', src)
        },
      },
    ],
  })
}

/** 3. Kod bloğu sarmalayıcısı. Başlık, kod çitindeki `title="…"` üst verisinden gelir (bkz. shiki.ts). */
const codeBlocks = defineHastPlugin({
  name: 'site-code-blocks',
  element: {
    filter: ['pre'],
    visit(node, ctx) {
      const t = labels(ctx)
      const title = readProperty(node, 'dataTitle', 'data-title')
      const language = readProperty(node, 'dataLanguage', 'data-language')
      const caption = title ?? (language && language !== 'plaintext' ? language : undefined)
      const header = element('div', { className: ['code-header'] }, [
        element('span', { className: [title ? 'code-title' : 'code-lang'] }, [text(caption ?? '')]),
        element(
          'button',
          { type: 'button', className: ['code-copy'], dataCopyLabel: t.code.copy, dataCopiedLabel: t.code.copied },
          [text(t.code.copy)],
        ),
      ])
      ctx.replaceNode(node, element('div', { className: ['code-block'] }, [header, { ...node }]))
    },
  },
})

/** 4. Tablo kaydırma bölgesi (klavyeyle de kaydırılabilsin diye odaklanabilir). */
const tables = defineHastPlugin({
  name: 'site-tables',
  element: {
    filter: ['table'],
    visit(node, ctx) {
      ctx.wrapNode(
        node,
        element('div', {
          className: ['table-scroll'],
          tabIndex: 0,
          role: 'region',
          ariaLabel: labels(ctx).table.label,
        }),
      )
    },
  },
})

const ALERTS = { NOTE: 'note', TIP: 'tip', IMPORTANT: 'important', WARNING: 'warning', CAUTION: 'caution' } as const
const ALERT_MARKER = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*\n?/u

/** 5. GitHub tarzı uyarılar: `> [!TIP]` ile başlayan alıntı → <aside class="callout callout-tip">. */
const alerts = defineHastPlugin({
  name: 'site-alerts',
  element: {
    filter: ['blockquote'],
    visit(node, ctx) {
      const paragraph = node.children.find((child) => isElement(child, 'p'))
      const first = isElement(paragraph) ? paragraph.children[0] : undefined
      if (!isElement(paragraph) || first?.type !== 'text') return
      const match = ALERT_MARKER.exec(first.value)
      const marker = match?.[1] as keyof typeof ALERTS | undefined
      if (!match || marker === undefined) return
      const kind = ALERTS[marker]
      const rest = first.value.slice(match[0].length)
      const body = [
        element('p', { className: ['callout-title'] }, [text(labels(ctx).callout[kind])]),
        ...node.children.map((child) =>
          child === paragraph ? { ...paragraph, children: [text(rest), ...paragraph.children.slice(1)] } : child,
        ),
      ] as HastNode[]
      ctx.replaceNode(node, element('aside', { className: ['callout', `callout-${kind}`], role: 'note' }, body))
    },
  },
})

/** 6. Tek başına duran, başlığı olan görsel → <figure> + <figcaption>. */
const figures = defineHastPlugin({
  name: 'site-figures',
  element: {
    filter: ['p'],
    visit(node, ctx) {
      const content = node.children.filter((child) => !(child.type === 'text' && child.value.trim() === ''))
      const image = content[0]
      if (content.length !== 1 || !isElement(image, 'img')) return
      const caption = readProperty(image, 'title')
      if (caption === undefined || caption.trim() === '') return
      const { title: _title, ...properties } = image.properties as Record<string, unknown>
      ctx.replaceNode(
        node,
        element('figure', { className: ['figure'] }, [
          element('img', properties),
          element('figcaption', {}, [text(caption)]),
        ]),
      )
    },
  },
})

/** 7. Dipnot bölümünün başlığı ve "metne dön" etiketleri dosyanın diline çevrilir. */
const footnotes = defineHastPlugin({
  name: 'site-footnotes',
  element: [
    {
      filter: ['h2'],
      visit(node, ctx) {
        if (readProperty(node, 'id') !== 'footnote-label') return
        ctx.setField(node, 'children', [text(labels(ctx).footnotes.label)])
      },
    },
    {
      filter: ['a'],
      visit(node, ctx) {
        const properties = node.properties as Record<string, unknown>
        if (!('dataFootnoteBackref' in properties) && !('data-footnote-backref' in properties)) return
        ctx.setProperty(node, 'ariaLabel', labels(ctx).footnotes.back)
      },
    },
  ],
})

/** astro.config.ts'in kullandığı eklenti listesi. Sıra önemlidir: önce uyarılar/şekiller, sonra sarmalayıcılar. */
export function createMarkdownPlugins(options: { base: string }): HastPluginEntry[] {
  return [alerts, figures, headingIds, baseLinks(options.base), codeBlocks, tables, footnotes]
}
