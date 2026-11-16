/**
 * İç adres yardımcıları (saf): "mantıksal yol" (/blog/) → yayın yolu (/depo-adi/blog/).
 * Site bir alt klasörde yayınlandığında bütün iç bağlantılar buradan geçtiği için kırılmaz.
 * Kim kullanır: src/lib/url.ts (bileşenler için `link()`), Markdown eklentileri, denetim betikleri, testler.
 * Genişletme: yeni bir adres kuralı gerekiyorsa buraya ekleyin; bileşenlerde elle "/alt-klasor" yazmayın.
 */

const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/iu

/** `https://`, `mailto:`, `tel:` ya da `//alan` ile başlayan adresler dış adrestir; onlara dokunulmaz. */
export function isExternal(href: string): boolean {
  return EXTERNAL.test(href)
}

/** Alt klasör yolunu tek biçime getirir: "", "/", "depo", "/depo", "depo/" → "/" ya da "/depo/". */
export function normalizeBase(base: string | undefined): string {
  const trimmed = (base ?? '').trim().replace(/^\/+|\/+$/gu, '')
  return trimmed === '' ? '/' : `/${trimmed}/`
}

/** Yolun son parçası dosya mı (uzantısı var mı)? "/rss.xml" → evet, "/blog/" ve "/blog" → hayır. */
function looksLikeFile(pathname: string): boolean {
  const last = pathname.split('/').pop() ?? ''
  return /\.[a-z0-9]+$/iu.test(last)
}

/**
 * Mantıksal iç yolu yayın yoluna çevirir.
 * - Dış adresler, yalnız "#bölüm" ve yalnız "?sorgu" olduğu gibi döner.
 * - Sayfa yollarının sonuna "/" eklenir ("/blog" → "/blog/"); dosya yollarına eklenmez ("/rss.xml").
 * - `base` her biçimde verilebilir ("/depo", "/depo/").
 */
export function withBase(path: string, base: string): string {
  if (path === '' || isExternal(path) || path.startsWith('#') || path.startsWith('?')) return path
  if (!path.startsWith('/')) {
    throw new Error(
      `İç adres "/" ile başlamalı: "${path}". Örnek: "/blog/". Dış adresse "https://" ile yazın (src/lib/paths.ts).`,
    )
  }
  const hashIndex = path.indexOf('#')
  const hash = hashIndex === -1 ? '' : path.slice(hashIndex)
  const beforeHash = hashIndex === -1 ? path : path.slice(0, hashIndex)
  const queryIndex = beforeHash.indexOf('?')
  const query = queryIndex === -1 ? '' : beforeHash.slice(queryIndex)
  let pathname = queryIndex === -1 ? beforeHash : beforeHash.slice(0, queryIndex)

  if (!pathname.endsWith('/') && !looksLikeFile(pathname)) pathname += '/'
  return normalizeBase(base).slice(0, -1) + pathname + query + hash
}

/** Yayın yolundan alt klasörü çıkarıp mantıksal yolu verir: ("/depo/blog/", "/depo/") → "/blog/". */
export function stripBase(pathname: string, base: string): string {
  const prefix = normalizeBase(base).slice(0, -1)
  if (prefix !== '' && (pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    const rest = pathname.slice(prefix.length)
    return rest === '' ? '/' : rest
  }
  return pathname
}

/** Mantıksal yolun tam adresi (canonical, Open Graph, site haritası için). */
export function toAbsolute(path: string, site: string, base: string): string {
  if (isExternal(path)) return path
  return new URL(withBase(path, base), site).href
}

/** İki mantıksal yol aynı sayfayı mı gösteriyor? (sondaki "/" ve "#bölüm" farkı yok sayılır) */
export function isSamePage(a: string, b: string): boolean {
  const clean = (value: string) => (value.split('#')[0] ?? '').split('?')[0]?.replace(/\/+$/u, '') ?? ''
  return clean(a) === clean(b)
}

/** `current`, `section` yolunun kendisi ya da altındaki bir sayfa mı? (menüde etkin öğeyi bulmak için) */
export function isWithinSection(current: string, section: string): boolean {
  const target = (section.split('#')[0] ?? '').replace(/\/+$/u, '')
  const here = current.replace(/\/+$/u, '')
  if (target === '') return here === ''
  return here === target || here.startsWith(`${target}/`)
}
