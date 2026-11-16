/**
 * Renk matematiği (saf): hex ↔ OKLCH dönüşümü ve WCAG karşıtlık oranı.
 * Kim kullanır: src/lib/theme.ts (marka tonlarını türetir), tests/unit/theme.test.ts (okunabilirlik denetimi).
 * Kaynak: OKLab dönüşüm katsayıları Björn Ottosson'un "A perceptual color space for image processing" yazısındandır;
 * karşıtlık formülü WCAG 2.x'tir. Sayısal doğruluk tests/unit/color.test.ts içinde bilinen değerlerle sınanır.
 * Genişletme: yeni bir renk işlemi gerekiyorsa buraya saf bir işlev ekleyin; CSS üretimi brand.ts'in işidir.
 */

export interface Rgb {
  /** 0–1 aralığında sRGB bileşenleri */
  r: number
  g: number
  b: number
}

export interface Oklch {
  /** Açıklık: 0 (siyah) – 1 (beyaz) */
  l: number
  /** Doygunluk: 0 (gri) – ~0.37 */
  c: number
  /** Ton açısı: 0–360 derece */
  h: number
}

export function parseHex(hex: string): Rgb {
  const match = /^#([0-9a-f]{6})$/iu.exec(hex.trim())
  if (!match?.[1]) throw new Error(`Renk "#rrggbb" biçiminde olmalı: "${hex}"`)
  const value = Number.parseInt(match[1], 16)
  return { r: ((value >> 16) & 255) / 255, g: ((value >> 8) & 255) / 255, b: (value & 255) / 255 }
}

export function toHex(rgb: Rgb): string {
  const channel = (value: number) =>
    Math.round(Math.min(1, Math.max(0, value)) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${channel(rgb.r)}${channel(rgb.g)}${channel(rgb.b)}`
}

const toLinear = (value: number) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
const fromLinear = (value: number) => (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055)

export function rgbToOklch(rgb: Rgb): Oklch {
  const r = toLinear(rgb.r)
  const g = toLinear(rgb.g)
  const b = toLinear(rgb.b)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const chroma = Math.hypot(a, bb)
  const hue = chroma < 1e-7 ? 0 : ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360
  return { l: lightness, c: chroma, h: hue }
}

/** OKLCH → doğrusal sRGB (0–1 dışına taşabilir; taşma `oklchToRgb` içinde giderilir). */
function oklchToLinear(color: Oklch): Rgb {
  const angle = (color.h * Math.PI) / 180
  const a = color.c * Math.cos(angle)
  const b = color.c * Math.sin(angle)
  const l = (color.l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (color.l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (color.l - 0.0894841775 * a - 1.291485548 * b) ** 3
  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  }
}

const inGamut = (rgb: Rgb) => [rgb.r, rgb.g, rgb.b].every((value) => value >= -0.0005 && value <= 1.0005)

/**
 * OKLCH → sRGB. Renk ekranın gösterebileceği aralığın dışındaysa açıklık ve ton korunur,
 * doygunluk sığana kadar azaltılır (ikili arama).
 */
export function oklchToRgb(color: Oklch): Rgb {
  const lightness = Math.min(1, Math.max(0, color.l))
  let linear = oklchToLinear({ ...color, l: lightness })
  if (!inGamut(linear)) {
    let low = 0
    let high = color.c
    for (let step = 0; step < 24; step++) {
      const middle = (low + high) / 2
      if (inGamut(oklchToLinear({ l: lightness, c: middle, h: color.h }))) low = middle
      else high = middle
    }
    linear = oklchToLinear({ l: lightness, c: low, h: color.h })
  }
  const clamp = (value: number) => Math.min(1, Math.max(0, value))
  return { r: fromLinear(clamp(linear.r)), g: fromLinear(clamp(linear.g)), b: fromLinear(clamp(linear.b)) }
}

export const hexToOklch = (hex: string): Oklch => rgbToOklch(parseHex(hex))
export const oklchToHex = (color: Oklch): string => toHex(oklchToRgb(color))

/** WCAG bağıl parlaklık (0–1). */
export function luminance(hex: string): number {
  const { r, g, b } = parseHex(hex)
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

/** WCAG karşıtlık oranı: 1 (aynı renk) – 21 (siyah/beyaz). Normal metin için en az 4.5 gerekir. */
export function contrast(first: string, second: string): number {
  const a = luminance(first)
  const b = luminance(second)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/**
 * `color`'ın açıklığını `direction` yönünde ("darker" / "lighter") küçük adımlarla değiştirerek
 * `against` listesindeki her zeminle karşıtlığı en az `minimum` olan ilk tonu verir.
 */
export function ensureContrast(
  color: string,
  against: readonly string[],
  minimum: number,
  direction: 'darker' | 'lighter',
): string {
  const base = hexToOklch(color)
  const step = direction === 'darker' ? -0.01 : 0.01
  let lightness = base.l
  for (let i = 0; i <= 100; i++) {
    const candidate = oklchToHex({ ...base, l: lightness })
    if (against.every((background) => contrast(candidate, background) >= minimum)) return candidate
    lightness += step
    if (lightness < 0 || lightness > 1) break
  }
  return direction === 'darker' ? '#000000' : '#ffffff'
}
