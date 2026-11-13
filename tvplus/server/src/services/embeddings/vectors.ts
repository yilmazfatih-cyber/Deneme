/**
 * Vektör yardımcıları: birim uzunluk, kosinüs, bitişik Float32 matris üzerinde en yakın k, PCA (kuvvet yinelemesi).
 * Tüm matrisler satır düzenlidir: satır i = data[i*dims … (i+1)*dims).
 */

export type Vec = Float64Array | Float32Array

export function norm(v: ArrayLike<number>): number {
  let s = 0
  for (let i = 0; i < v.length; i++) s += v[i]! * v[i]!
  return Math.sqrt(s)
}

/** Yerinde birim uzunluğa getirir; sıfır vektör sıfır kalır. Kendisini döndürür. */
export function normalize<T extends Vec>(v: T): T {
  const n = norm(v)
  if (n > 0) for (let i = 0; i < v.length; i++) v[i] = v[i]! / n
  return v
}

/** out += w · v */
export function addScaled(out: Vec, v: ArrayLike<number>, w: number): void {
  if (w === 0) return
  for (let i = 0; i < out.length; i++) out[i] = out[i]! + w * v[i]!
}

export function dot(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!
  return s
}

/** İki vektörün kosinüs benzerliği (biri sıfırsa 0). */
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const na = norm(a)
  const nb = norm(b)
  return na > 0 && nb > 0 ? dot(a, b) / (na * nb) : 0
}

export interface Hit {
  row: number
  score: number
}

/**
 * Bitişik matriste `q` ile en yüksek iç çarpımlı `k` satır (satırlar ve q birim uzunluktaysa kosinüs).
 * Eşit puanlarda küçük `tieKey(row)` önce gelir (kararlı sıra). `skip(row)` true olan satırlar atlanır.
 * Karmaşıklık O(N·dims + N·log k): sonuç dizisi sıralı tutulur, yalnız eşiği geçen satır eklenir.
 */
export function topK(
  matrix: Float32Array,
  dims: number,
  q: ArrayLike<number>,
  k: number,
  opts: { skip?: (row: number) => boolean; tieKey?: (row: number) => number } = {},
): Hit[] {
  const rows = Math.floor(matrix.length / dims)
  const tie = opts.tieKey ?? ((r: number) => r)
  const best: Hit[] = []
  if (k <= 0) return best
  const qf = Float32Array.from(q)
  const better = (a: Hit, b: Hit) => a.score > b.score || (a.score === b.score && tie(a.row) < tie(b.row))
  for (let r = 0; r < rows; r++) {
    if (opts.skip?.(r)) continue
    const off = r * dims
    let s = 0
    for (let d = 0; d < dims; d++) s += matrix[off + d]! * qf[d]!
    const hit = { row: r, score: s }
    if (best.length === k && !better(hit, best[k - 1]!)) continue
    // ikili arama ile yerleştir
    let lo = 0
    let hi = best.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (better(hit, best[mid]!)) hi = mid
      else lo = mid + 1
    }
    best.splice(lo, 0, hit)
    if (best.length > k) best.pop()
  }
  return best
}

/** Satırların ortalaması (birim uzunluğa getirilmeden). */
export function meanRows(matrix: Float32Array, dims: number, rows: number[], weights?: number[]): Float64Array {
  const out = new Float64Array(dims)
  let total = 0
  rows.forEach((r, i) => {
    const w = weights?.[i] ?? 1
    total += w
    for (let d = 0; d < dims; d++) out[d]! += w * matrix[r * dims + d]!
  })
  if (total > 0) for (let d = 0; d < dims; d++) out[d] = out[d]! / total
  return out
}

/* ───────────── PCA (kuvvet yinelemesi) ───────────── */

export const PCA_ITERATIONS = 300
export const PCA_TOLERANCE = 1e-10

/**
 * Satır vektörlerinin ilk iki ana bileşenine izdüşümü. Ortalama çıkarılır, kovaryans (dims × dims) kurulur, en büyük
 * iki özvektör kuvvet yinelemesiyle (sabit başlangıç, sabit yineleme sınırı) ve söndürmeyle bulunur. İşaret belirsizliği
 * için her özvektörün mutlak değerce en büyük bileşeni pozitif yapılır: aynı girdi → aynı harita.
 */
export function pca2(matrix: Float32Array, dims: number): { x: Float64Array; y: Float64Array; variance: [number, number] } {
  const n = Math.floor(matrix.length / dims)
  const mean = new Float64Array(dims)
  for (let r = 0; r < n; r++) for (let d = 0; d < dims; d++) mean[d]! += matrix[r * dims + d]!
  if (n > 0) for (let d = 0; d < dims; d++) mean[d] = mean[d]! / n
  const cov = new Float64Array(dims * dims)
  const row = new Float64Array(dims)
  for (let r = 0; r < n; r++) {
    for (let d = 0; d < dims; d++) row[d] = matrix[r * dims + d]! - mean[d]!
    for (let i = 0; i < dims; i++) {
      const ri = row[i]!
      if (ri === 0) continue
      const off = i * dims
      for (let j = i; j < dims; j++) cov[off + j]! += ri * row[j]!
    }
  }
  for (let i = 0; i < dims; i++)
    for (let j = i; j < dims; j++) {
      const v = n > 1 ? cov[i * dims + j]! / (n - 1) : 0
      cov[i * dims + j] = v
      cov[j * dims + i] = v
    }
  const comps: Float64Array[] = []
  const vars: number[] = []
  for (let c = 0; c < 2; c++) {
    const v = new Float64Array(dims)
    for (let i = 0; i < dims; i++) v[i] = 1 / (i + 1 + c) // sabit, simetrik olmayan başlangıç
    normalize(v)
    let lambda = 0
    for (let it = 0; it < PCA_ITERATIONS; it++) {
      const w = new Float64Array(dims)
      for (let i = 0; i < dims; i++) {
        let s = 0
        const off = i * dims
        for (let j = 0; j < dims; j++) s += cov[off + j]! * v[j]!
        w[i] = s
      }
      const nw = norm(w)
      if (nw === 0) break
      let diff = 0
      for (let i = 0; i < dims; i++) {
        const nv = w[i]! / nw
        diff += (nv - v[i]!) * (nv - v[i]!)
        v[i] = nv
      }
      lambda = nw
      if (diff < PCA_TOLERANCE) break
    }
    let maxIdx = 0
    for (let i = 1; i < dims; i++) if (Math.abs(v[i]!) > Math.abs(v[maxIdx]!)) maxIdx = i
    if (v[maxIdx]! < 0) for (let i = 0; i < dims; i++) v[i] = -v[i]!
    comps.push(v)
    vars.push(lambda)
    // söndürme: cov -= λ v vᵀ
    for (let i = 0; i < dims; i++) for (let j = 0; j < dims; j++) cov[i * dims + j]! -= lambda * v[i]! * v[j]!
  }
  const x = new Float64Array(n)
  const y = new Float64Array(n)
  for (let r = 0; r < n; r++) {
    let sx = 0
    let sy = 0
    for (let d = 0; d < dims; d++) {
      const c = matrix[r * dims + d]! - mean[d]!
      sx += c * comps[0]![d]!
      sy += c * comps[1]![d]!
    }
    x[r] = sx
    y[r] = sy
  }
  return { x, y, variance: [vars[0] ?? 0, vars[1] ?? 0] }
}
