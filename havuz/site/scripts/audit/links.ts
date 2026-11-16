/**
 * Sayfadaki adres başvurularını (a, link, img, srcset, script, og:image…) toplar ve sınıflandırır:
 * dış adres mi, iç adres mi, hatalı mı? İç adresler alt klasörle başlamalı ve sayfa yolları "/" ile bitmelidir.
 * Kim kullanır: scripts/audit/audit.ts, tests/unit/audit-rules.test.ts.
 */
import { attr, findAll, type HtmlDocument } from '../../src/integrations/html.ts'

export interface Reference {
  /** Nereden geldiği: "a[href]", "img[src]", "meta[og:image]"… */
  source: string
  value: string
}

export type Classified =
  { type: 'skip' } | { type: 'internal'; path: string; hash: string } | { type: 'error'; message: string }

const SRCSET_TAGS = new Set(['img', 'source'])

/** Sayfadaki bütün adres başvuruları. */
export function collectReferences(document: HtmlDocument): Reference[] {
  const references: Reference[] = []
  for (const element of findAll(document, () => true)) {
    const tag = element.tagName
    const href = attr(element, 'href')
    if ((tag === 'a' || tag === 'link' || tag === 'area') && href !== undefined) {
      references.push({ source: `${tag}[href]`, value: href })
    }
    const src = attr(element, 'src')
    if ((tag === 'img' || tag === 'script' || tag === 'source' || tag === 'iframe') && src !== undefined) {
      references.push({ source: `${tag}[src]`, value: src })
    }
    const srcset = attr(element, 'srcset')
    if (SRCSET_TAGS.has(tag) && srcset !== undefined) {
      for (const candidate of srcset.split(',')) {
        const url = candidate.trim().split(/\s+/u)[0]
        if (url) references.push({ source: `${tag}[srcset]`, value: url })
      }
    }
    const property = attr(element, 'property') ?? attr(element, 'name')
    const content = attr(element, 'content')
    if (
      tag === 'meta' &&
      content !== undefined &&
      (property === 'og:image' || property === 'og:url' || property === 'twitter:image')
    ) {
      references.push({ source: `meta[${property}]`, value: content })
    }
  }
  return references
}

/** Yolun son parçası bir dosya adı mı (uzantılı)? */
const looksLikeFile = (pathname: string) => /\.[a-z0-9]+$/iu.test(pathname.split('/').pop() ?? '')

/**
 * Adresi sınıflandırır. `site`: "https://sedir.example", `base`: "/" ya da "/depo/", `pageUrl`: sayfanın yayın yolu.
 */
export function classify(value: string, context: { site: string; base: string; pageUrl: string }): Classified {
  const trimmed = value.trim()
  if (trimmed === '') return { type: 'error', message: 'Boş adres (href="").' }
  if (/^(mailto|tel|data|blob):/iu.test(trimmed)) return { type: 'skip' }
  if (/^javascript:/iu.test(trimmed))
    return { type: 'error', message: `"javascript:" bağlantısı kullanılmaz: ${trimmed}` }
  if (trimmed.startsWith('#')) return { type: 'internal', path: context.pageUrl, hash: trimmed.slice(1) }

  let url: URL
  if (/^[a-z][a-z0-9+.-]*:/iu.test(trimmed) || trimmed.startsWith('//')) {
    url = new URL(trimmed, context.site)
    if (url.origin !== new URL(context.site).origin) return { type: 'skip' }
  } else if (trimmed.startsWith('/')) {
    url = new URL(trimmed, context.site)
  } else {
    return {
      type: 'error',
      message: `Göreli adres: "${trimmed}". İç bağlantılar "/" ile başlamalı (bileşenlerde link('/…'), Markdown'da [metin](/blog/…)).`,
    }
  }

  const path = decodeURI(url.pathname)
  if (context.base !== '/' && !(path === context.base.slice(0, -1) || path.startsWith(context.base))) {
    return {
      type: 'error',
      message: `"${trimmed}" alt klasörle ("${context.base}") başlamıyor; site alt klasörde kırılır. Adresi link('/…') ile yazın.`,
    }
  }
  if (!path.endsWith('/') && !looksLikeFile(path)) {
    return {
      type: 'error',
      message: `Sayfa adresi "/" ile bitmeli: "${trimmed}" → "${trimmed.replace(/(\?|#|$)/u, '/$1')}".`,
    }
  }
  return { type: 'internal', path, hash: url.hash.slice(1) }
}
