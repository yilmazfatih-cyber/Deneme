/**
 * Sayfa ağırlığı bütçesi: her sayfanın HTML, CSS ve başlangıç JS boyutu (sıkıştırılmamış bayt).
 * JS: sayfanın yüklediği betikler + onların durağan olarak içe aktardığı parçalar. Yalnız gerektiğinde dinamik
 * yüklenen parçalar (ör. arama arayüzü, import("…")) bütçeye girmez. JSON-LD ve speculationrules betik sayılmaz.
 * Kim kullanır: scripts/audit/audit.ts, tests/unit/audit-rules.test.ts.
 * Genişletme: sınırı değiştirmek için BUDGET değerlerini düzenleyin ve nedenini docs/KARARLAR.md'ye yazın.
 */
import { attr, findAll, textContent, type HtmlDocument } from '../../src/integrations/html.ts'

/** Sınırlar (bayt). Ölçüm ve gerekçe: docs/KARARLAR.md → "Performans bütçesi". */
export const BUDGET = {
  html: 150 * 1024,
  css: 60 * 1024,
  js: 20 * 1024,
}

export interface Weight {
  html: number
  css: number
  js: number
}

/** Küçültülmüş ES modülündeki durağan içe aktarmalar: import "./a.js", import{x}from"./b.js", export*from"./c.js". */
export function staticImports(code: string): string[] {
  const found: string[] = []
  const pattern = /(?:^|[^.\w$])(?:import|export)\s*(?:[^'"();=]*?\s*from\s*)?["']([^"']+)["']/gu
  for (const match of code.matchAll(pattern)) {
    if (match[1] !== undefined) found.push(match[1])
  }
  return found
}

const NON_SCRIPT_TYPES = new Set(['application/ld+json', 'speculationrules', 'application/json'])

export interface AssetReader {
  /** Yayın yolundaki dosyanın içeriği (yoksa undefined). */
  read(publishedPath: string): string | undefined
}

/** Bir sayfanın ağırlığı. `toPath` sayfadaki adresi yayın yoluna çevirir (iç adres değilse undefined). */
export function measurePage(
  document: HtmlDocument,
  htmlBytes: number,
  assets: AssetReader,
  toPath: (value: string) => string | undefined,
): Weight {
  const bytes = (text: string) => Buffer.byteLength(text, 'utf8')
  let css = 0
  for (const style of findAll(document, (element) => element.tagName === 'style')) css += bytes(textContent(style))
  for (const link of findAll(
    document,
    (element) => element.tagName === 'link' && attr(element, 'rel') === 'stylesheet',
  )) {
    const path = toPath(attr(link, 'href') ?? '')
    const content = path ? assets.read(path) : undefined
    if (content !== undefined) css += bytes(content)
  }

  let js = 0
  const visited = new Set<string>()
  const visitModule = (path: string) => {
    if (visited.has(path)) return
    visited.add(path)
    const code = assets.read(path)
    if (code === undefined) return
    js += bytes(code)
    for (const specifier of staticImports(code)) {
      if (specifier.startsWith('.') || specifier.startsWith('/'))
        visitModule(new URL(specifier, `https://x${path}`).pathname)
    }
  }
  for (const script of findAll(document, (element) => element.tagName === 'script')) {
    const type = attr(script, 'type') ?? ''
    if (NON_SCRIPT_TYPES.has(type)) continue
    const src = attr(script, 'src')
    if (src === undefined) {
      js += bytes(textContent(script))
      continue
    }
    const path = toPath(src)
    if (path) visitModule(path)
  }
  return { html: htmlBytes, css, js }
}

export const formatKb = (value: number) => `${(value / 1024).toFixed(1)} KB`
