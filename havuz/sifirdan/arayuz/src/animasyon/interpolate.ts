// Ara değerleme: başlangıç ve bitiş değerinden, t (0..1) alıp ara değeri veren işlev üretir.
// - sayı: düz doğrusal
// - renk dizgisi (#… / rgb(…)): OKLab'da (color.ts)
// - sayı içeren dizgi ("10px 20px", "rotate(0deg)"): kalıp aynı kalır, içindeki sayılar ara değerlenir
// - dönüşüm nesnesi { x, y, scale, rotate }: CSS transform dizgisine çevrilebilir (`toTransform`)
// - dizi/nesne: öğe öğe
// Genişletme: yeni tür (ör. yol/path biçimi) = `interpolate`'e bir dal + kendi ara değerleyicisi.
import { mixColors, parseColor } from './color.ts'

export type Interpolator<T> = (t: number) => T

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

const NUMBER = /[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi

function isColor(value: string): boolean {
  try {
    parseColor(value)
    return true
  } catch {
    return false
  }
}

/** "10px 20px" → "30px 40px": aynı kalıptaki sayılar ara değerlenir; kalıplar uyuşmazsa t ≥ 0,5'te bitişe atlar. */
export function interpolateString(from: string, to: string): Interpolator<string> {
  const a = from.match(NUMBER) ?? []
  const b = to.match(NUMBER) ?? []
  const shapeA = from.replace(NUMBER, '#')
  const shapeB = to.replace(NUMBER, '#')
  if (shapeA !== shapeB || a.length !== b.length) return (t) => (t < 0.5 ? from : to)
  return (t) => {
    let i = 0
    return shapeA.replace(/#/g, () => {
      const value = lerp(Number(a[i]), Number(b[i]), t)
      i++
      return String(Math.round(value * 1000) / 1000)
    })
  }
}

export interface Transform {
  x?: number
  y?: number
  scale?: number
  rotate?: number
}

export function toTransform(t: Transform): string {
  return `translate(${t.x ?? 0}px, ${t.y ?? 0}px) rotate(${t.rotate ?? 0}deg) scale(${t.scale ?? 1})`
}

export function interpolate<T>(from: T, to: T): Interpolator<T> {
  if (typeof from === 'number' && typeof to === 'number') return ((t: number) => lerp(from, to, t)) as Interpolator<T>
  if (typeof from === 'string' && typeof to === 'string') {
    if (isColor(from) && isColor(to)) return mixColors(from, to) as Interpolator<T>
    return interpolateString(from, to) as Interpolator<T>
  }
  if (Array.isArray(from) && Array.isArray(to)) {
    const parts = from.map((v, i) => interpolate(v as unknown, to[i] as unknown))
    return ((t: number) => parts.map((p) => p(t))) as Interpolator<T>
  }
  if (typeof from === 'object' && from !== null && typeof to === 'object' && to !== null) {
    const keys = Object.keys(to)
    const parts = keys.map(
      (k) =>
        [
          k,
          interpolate(
            (from as Record<string, unknown>)[k] ?? (to as Record<string, unknown>)[k],
            (to as Record<string, unknown>)[k],
          ),
        ] as const,
    )
    return ((t: number) => Object.fromEntries(parts.map(([k, p]) => [k, p(t)]))) as Interpolator<T>
  }
  return ((t: number) => (t < 1 ? from : to)) as Interpolator<T>
}
