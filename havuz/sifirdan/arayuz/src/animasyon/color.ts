// Renk ara değerlemesi algısal uzayda (OKLab): sRGB'de doğrudan karıştırmak ortada bulanık/koyu bir geçiş
// verir (ör. maviden sarıya giderken griye düşer). Yol: sRGB (0..255) → doğrusal ışık (gama açılır) → LMS
// koni tepkileri → küp kök → OKLab (L açıklık, a yeşil–kırmızı, b mavi–sarı). Karıştırma OKLab'da yapılır,
// sonra aynı yoldan geri dönülür. Matrisler Björn Ottosson'un OKLab tanımındandır.
// Ayrıştırma: #rgb, #rrggbb, #rrggbbaa, rgb()/rgba() (virgüllü ya da boşluklu).
// Genişletme: ton (hue) üzerinden kısa yay boyunca geçiş için OKLCH dönüşümü (`toOklch`) eklenebilir.

export interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

export interface Oklab {
  L: number
  a: number
  b: number
}

export function parseColor(input: string): Rgba {
  const text = input.trim()
  const hex = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.exec(text)
  if (hex) {
    let digits = hex[1] as string
    if (digits.length <= 4) digits = [...digits].map((d) => d + d).join('')
    const n = (i: number) => parseInt(digits.slice(i, i + 2), 16)
    return { r: n(0), g: n(2), b: n(4), a: digits.length === 8 ? n(6) / 255 : 1 }
  }
  const fn = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i.exec(text)
  if (fn) {
    const alpha = fn[4] === undefined ? 1 : fn[4].endsWith('%') ? parseFloat(fn[4]) / 100 : parseFloat(fn[4])
    return { r: Number(fn[1]), g: Number(fn[2]), b: Number(fn[3]), a: alpha }
  }
  throw new Error(`Renk çözümlenemedi: "${input}". #rrggbb ya da rgb(r, g, b) biçiminde yazın.`)
}

export function formatColor(color: Rgba): string {
  const c = (v: number) => Math.round(Math.max(0, Math.min(255, v)))
  return color.a >= 1
    ? `rgb(${c(color.r)}, ${c(color.g)}, ${c(color.b)})`
    : `rgba(${c(color.r)}, ${c(color.g)}, ${c(color.b)}, ${Math.round(color.a * 1000) / 1000})`
}

const toLinear = (v: number) => {
  const c = v / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
const fromLinear = (c: number) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.max(0, c) ** (1 / 2.4) - 0.055)

export function rgbToOklab(color: Rgba): Oklab {
  const r = toLinear(color.r)
  const g = toLinear(color.g)
  const b = toLinear(color.b)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  }
}

export function oklabToRgb(lab: Oklab, alpha = 1): Rgba {
  const l = (lab.L + 0.3963377774 * lab.a + 0.2158037573 * lab.b) ** 3
  const m = (lab.L - 0.1055613458 * lab.a - 0.0638541728 * lab.b) ** 3
  const s = (lab.L - 0.0894841775 * lab.a - 1.291485548 * lab.b) ** 3
  return {
    r: fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    a: alpha,
  }
}

/** İki renk arasında OKLab ara değerleme: t = 0 → from, t = 1 → to. */
export function mixColors(from: string, to: string): (t: number) => string {
  const a = parseColor(from)
  const b = parseColor(to)
  const la = rgbToOklab(a)
  const lb = rgbToOklab(b)
  return (t) =>
    formatColor(
      oklabToRgb(
        { L: la.L + (lb.L - la.L) * t, a: la.a + (lb.a - la.a) * t, b: la.b + (lb.b - la.b) * t },
        a.a + (b.a - a.a) * t,
      ),
    )
}

/** Karşılaştırma için: sRGB kanallarında düz karıştırma (gösterimde "neden OKLab?" sorusunu yanıtlar). */
export function mixSrgb(from: string, to: string): (t: number) => string {
  const a = parseColor(from)
  const b = parseColor(to)
  return (t) =>
    formatColor({
      r: a.r + (b.r - a.r) * t,
      g: a.g + (b.g - a.g) * t,
      b: a.b + (b.b - a.b) * t,
      a: a.a + (b.a - a.a) * t,
    })
}
