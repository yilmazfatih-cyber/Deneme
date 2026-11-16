/**
 * Bileşenlerin kullandığı adres yardımcıları. Sitedeki BÜTÜN iç bağlantılar `link()` içinden geçer; böylece site
 * bir alt klasörde (/depo-adi/) yayınlandığında da bağlantılar kırılmaz.
 *   <a href={link('/blog/')}>         → "/blog/" ya da "/depo-adi/blog/"
 *   absoluteUrl('/blog/')              → "https://www.ornek.com/blog/" (canonical, paylaşım kartı, site haritası)
 * Kim kullanır: bütün .astro bileşenleri ve sayfalar. Saf karşılıkları: src/lib/paths.ts (testli).
 * Kural: .astro dosyalarına href="/…" biçiminde elle iç adres yazılmaz (tests/rules/source.test.ts denetler).
 */
import { stripBase, toAbsolute, withBase } from './paths.ts'

const BASE = import.meta.env.BASE_URL
const SITE = import.meta.env.SITE ?? 'https://sedir.example'

/** Mantıksal iç yol → yayın yolu ("/blog/" → "/depo/blog/"). Dış adreslere dokunmaz. */
export function link(path: string): string {
  return withBase(path, BASE)
}

/** Mantıksal iç yol → tam adres. */
export function absoluteUrl(path: string): string {
  return toAbsolute(path, SITE, BASE)
}

/** Tarayıcının gördüğü yol → mantıksal yol ("/depo/blog/" → "/blog/"). */
export function logicalPath(pathname: string): string {
  return stripBase(pathname, BASE)
}

/** Sayfanın paylaşım görselinin mantıksal yolu: "/blog/yazi/" → "/og/blog/yazi.png", "/" → "/og/index.png". */
export function ogImagePath(pagePath: string): string {
  const name = pagePath.replace(/\.html$/u, '').replace(/^\/+|\/+$/gu, '')
  return `/og/${name === '' ? 'index' : name}.png`
}
