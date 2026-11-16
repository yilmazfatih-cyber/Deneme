// Yumuşatma eğrileri: zamanın (0..1) ilerlemeye (0..1) dönüşümü. "in" yavaş başlar, "out" yavaş biter,
// "inOut" ikisini birden yapar. CSS'teki cubic-bezier(x1, y1, x2, y2) de burada: Bezier eğrisi x'e göre
// tersine çözülür (önce Newton-Raphson, yakınsamazsa ikiye bölme), sonra y okunur — tarayıcıların yöntemi.
// Genişletme: yeni eğri = `(t: number) => number` işlevi; 0'da 0 ve 1'de 1 vermeli (kural testi denetler).

export type Easing = (t: number) => number

export const linear: Easing = (t) => t

/** "in" eğrisinden out ve inOut türetir. */
function family(easeIn: Easing): { in: Easing; out: Easing; inOut: Easing } {
  return {
    in: easeIn,
    out: (t) => 1 - easeIn(1 - t),
    inOut: (t) => (t < 0.5 ? easeIn(t * 2) / 2 : 1 - easeIn((1 - t) * 2) / 2),
  }
}

export const quad = family((t) => t * t)
export const cubic = family((t) => t * t * t)
export const quart = family((t) => t ** 4)
export const sine = family((t) => 1 - Math.cos((t * Math.PI) / 2))
export const expo = family((t) => (t === 0 ? 0 : 2 ** (10 * t - 10)))
export const circ = family((t) => 1 - Math.sqrt(1 - t * t))
/** Geri: başta hafifçe ters yöne gider (aşma payı 1,70158 klasik değerdir). */
export const back = family((t) => t * t * (2.70158 * t - 1.70158))
export const elastic = family((t) =>
  t === 0 || t === 1 ? t : -(2 ** (10 * t - 10)) * Math.sin((t * 10 - 10.75) * ((2 * Math.PI) / 3)),
)

/** Zıplama: dört parabol yayı, her biri öncekinden alçak. */
function bounceOut(t: number): number {
  const n = 7.5625
  const d = 2.75
  if (t < 1 / d) return n * t * t
  const [offset, base] = t < 2 / d ? [1.5, 0.75] : t < 2.5 / d ? [2.25, 0.9375] : [2.625, 0.984375]
  const u = t - offset / d
  return n * u * u + base
}
export const bounce = family((t) => 1 - bounceOut(1 - t))

/** CSS cubic-bezier. x1 ve x2 [0, 1] aralığında olmalıdır (aksi hâlde eğri x'e göre tek değerli olmaz). */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): Easing {
  if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) throw new RangeError('cubic-bezier: x1 ve x2 0 ile 1 arasında olmalı.')
  const cx = 3 * x1
  const bx = 3 * (x2 - x1) - cx
  const ax = 1 - cx - bx
  const cy = 3 * y1
  const by = 3 * (y2 - y1) - cy
  const ay = 1 - cy - by
  const sampleX = (s: number) => ((ax * s + bx) * s + cx) * s
  const sampleY = (s: number) => ((ay * s + by) * s + cy) * s
  const slopeX = (s: number) => (3 * ax * s + 2 * bx) * s + cx
  const solve = (x: number) => {
    let s = x
    for (let i = 0; i < 8; i++) {
      const error = sampleX(s) - x
      if (Math.abs(error) < 1e-7) return s
      const slope = slopeX(s)
      if (Math.abs(slope) < 1e-6) break
      s -= error / slope
    }
    let lo = 0
    let hi = 1
    s = x
    while (hi - lo > 1e-7) {
      if (sampleX(s) < x) lo = s
      else hi = s
      s = (lo + hi) / 2
    }
    return s
  }
  return (t) => (t <= 0 ? 0 : t >= 1 ? 1 : sampleY(solve(t)))
}

export const ease = cubicBezier(0.25, 0.1, 0.25, 1)
export const easeIn = cubicBezier(0.42, 0, 1, 1)
export const easeOut = cubicBezier(0, 0, 0.58, 1)
export const easeInOut = cubicBezier(0.42, 0, 0.58, 1)

/** Basamaklı (CSS steps(n, end)): n eşit sıçrama. */
export function steps(count: number, position: 'start' | 'end' = 'end'): Easing {
  return (t) => {
    if (t >= 1) return 1
    const step = Math.floor(t * count) + (position === 'start' ? 1 : 0)
    return Math.min(1, Math.max(0, step / count))
  }
}

/** Ad → eğri (gösterim seçici listesi ve dizgiyle yapılandırma için). */
export const EASINGS: Record<string, Easing> = {
  linear,
  ease,
  easeIn,
  easeOut,
  easeInOut,
  quadOut: quad.out,
  cubicInOut: cubic.inOut,
  expoOut: expo.out,
  backOut: back.out,
  elasticOut: elastic.out,
  bounceOut: bounce.out,
}
