/**
 * Görsellere yazı: SVG <text> öğeleri üretir. Satır genişlikleri tahminle değil, aynı çizicinin (librsvg + fontconfig)
 * gerçek çıktısı ölçülerek bulunur; böylece hangi yazı tipi kurulu olursa olsun metin kutuya sığar, kesilmez.
 */
import sharp from 'sharp'

/** Manrope (ürün yazı tipi) yoksa Inter, o da yoksa DejaVu/Liberation devreye girer. */
export const FONT_STACK = "Manrope, Inter, 'DejaVu Sans', 'Liberation Sans', Arial, sans-serif"

const XML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }
export function escapeXml(s: string): string {
  // XML 1.0'da geçersiz denetim karakterleri de atılır (librsvg bunları görünce tüm SVG'yi reddeder).
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/[&<>"']/g, (c) => XML_ESCAPES[c] ?? c)
}

/** Türkçe büyük harf (i → İ). */
export const upperTr = (s: string) => s.toLocaleUpperCase('tr-TR')

export interface TextStyle {
  weight: number
  /** em cinsinden harf aralığı, ör. -0.02 */
  letterSpacing: number
}

const REF_SIZE = 100
const measureCache = new Map<string, number>()
const MEASURE_CACHE_MAX = 4000

/** Bir satırın REF_SIZE (100 px) boyutundaki mürekkep genişliği. */
async function measureAtRef(text: string, style: TextStyle): Promise<number> {
  const trimmed = text.trim()
  if (!trimmed) return 0
  const key = `${style.weight}|${style.letterSpacing}|${trimmed}`
  const hit = measureCache.get(key)
  if (hit !== undefined) return hit
  const width = Math.ceil(trimmed.length * REF_SIZE * 1.2 + 200)
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${REF_SIZE * 1.8}">` +
    `<text x="40" y="${REF_SIZE * 1.25}" font-family="${FONT_STACK}" font-weight="${style.weight}" font-size="${REF_SIZE}" ` +
    `letter-spacing="${style.letterSpacing * REF_SIZE}" fill="#fff">${escapeXml(trimmed)}</text></svg>`
  let measured: number
  try {
    const { info } = await sharp(Buffer.from(svg)).trim().toBuffer({ resolveWithObject: true })
    measured = info.width
  } catch {
    // Ölçülemezse (ör. çizilebilir glif yok) cömert bir tahmin: karakter başına 0.62 em.
    measured = trimmed.length * REF_SIZE * 0.62
  }
  if (measureCache.size >= MEASURE_CACHE_MAX) measureCache.clear()
  measureCache.set(key, measured)
  return measured
}

export interface FitOptions {
  style: TextStyle
  maxWidth: number
  maxHeight: number
  maxLines: number
  maxSize: number
  /** Bu boyutun altına yalnızca tek bir sözcük bile sığmıyorsa inilir (kesmek yerine küçültmek). */
  minSize: number
  /** Satır yüksekliği / yazı boyutu */
  lineHeight: number
}
export interface FittedText {
  lines: string[]
  size: number
  lineGap: number
  /** Yazı bloğunun yüksekliği (ilk satırın üst aksanından son satırın alt uzantısına) */
  blockHeight: number
  /** Her satırın gerçek genişliği (px) */
  widths: number[]
}

/** Aksanlı büyük harf (İ, Ü, Ğ) için üst pay ve alt uzantı payı, em cinsinden. */
const ASCENT = 0.96
const DESCENT = 0.26
const blockHeightFor = (lines: number, size: number, lineHeight: number) =>
  (lines - 1) * size * lineHeight + size * (ASCENT + DESCENT)

/**
 * Sözcükleri en çok `maxLines` satıra, satırların en uzununu en kısa tutacak biçimde böler (dengeli kırma).
 * `widthOf(i, j)` i..j-1 sözcüklerinden oluşan satırın genişliğidir.
 */
function balancedBreak(n: number, lines: number, widthOf: (i: number, j: number) => number): number[][] | null {
  if (lines <= 1 || n <= 1) return [[0, n]]
  // memo[k][i]: i'den başlayan sözcükleri k satıra bölerken en uzun satırın en küçük değeri
  const memo = new Map<string, { cost: number; cut: number }>()
  const solve = (i: number, k: number): number => {
    if (k === 1) return widthOf(i, n)
    const key = `${i}|${k}`
    const m = memo.get(key)
    if (m) return m.cost
    let best = Infinity
    let bestCut = n
    for (let j = i + 1; j <= n - (k - 1); j++) {
      const cost = Math.max(widthOf(i, j), solve(j, k - 1))
      if (cost < best) {
        best = cost
        bestCut = j
      }
    }
    memo.set(key, { cost: best, cut: bestCut })
    return best
  }
  solve(0, lines)
  const out: number[][] = []
  let i = 0
  for (let k = lines; k > 1; k--) {
    const cut = memo.get(`${i}|${k}`)?.cut ?? n
    out.push([i, cut])
    i = cut
  }
  out.push([i, n])
  return out.every(([a, b]) => (a ?? 0) < (b ?? 0)) ? out : null
}

/**
 * Metni kutuya sığdırır: en büyük boyuttan başlayıp küçülterek satır sayısı, genişlik ve yükseklik sınırına uyan
 * ilk boyutu bulur. Asla kesmez: en küçük boyutta bile sığmazsa son satırın sonu "…" ile kısaltılır.
 */
export async function fitText(text: string, o: FitOptions): Promise<FittedText> {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  if (words.length === 0)
    return { lines: [], size: o.maxSize, lineGap: o.maxSize * o.lineHeight, blockHeight: 0, widths: [] }

  const wordW = await Promise.all(words.map((w) => measureAtRef(w, o.style)))
  // Boşluk genişliği: "H H" ile "HH" farkı
  const [hh, hsh] = await Promise.all([measureAtRef('HH', o.style), measureAtRef('H H', o.style)])
  const spaceW = Math.max(REF_SIZE * 0.2, hsh - hh)
  const SAFETY = 1.04
  const widthOf = (i: number, j: number) => {
    let w = 0
    for (let k = i; k < j; k++) w += wordW[k] ?? 0
    return (w + spaceW * (j - i - 1)) * SAFETY
  }
  const longestWord = Math.max(...wordW) * SAFETY

  const tryLayout = (size: number): number[][] | null => {
    const scale = size / REF_SIZE
    const limit = o.maxWidth / scale
    if (longestWord > limit) return null
    for (let lines = 1; lines <= Math.min(o.maxLines, words.length); lines++) {
      if (blockHeightFor(lines, size, o.lineHeight) > o.maxHeight) return null
      const br = balancedBreak(words.length, lines, widthOf)
      if (br && br.every(([a, b]) => widthOf(a ?? 0, b ?? 0) <= limit)) return br
    }
    return null
  }

  let size = o.maxSize
  let layout: number[][] | null = null
  while (size >= o.minSize) {
    layout = tryLayout(size)
    if (layout) break
    size *= 0.94
  }
  let lines: string[]
  if (layout) {
    lines = layout.map(([a, b]) => words.slice(a, b).join(' '))
  } else {
    // En küçük boyutta da sığmadı: önce tek sözcüğün sığacağı kadar küçült, sonra fazla satırı "…" ile kısalt.
    size = Math.max(6, Math.min(o.minSize, (o.maxWidth / longestWord) * REF_SIZE))
    const fitLines = Math.max(
      1,
      Math.min(o.maxLines, Math.floor((o.maxHeight - size * (ASCENT + DESCENT)) / (size * o.lineHeight)) + 1),
    )
    const limit = o.maxWidth / (size / REF_SIZE)
    lines = []
    let i = 0
    while (i < words.length && lines.length < fitLines) {
      let j = i + 1
      while (j < words.length && widthOf(i, j + 1) <= limit) j++
      lines.push(words.slice(i, j).join(' '))
      i = j
    }
    if (i < words.length) {
      let last = `${lines.pop() ?? ''} ${words.slice(i).join(' ')}`.trim()
      while (last.length > 1 && (await measureAtRef(`${last}…`, o.style)) * SAFETY > limit)
        last = last.slice(0, -1).trimEnd()
      lines.push(`${last}…`)
    }
  }

  // Son doğrulama: satırları bütün olarak ölç; ölçü (karakter aralığı vb.) taşarsa orantılı küçült.
  const scale = size / REF_SIZE
  let widths = (await Promise.all(lines.map((l) => measureAtRef(l, o.style)))).map((w) => w * scale)
  const widest = Math.max(...widths)
  if (widest > o.maxWidth) {
    const shrink = o.maxWidth / widest
    size *= shrink
    widths = widths.map((w) => w * shrink)
  }
  return {
    lines,
    size,
    lineGap: size * o.lineHeight,
    blockHeight: blockHeightFor(lines.length, size, o.lineHeight),
    widths,
  }
}

export interface TextBlockPlacement {
  /** Yatay hizalama ve çapa x'i */
  align: 'start' | 'middle'
  x: number
  /** Bloğun üst kenarı */
  top: number
  fill: string
  opacity?: number
  filter?: string
}

/** Sığdırılmış metni SVG <text> öğelerine çevirir (her satır ayrı öğe; tspan/dy farklılıklarından kaçınılır). */
export function textBlockSvg(t: FittedText, style: TextStyle, p: TextBlockPlacement): string {
  return t.lines
    .map((line, i) => {
      const y = p.top + t.size * ASCENT + i * t.lineGap
      return (
        `<text x="${p.x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${p.align}" font-family="${FONT_STACK}" ` +
        `font-weight="${style.weight}" font-size="${t.size.toFixed(2)}" letter-spacing="${(style.letterSpacing * t.size).toFixed(2)}" ` +
        `fill="${p.fill}"${p.opacity !== undefined ? ` fill-opacity="${p.opacity}"` : ''}${p.filter ? ` filter="${p.filter}"` : ''}>` +
        `${escapeXml(line)}</text>`
      )
    })
    .join('')
}
