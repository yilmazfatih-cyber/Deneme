/**
 * renk — renk dönüşümleri (hex ↔ RGB ↔ HSL ↔ OKLCH) ve erişilebilirlik: WCAG 2 bağıl parlaklık ve kontrast oranı,
 * AA/AAA denetimi, arka plana en okunaklı metin rengini seçme, bir rengi istenen kontrasta ulaşacak kadar
 * açıp koyulaştırma (ton korunarak, OKLCH'de).
 *
 * Kullanım:
 *   contrastRatio('#777777', '#ffffff')              // 4.48 → AA için yetmez (4,5 gerekir)
 *   meetsWcag('#767676', '#ffffff')                   // true (AA, normal metin)
 *   bestTextColor('#1e3a8a')                          // "#ffffff"
 *   adjustForContrast('#ff8800', '#ffffff', 4.5)      // aynı tonda, beyaz üstünde okunur koyu turuncu
 *   rgbToOklch(parseHex('#ff0000'))                   // { l: 0.628, c: 0.2577, h: 29.23 }
 *
 * Kararlar: Doğrusallaştırma eşiği sRGB standardındaki 0,04045'tir (WCAG 2 metnindeki 0,03928 ile sonuç farkı
 * ihmal edilebilir). OKLCH → RGB'de renk sRGB dışına taşarsa ton ve açıklık korunup doygunluk (C) azaltılır.
 * OKLab katsayıları Björn Ottosson'un yayımladığı matrislerdir.
 *
 * Sınırlar: Yalnız sRGB. Saydam ön plan rengi kontrast hesabında arka planla karıştırılmaz (alfa yok sayılır).
 * WCAG 3/APCA kontrastı yoktur. Yalnız TypeScript'te vardır (arayüz işi).
 *
 * Genişletme: Yeni renk uzayı "RGB'ye ve RGB'den" iki işlev olarak eklenir; gidiş-dönüş testi yazılır.
 */

export interface Rgb {
  r: number
  g: number
  b: number
  a?: number
}

export interface Hsl {
  h: number
  s: number
  l: number
  a?: number
}

export interface Oklch {
  l: number
  c: number
  h: number
  a?: number
}

export class ColorError extends Error {
  override name = 'ColorError'
}

type ColorInput = Rgb | string

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

/** "#abc", "#abcd", "#aabbcc", "#aabbccdd" (diyez isteğe bağlı) → { r, g, b, a }. */
export function parseHex(hex: string): Rgb {
  const text = hex.trim().replace(/^#/, '')
  if (!/^([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(text)) {
    throw new ColorError(`"${hex}" geçerli bir hex renk değil (#rgb, #rrggbb ya da #rrggbbaa).`)
  }
  const full = text.length <= 4 ? Array.from(text, (ch) => ch + ch).join('') : text
  const channel = (i: number): number => Number.parseInt(full.slice(i * 2, i * 2 + 2), 16)
  const rgb: Rgb = { r: channel(0), g: channel(1), b: channel(2) }
  if (full.length === 8) rgb.a = Math.round((channel(3) / 255) * 1000) / 1000
  return rgb
}

function toRgb(color: ColorInput): Rgb {
  return typeof color === 'string' ? parseHex(color) : color
}

/** { r, g, b, a? } → "#rrggbb" (a < 1 ise "#rrggbbaa"). Kanallar yuvarlanır ve 0–255'e sıkıştırılır. */
export function toHex(rgb: Rgb): string {
  const part = (value: number): string => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0')
  const alpha = rgb.a !== undefined && rgb.a < 1 ? part(rgb.a * 255) : ''
  return `#${part(rgb.r)}${part(rgb.g)}${part(rgb.b)}${alpha}`
}

/** RGB → HSL (h 0–360, s ve l 0–100). */
export function rgbToHsl(rgb: Rgb): Hsl {
  const r = rgb.r / 255
  const g = rgb.g / 255
  const b = rgb.b / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  let h = 0
  let s = 0
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1))
    if (max === r) h = 60 * (((g - b) / d) % 6)
    else if (max === g) h = 60 * ((b - r) / d + 2)
    else h = 60 * ((r - g) / d + 4)
  }
  return { h: (h + 360) % 360, s: s * 100, l: l * 100, ...(rgb.a !== undefined ? { a: rgb.a } : {}) }
}

/** HSL → RGB (kanallar 0–255, yuvarlanmamış). */
export function hslToRgb(hsl: Hsl): Rgb {
  const s = clamp(hsl.s, 0, 100) / 100
  const l = clamp(hsl.l, 0, 100) / 100
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = (((hsl.h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  const [r1, g1, b1] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x]
  const m = l - c / 2
  return { r: (r1 + m) * 255, g: (g1 + m) * 255, b: (b1 + m) * 255, ...(hsl.a !== undefined ? { a: hsl.a } : {}) }
}

function toLinear(channel: number): number {
  const c = channel / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function fromLinear(value: number): number {
  const c = value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055
  return c * 255
}

/** RGB → OKLCH (l 0–1, c ≥ 0, h 0–360). Algısal olarak düzgün: aynı l, gözde aynı açıklık. */
export function rgbToOklch(rgb: Rgb): Oklch {
  const r = toLinear(rgb.r)
  const g = toLinear(rgb.g)
  const b = toLinear(rgb.b)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const c = Math.sqrt(A * A + B * B)
  const h = c < 1e-7 ? 0 : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360
  return { l: L, c, h, ...(rgb.a !== undefined ? { a: rgb.a } : {}) }
}

function oklchToLinear(l: number, c: number, h: number): [number, number, number] {
  const A = c * Math.cos((h * Math.PI) / 180)
  const B = c * Math.sin((h * Math.PI) / 180)
  const l_ = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m_ = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s_ = (l - 0.0894841775 * A - 1.291485548 * B) ** 3
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ]
}

const inGamut = ([r, g, b]: [number, number, number]): boolean =>
  [r, g, b].every((v) => v >= -1e-6 && v <= 1 + 1e-6)

/** OKLCH → RGB. sRGB dışına taşan renkte ton ve açıklık korunur, doygunluk azaltılır (ikili arama). */
export function oklchToRgb(color: Oklch): Rgb {
  const l = clamp(color.l, 0, 1)
  let c = Math.max(0, color.c)
  if (!inGamut(oklchToLinear(l, c, color.h))) {
    let low = 0
    let high = c
    for (let i = 0; i < 40; i++) {
      const mid = (low + high) / 2
      if (inGamut(oklchToLinear(l, mid, color.h))) low = mid
      else high = mid
    }
    c = low
  }
  const [r, g, b] = oklchToLinear(l, c, color.h)
  return {
    r: clamp(fromLinear(clamp(r, 0, 1)), 0, 255),
    g: clamp(fromLinear(clamp(g, 0, 1)), 0, 255),
    b: clamp(fromLinear(clamp(b, 0, 1)), 0, 255),
    ...(color.a !== undefined ? { a: color.a } : {}),
  }
}

/** WCAG 2 bağıl parlaklık (0 siyah – 1 beyaz). */
export function relativeLuminance(color: ColorInput): number {
  const { r, g, b } = toRgb(color)
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

/** WCAG 2 kontrast oranı (1–21). Sıra önemsiz. */
export function contrastRatio(a: ColorInput, b: ColorInput): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** WCAG eşiği sağlanıyor mu? AA: 4,5 (büyük metin 3) · AAA: 7 (büyük metin 4,5). Büyük metin: ≥ 24 px ya da kalın ≥ 18,66 px. */
export function meetsWcag(
  foreground: ColorInput,
  background: ColorInput,
  options: { level?: 'AA' | 'AAA'; largeText?: boolean } = {},
): boolean {
  const level = options.level ?? 'AA'
  const large = options.largeText === true
  const required = level === 'AAA' ? (large ? 4.5 : 7) : large ? 3 : 4.5
  return contrastRatio(foreground, background) >= required
}

/** Adaylar arasından arka plana en yüksek kontrastı veren metin rengi (varsayılan siyah ya da beyaz). */
export function bestTextColor(background: ColorInput, candidates: readonly string[] = ['#000000', '#ffffff']): string {
  if (candidates.length === 0) throw new ColorError('En az bir aday renk verin.')
  return candidates.reduce((best, candidate) =>
    contrastRatio(candidate, background) > contrastRatio(best, background) ? candidate : best,
  )
}

/**
 * Ön plan rengini, tonunu koruyarak (OKLCH'de açıklığını değiştirerek) arka plana karşı `target` kontrasta getirir.
 * Zaten yeterliyse olduğu gibi döner; ulaşılamazsa siyah/beyazdan iyi olanı döner. Sonuç "#rrggbb".
 */
export function adjustForContrast(foreground: ColorInput, background: ColorInput, target = 4.5): string {
  const start = toRgb(foreground)
  if (contrastRatio(start, background) >= target) return toHex({ r: start.r, g: start.g, b: start.b })
  const base = rgbToOklch(start)
  const candidates: string[] = []
  for (const goal of [0, 1]) {
    let low = base.l
    let high = goal
    const at = (l: number): Rgb => oklchToRgb({ l, c: base.c, h: base.h })
    if (contrastRatio(at(goal), background) < target) continue
    for (let i = 0; i < 40; i++) {
      const mid = (low + high) / 2
      if (contrastRatio(at(mid), background) >= target) high = mid
      else low = mid
    }
    // 8 bite yuvarlama oranı eşiğin hemen altına düşürebilir: geçene kadar hedefe doğru biraz daha ilerle.
    let hex = toHex(at(high))
    for (let step = 0; step < 50 && contrastRatio(hex, background) < target; step++) {
      high += Math.sign(goal - high) * 0.002
      hex = toHex(at(high))
    }
    candidates.push(hex)
  }
  const passing = candidates.filter((hex) => contrastRatio(hex, background) >= target)
  if (passing.length === 0) return bestTextColor(background)
  // Özgün renge (açıklıkça) en yakın olanı seç.
  return passing.reduce((best, hex) =>
    Math.abs(rgbToOklch(parseHex(hex)).l - base.l) < Math.abs(rgbToOklch(parseHex(best)).l - base.l) ? hex : best,
  )
}
