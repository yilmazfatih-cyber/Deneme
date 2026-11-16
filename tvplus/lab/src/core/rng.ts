/**
 * Tohumlu rastgelelik: aynı tohum → aynı sonuç (ingest örneklemesi dışında lab'daki her şey yeniden üretilebilir).
 * Akışlar etiketle türetilir (`rngFor(seed, 'oturum', kullanıcı)`): simülasyonda her karar türü kendi akışını kullanır,
 * böylece ikiz evrenlerde (aynı tohum, farklı varyant) bir kararın değişmesi diğer akışları kaydırmaz.
 */

export type Rng = () => number

/** mulberry32: küçük, hızlı, tohumlu üreteç ([0, 1)). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Dizgeden 32 bit özet (FNV-1a + karıştırma). */
export function hash32(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

/** İki 32 bit değeri karıştırır (akış türetme). */
export function mix32(a: number, b: number): number {
  let h = (a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b)) >>> 0
  h ^= h >>> 15
  h = Math.imul(h, 0x2c1b3c6d)
  h ^= h >>> 12
  h = Math.imul(h, 0x297a2d39)
  h ^= h >>> 15
  return h >>> 0
}

/** Tohum + etiketler → bağımsız akış. Sayı etiketleri doğrudan, dizgeler özetlenerek karışır. */
export function rngFor(seed: number, ...labels: (string | number)[]): Rng {
  let h = seed >>> 0
  for (const l of labels) h = mix32(h, typeof l === 'number' ? l >>> 0 : hash32(l))
  return mulberry32(h)
}

/* ───────────── Dağılımlar ───────────── */

/** Standart normal (Box–Muller; tek değer). */
export function normal(rng: Rng): number {
  const u = Math.max(1e-300, rng())
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng())
}

export const lognormal = (rng: Rng, mu: number, sigma: number): number => Math.exp(mu + sigma * normal(rng))

export const exponential = (rng: Rng, rate: number): number => -Math.log(Math.max(1e-300, 1 - rng())) / rate

/** Poisson: küçük λ'da Knuth, büyükte dönüştürülmüş reddetme (PTRS, Hörmann 1993). */
export function poisson(rng: Rng, lambda: number): number {
  if (!(lambda > 0)) return 0
  if (lambda < 30) {
    const l = Math.exp(-lambda)
    let k = 0
    let p = 1
    do {
      k++
      p *= rng()
    } while (p > l)
    return k - 1
  }
  const slam = Math.sqrt(lambda)
  const loglam = Math.log(lambda)
  const b = 0.931 + 2.53 * slam
  const a = -0.059 + 0.02483 * b
  const invalpha = 1.1239 + 1.1328 / (b - 3.4)
  const vr = 0.9277 - 3.6224 / (b - 2)
  for (;;) {
    const u = rng() - 0.5
    const v = rng()
    const us = 0.5 - Math.abs(u)
    const k = Math.floor(((2 * a) / us + b) * u + lambda + 0.43)
    if (us >= 0.07 && v <= vr) return k
    if (k < 0 || (us < 0.013 && v > us)) continue
    if (Math.log(v) + Math.log(invalpha) - Math.log(a / (us * us) + b) <= -lambda + k * loglam - lgammaInt(k + 1))
      return k
  }
}

/** ln(n!) için yeterli doğrulukta Stirling serisi (yalnız poisson içinde). */
function lgammaInt(x: number): number {
  if (x < 12) {
    let f = 1
    for (let i = 2; i < x; i++) f *= i
    return Math.log(f)
  }
  const x2 = 1 / (x * x)
  return (x - 0.5) * Math.log(x) - x + 0.9189385332046727 + (1 / 12 - x2 * (1 / 360 - x2 / 1260)) / x
}

/** Gama(şekil k, ölçek θ) — Marsaglia–Tsang. */
export function gamma(rng: Rng, shape: number, scale = 1): number {
  if (shape < 1) return gamma(rng, shape + 1, scale) * Math.pow(Math.max(1e-300, rng()), 1 / shape)
  const d = shape - 1 / 3
  const c = 1 / Math.sqrt(9 * d)
  for (;;) {
    let x: number
    let v: number
    do {
      x = normal(rng)
      v = 1 + c * x
    } while (v <= 0)
    v = v * v * v
    const u = rng()
    if (u < 1 - 0.0331 * x * x * x * x) return d * v * scale
    if (Math.log(Math.max(1e-300, u)) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v * scale
  }
}

export function beta(rng: Rng, a: number, b: number): number {
  const x = gamma(rng, a)
  const y = gamma(rng, b)
  return x / (x + y)
}

export const bernoulli = (rng: Rng, p: number): boolean => rng() < p

/** Ağırlıklı seçim: dizin döner. Toplam verilmezse hesaplanır. */
export function pickIndex(rng: Rng, weights: ArrayLike<number>, total?: number): number {
  let t = total
  if (t === undefined) {
    t = 0
    for (let i = 0; i < weights.length; i++) t += weights[i]
  }
  let r = rng() * t
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]
    if (r < 0) return i
  }
  return weights.length - 1
}

/** Birikimli ağırlıklarla (artan) ikili arama: çok kez örneklenecek dağılımlar için. */
export function cumulative(weights: ArrayLike<number>): Float64Array {
  const out = new Float64Array(weights.length)
  let s = 0
  for (let i = 0; i < weights.length; i++) {
    s += Math.max(0, weights[i])
    out[i] = s
  }
  return out
}
export function pickCumulative(rng: Rng, cum: Float64Array): number {
  const total = cum[cum.length - 1]
  const r = rng() * total
  let lo = 0
  let hi = cum.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (cum[mid] > r) hi = mid
    else lo = mid + 1
  }
  return lo
}

export function shuffle<T>(rng: Rng, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const t = arr[i]
    arr[i] = arr[j]
    arr[j] = t
  }
  return arr
}

/** 0..n−1 içinden k tekil dizin (k ≥ n ise hepsi; sıra rastgele). */
export function sampleIndices(rng: Rng, n: number, k: number): Int32Array {
  if (k >= n) {
    const all = new Int32Array(n)
    for (let i = 0; i < n; i++) all[i] = i
    return all
  }
  // Kısmi Fisher–Yates (seyrek harita ile; n büyük, k küçükken bellek dostu)
  const swapped = new Map<number, number>()
  const out = new Int32Array(k)
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rng() * (n - i))
    const vi = swapped.get(i) ?? i
    const vj = swapped.get(j) ?? j
    out[i] = vj
    swapped.set(j, vi)
  }
  return out
}

/** Zipf ağırlıkları: w_i ∝ 1 / (i + q)^s */
export function zipfWeights(n: number, s = 1, q = 0): Float64Array {
  const w = new Float64Array(n)
  for (let i = 0; i < n; i++) w[i] = 1 / Math.pow(i + 1 + q, s)
  return w
}
