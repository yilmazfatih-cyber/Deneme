/**
 * Marka işareti (logo) SVG'si: yuvarlak köşeli kare içinde sedir ağacı. Tek kaynaktır; başlıktaki logo,
 * sekme simgesi (favicon.svg), Apple dokunma simgesi ve paylaşım görselleri bunu kullanır.
 * Kim kullanır: src/components/Logo.astro, src/pages/favicon.svg.ts, src/integrations/og-images.ts.
 * Genişletme: kendi logonuz için `markShapes` içindeki şekilleri değiştirin (viewBox 32×32). Renkler parametredir.
 */

/** İşaretin iç şekilleri (renk `fg` ile doldurulur). */
const markShapes = (fg: string) =>
  [
    `<path d="M16 5.5 21.2 11.6H10.8Z" fill="${fg}"/>`,
    `<path d="M16 9.6 23.6 17.4H8.4Z" fill="${fg}"/>`,
    `<path d="M16 13.8 26 22.6H6Z" fill="${fg}"/>`,
    `<rect x="14.7" y="22.4" width="2.6" height="4.4" rx="0.6" fill="${fg}"/>`,
  ].join('')

/** Logo işaretinin SVG metni. `bg` ve `fg` CSS rengi ya da değişkeni olabilir. */
export function logoMarkSvg(options: { bg: string; fg: string; size?: number; title?: string }): string {
  const size = options.size ?? 32
  const title = options.title ? `<title>${options.title}</title>` : ''
  const a11y = options.title ? 'role="img"' : 'aria-hidden="true" focusable="false"'
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}" ${a11y}>${title}` +
    `<rect width="32" height="32" rx="9" fill="${options.bg}"/>${markShapes(options.fg)}</svg>`
  )
}
