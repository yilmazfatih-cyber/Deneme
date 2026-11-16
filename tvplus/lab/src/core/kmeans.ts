/**
 * k-ortalama (k-means++ başlangıcı, Lloyd yinelemesi) ve örneklemli siluet. Girdi satır öncelikli n × p, önceden
 * standartlaştırılmış olmalıdır. Aynı tohum → aynı sonuç.
 */
import { mulberry32, sampleIndices } from './rng'

export interface KMeansResult {
  k: number
  centers: Float64Array
  assign: Int32Array
  sizes: Int32Array
  inertia: number
  iterations: number
}

function dist2(X: ArrayLike<number>, i: number, C: Float64Array, c: number, p: number): number {
  let s = 0
  const xo = i * p
  const co = c * p
  for (let j = 0; j < p; j++) {
    const d = X[xo + j] - C[co + j]
    s += d * d
  }
  return s
}

export function kmeans(X: ArrayLike<number>, n: number, p: number, k: number, seed = 1, maxIter = 60): KMeansResult {
  const rng = mulberry32(seed)
  k = Math.max(1, Math.min(k, n))
  const centers = new Float64Array(k * p)
  // k-means++
  const first = Math.floor(rng() * n)
  for (let j = 0; j < p; j++) centers[j] = X[first * p + j]
  const d2 = new Float64Array(n)
  for (let i = 0; i < n; i++) d2[i] = dist2(X, i, centers, 0, p)
  for (let c = 1; c < k; c++) {
    let total = 0
    for (let i = 0; i < n; i++) total += d2[i]
    let r = rng() * total
    let pick = n - 1
    for (let i = 0; i < n; i++) {
      r -= d2[i]
      if (r < 0) {
        pick = i
        break
      }
    }
    for (let j = 0; j < p; j++) centers[c * p + j] = X[pick * p + j]
    for (let i = 0; i < n; i++) {
      const d = dist2(X, i, centers, c, p)
      if (d < d2[i]) d2[i] = d
    }
  }
  const assign = new Int32Array(n).fill(-1)
  const sizes = new Int32Array(k)
  const sums = new Float64Array(k * p)
  let iterations = 0
  let inertia = 0
  for (; iterations < maxIter; iterations++) {
    let changed = 0
    inertia = 0
    for (let i = 0; i < n; i++) {
      let best = 0
      let bd = Infinity
      for (let c = 0; c < k; c++) {
        const d = dist2(X, i, centers, c, p)
        if (d < bd) {
          bd = d
          best = c
        }
      }
      inertia += bd
      if (assign[i] !== best) {
        assign[i] = best
        changed++
      }
    }
    sums.fill(0)
    sizes.fill(0)
    for (let i = 0; i < n; i++) {
      const c = assign[i]
      sizes[c]++
      for (let j = 0; j < p; j++) sums[c * p + j] += X[i * p + j]
    }
    for (let c = 0; c < k; c++) {
      if (sizes[c] === 0) {
        // Boş küme: rastgele bir satıra taşı
        const pick = Math.floor(rng() * n)
        for (let j = 0; j < p; j++) centers[c * p + j] = X[pick * p + j]
      } else for (let j = 0; j < p; j++) centers[c * p + j] = sums[c * p + j] / sizes[c]
    }
    if (changed === 0) {
      iterations++
      break
    }
  }
  return { k, centers, assign, sizes, inertia, iterations }
}

/** Örneklemli ortalama siluet (−1…1); küme sayısı 1 ise ya da hesaplanamazsa NaN. */
export function silhouette(
  X: ArrayLike<number>,
  n: number,
  p: number,
  assign: Int32Array,
  k: number,
  sample = 600,
  seed = 3,
): number {
  if (k < 2 || n < 3) return NaN
  const idx = sampleIndices(mulberry32(seed), n, Math.min(n, sample))
  let total = 0
  let count = 0
  const sum = new Float64Array(k)
  const cnt = new Int32Array(k)
  for (let a = 0; a < idx.length; a++) {
    const i = idx[a]
    sum.fill(0)
    cnt.fill(0)
    for (let b = 0; b < idx.length; b++) {
      if (a === b) continue
      const j = idx[b]
      let s = 0
      for (let q = 0; q < p; q++) {
        const d = X[i * p + q] - X[j * p + q]
        s += d * d
      }
      sum[assign[j]] += Math.sqrt(s)
      cnt[assign[j]]++
    }
    const own = assign[i]
    if (cnt[own] === 0) continue
    const ai = sum[own] / cnt[own]
    let bi = Infinity
    for (let c = 0; c < k; c++) if (c !== own && cnt[c] > 0) bi = Math.min(bi, sum[c] / cnt[c])
    if (!Number.isFinite(bi)) continue
    total += (bi - ai) / Math.max(ai, bi)
    count++
  }
  return count ? total / count : NaN
}
