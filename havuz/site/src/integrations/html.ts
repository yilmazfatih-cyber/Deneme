/**
 * Derlenmiş HTML dosyalarını okumak için küçük yardımcılar (parse5 üzerine). Derleme sonrası tümleşimler
 * (OG görselleri, arama dizini) ve denetim betiği (scripts/check-site.ts) kullanır. Yalnız Node'da çalışır.
 * Genişletme: yeni bir sorgu gerekiyorsa burada saf bir işlev olarak yazın; tests/unit/html.test.ts'e örnek ekleyin.
 */
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { parse, type DefaultTreeAdapterTypes } from 'parse5'

export type HtmlDocument = DefaultTreeAdapterTypes.Document
export type HtmlElement = DefaultTreeAdapterTypes.Element
type HtmlNode = DefaultTreeAdapterTypes.ChildNode | DefaultTreeAdapterTypes.Document

export const parseHtml = (html: string): HtmlDocument => parse(html)

const isElement = (node: HtmlNode): node is HtmlElement => 'tagName' in node

/** Ağaçtaki bütün öğeleri belge sırasıyla gezer. `visit` false dönerse o öğenin altına inilmez. */
export function walk(node: HtmlNode, visit: (element: HtmlElement) => boolean | void): void {
  const children = 'childNodes' in node ? node.childNodes : []
  for (const child of children) {
    if (!isElement(child)) continue
    if (visit(child) === false) continue
    walk(child, visit)
    if (child.tagName === 'template' && 'content' in child)
      walk(child.content as DefaultTreeAdapterTypes.DocumentFragment as never, visit)
  }
}

/** Koşula uyan bütün öğeler. */
export function findAll(root: HtmlNode, predicate: (element: HtmlElement) => boolean): HtmlElement[] {
  const found: HtmlElement[] = []
  walk(root, (element) => {
    if (predicate(element)) found.push(element)
  })
  return found
}

export const findFirst = (root: HtmlNode, predicate: (element: HtmlElement) => boolean): HtmlElement | undefined =>
  findAll(root, predicate)[0]

/** Öznitelik değeri (yoksa undefined). */
export function attr(element: HtmlElement, name: string): string | undefined {
  return element.attrs.find((attribute) => attribute.name === name)?.value
}

export const hasAttr = (element: HtmlElement, name: string): boolean => attr(element, name) !== undefined

/** <meta property|name="…" content="…"> değeri. */
export function meta(document: HtmlDocument, key: string): string | undefined {
  const element = findFirst(
    document,
    (candidate) =>
      candidate.tagName === 'meta' && (attr(candidate, 'property') === key || attr(candidate, 'name') === key),
  )
  return element ? attr(element, 'content') : undefined
}

/** Öğenin metni. `skip` true dönen öğeler (ve altları) atlanır. Blok öğeler arasına boşluk konur. */
export function textContent(node: HtmlNode, skip: (element: HtmlElement) => boolean = () => false): string {
  const parts: string[] = []
  const visit = (current: HtmlNode) => {
    for (const child of 'childNodes' in current ? current.childNodes : []) {
      if (child.nodeName === '#text' && 'value' in child) parts.push(child.value)
      else if (isElement(child) && !skip(child)) {
        parts.push(' ')
        visit(child)
        parts.push(' ')
      }
    }
  }
  visit(node)
  return parts.join('').replace(/\s+/gu, ' ').trim()
}

/** Klasördeki bütün .html dosyaları (alt klasörler dâhil), göreli yollarıyla, sıralı. */
export async function listHtmlFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
    .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
    .sort()
}

/** dist içindeki dosyanın yayın yolu: "blog/yazi/index.html" → "/blog/yazi/", "404.html" → "/404.html" (alt klasörsüz). */
export function pagePathOf(relativeFile: string): string {
  if (relativeFile === 'index.html') return '/'
  if (relativeFile.endsWith('/index.html')) return `/${relativeFile.slice(0, -'index.html'.length)}`
  return `/${relativeFile}`
}
