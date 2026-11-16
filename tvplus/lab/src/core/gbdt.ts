/**
 * Gradyan artırmalı karar ağaçları (ikili sınıflandırma, lojistik kayıp) — küçük, bağımlılıksız, histogram tabanlı.
 * Churn modelinde doğrusal olmayan etkileri ve etkileşimleri yakalamak için kullanılır; yorum için permütasyon önemi
 * ve kısmi bağımlılık eğrisi verir. Büyük veri için değil (yüz binlerce satır × onlarca özellik) tasarlanmıştır.
 */
import { mulberry32, sampleIndices } from './rng'
import { auc, sigmoid } from './stats'

export interface GbdtOptions {
  trees?: number
  depth?: number
  learningRate?: number
  /** Özellik başına en çok dilim (≤ 255) */
  bins?: number
  minLeaf?: number
  /** Ağaç başına satır örnekleme oranı */
  subsample?: number
  l2?: number
  seed?: number
}

interface Tree {
  /** Düğüm → özellik (yaprakta −1) */
  feature: Int32Array
  /** Düğüm → dilim eşiği: kod ≤ eşik ise sola */
  bin: Uint8Array
  left: Int32Array
  right: Int32Array
  value: Float64Array
}

export interface GbdtModel {
  base: number
  learningRate: number
  /** Özellik başına artan dilim üst sınırları (değer ≤ sınır[i] → kod i) */
  thresholds: Float64Array[]
  trees: Tree[]
}

/** Değeri dilim koduna çevirir (NaN → 0). */
function codeOf(thresholds: Float64Array, v: number): number {
  if (!(v === v)) return 0
  let lo = 0
  let hi = thresholds.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (v <= thresholds[mid]) hi = mid
    else lo = mid + 1
  }
  return lo
}

function makeThresholds(col: ArrayLike<number>, bins: number, rng: () => number): Float64Array {
  const n = col.length
  const take = Math.min(n, 40_000)
  const idx = sampleIndices(rng, n, take)
  const vals = new Float64Array(take)
  let m = 0
  for (let i = 0; i < take; i++) {
    const v = col[idx[i]]
    if (v === v) vals[m++] = v
  }
  const sorted = vals.subarray(0, m).sort()
  const out: number[] = []
  for (let b = 1; b < bins; b++) {
    const v = sorted[Math.min(m - 1, Math.floor((b * m) / bins))]
    if (m > 0 && (out.length === 0 || v > out[out.length - 1])) out.push(v)
  }
  // Son eşik en büyük değerse ayırt edici değildir; yine de zararsızdır
  return Float64Array.from(out)
}

export function gbdtFit(cols: readonly ArrayLike<number>[], y: ArrayLike<number>, opts: GbdtOptions = {}): GbdtModel {
  const n = y.length
  const p = cols.length
  const nTrees = opts.trees ?? 120
  const maxDepth = opts.depth ?? 3
  const lr = opts.learningRate ?? 0.1
  const bins = Math.min(255, opts.bins ?? 32)
  const minLeaf = opts.minLeaf ?? Math.max(20, Math.floor(n / 2000))
  const subsample = opts.subsample ?? 0.7
  const l2 = opts.l2 ?? 1
  const rng = mulberry32(opts.seed ?? 7)

  const thresholds = cols.map((c) => makeThresholds(c, bins, rng))
  const codes = cols.map((c, f) => {
    const out = new Uint8Array(n)
    const th = thresholds[f]
    for (let i = 0; i < n; i++) out[i] = codeOf(th, c[i])
    return out
  })
  let pos = 0
  for (let i = 0; i < n; i++) if (y[i]) pos++
  const p0 = Math.min(1 - 1e-6, Math.max(1e-6, pos / Math.max(1, n)))
  const base = Math.log(p0 / (1 - p0))
  const F = new Float64Array(n).fill(base)
  const g = new Float64Array(n)
  const h = new Float64Array(n)
  const trees: Tree[] = []
  const maxNodes = (1 << (maxDepth + 1)) - 1
  const hg = new Float64Array(256)
  const hh = new Float64Array(256)
  const hc = new Int32Array(256)

  for (let t = 0; t < nTrees; t++) {
    for (let i = 0; i < n; i++) {
      const pr = sigmoid(F[i])
      g[i] = pr - (y[i] ? 1 : 0)
      h[i] = Math.max(1e-6, pr * (1 - pr))
    }
    const rows =
      subsample < 1 ? sampleIndices(rng, n, Math.max(1, Math.floor(n * subsample))) : sampleIndices(rng, n, n)
    const tree: Tree = {
      feature: new Int32Array(maxNodes).fill(-1),
      bin: new Uint8Array(maxNodes),
      left: new Int32Array(maxNodes).fill(-1),
      right: new Int32Array(maxNodes).fill(-1),
      value: new Float64Array(maxNodes),
    }
    let nodes = 1
    const stack: { node: number; rows: Int32Array; depth: number }[] = [{ node: 0, rows, depth: 0 }]
    while (stack.length) {
      const cur = stack.pop()!
      const r = cur.rows
      let G = 0
      let H = 0
      for (let i = 0; i < r.length; i++) {
        G += g[r[i]]
        H += h[r[i]]
      }
      tree.value[cur.node] = -G / (H + l2)
      if (cur.depth >= maxDepth || r.length < 2 * minLeaf) continue
      const parent = (G * G) / (H + l2)
      let bestGain = 1e-9
      let bestF = -1
      let bestBin = 0
      for (let f = 0; f < p; f++) {
        const nb = thresholds[f].length + 1
        if (nb < 2) continue
        const cf = codes[f]
        for (let b = 0; b < nb; b++) {
          hg[b] = 0
          hh[b] = 0
          hc[b] = 0
        }
        for (let i = 0; i < r.length; i++) {
          const row = r[i]
          const c = cf[row]
          hg[c] += g[row]
          hh[c] += h[row]
          hc[c]++
        }
        let gl = 0
        let hl = 0
        let cl = 0
        for (let b = 0; b < nb - 1; b++) {
          gl += hg[b]
          hl += hh[b]
          cl += hc[b]
          if (cl < minLeaf) continue
          if (r.length - cl < minLeaf) break
          const gr = G - gl
          const hr = H - hl
          const gain = (gl * gl) / (hl + l2) + (gr * gr) / (hr + l2) - parent
          if (gain > bestGain) {
            bestGain = gain
            bestF = f
            bestBin = b
          }
        }
      }
      if (bestF < 0) continue
      const cf = codes[bestF]
      let nl = 0
      for (let i = 0; i < r.length; i++) if (cf[r[i]] <= bestBin) nl++
      const L = new Int32Array(nl)
      const R = new Int32Array(r.length - nl)
      let a = 0
      let b = 0
      for (let i = 0; i < r.length; i++) {
        if (cf[r[i]] <= bestBin) L[a++] = r[i]
        else R[b++] = r[i]
      }
      tree.feature[cur.node] = bestF
      tree.bin[cur.node] = bestBin
      tree.left[cur.node] = nodes
      tree.right[cur.node] = nodes + 1
      stack.push({ node: nodes, rows: L, depth: cur.depth + 1 }, { node: nodes + 1, rows: R, depth: cur.depth + 1 })
      nodes += 2
    }
    // Tüm satırların puanını güncelle
    for (let i = 0; i < n; i++) {
      let node = 0
      for (;;) {
        const f = tree.feature[node]
        if (f < 0) break
        node = codes[f][i] <= tree.bin[node] ? tree.left[node] : tree.right[node]
      }
      F[i] += lr * tree.value[node]
    }
    trees.push(tree)
  }
  return { base, learningRate: lr, thresholds, trees }
}

/** Olasılık tahminleri. */
export function gbdtPredict(model: GbdtModel, cols: readonly ArrayLike<number>[]): Float64Array {
  const n = cols.length ? cols[0].length : 0
  const p = cols.length
  const codes = new Array<Uint8Array>(p)
  for (let f = 0; f < p; f++) {
    const out = new Uint8Array(n)
    const th = model.thresholds[f]
    const c = cols[f]
    for (let i = 0; i < n; i++) out[i] = codeOf(th, c[i])
    codes[f] = out
  }
  const out = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    let s = model.base
    for (const tree of model.trees) {
      let node = 0
      for (;;) {
        const f = tree.feature[node]
        if (f < 0) break
        node = codes[f][i] <= tree.bin[node] ? tree.left[node] : tree.right[node]
      }
      s += model.learningRate * tree.value[node]
    }
    out[i] = sigmoid(s)
  }
  return out
}

/**
 * Permütasyon önemi: özelliğin sütunu karıştırılınca AUC ne kadar düşüyor (sınama kümesinde).
 * Birbirine bağlı özelliklerde önem paylaşılır; yorumlarken tek değişkenli tabloyla birlikte okunmalıdır.
 */
export function permutationImportance(
  model: GbdtModel,
  cols: readonly ArrayLike<number>[],
  y: ArrayLike<number>,
  seed = 11,
): { base: number; drop: Float64Array } {
  const n = y.length
  const base = auc(gbdtPredict(model, cols), y)
  const drop = new Float64Array(cols.length)
  const rng = mulberry32(seed)
  const perm = new Int32Array(n)
  for (let f = 0; f < cols.length; f++) {
    for (let i = 0; i < n; i++) perm[i] = i
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      const t = perm[i]
      perm[i] = perm[j]
      perm[j] = t
    }
    const shuffled = new Float64Array(n)
    const c = cols[f]
    for (let i = 0; i < n; i++) shuffled[i] = c[perm[i]]
    const mod = cols.slice()
    mod[f] = shuffled
    drop[f] = base - auc(gbdtPredict(model, mod), y)
  }
  return { base, drop }
}

/** Kısmi bağımlılık: özelliği verilen değerlere sabitleyince ortalama tahmin (satır örnekleminde). */
export function partialDependence(
  model: GbdtModel,
  cols: readonly ArrayLike<number>[],
  feature: number,
  grid: readonly number[],
  sample = 2000,
  seed = 13,
): number[] {
  const n = cols.length ? cols[0].length : 0
  const idx = sampleIndices(mulberry32(seed), n, Math.min(n, sample))
  const sub = cols.map((c) => {
    const out = new Float64Array(idx.length)
    for (let i = 0; i < idx.length; i++) out[i] = c[idx[i]]
    return out
  })
  return grid.map((v) => {
    const mod = sub.slice()
    mod[feature] = new Float64Array(idx.length).fill(v)
    const pr = gbdtPredict(model, mod)
    let s = 0
    for (let i = 0; i < pr.length; i++) s += pr[i]
    return pr.length ? s / pr.length : NaN
  })
}
