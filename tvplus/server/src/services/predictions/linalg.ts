/**
 * Tahmin modelinin doğrusal cebir yardımcıları (dış kütüphane yok). Matrisler satır öncelikli düz dizilerdir:
 * n×n matrisin (i, j) öğesi a[i*n + j]. Hesaplar Float64 ile yapılır; saklama Float32 olabilir.
 */

/** Tohumlu sözde rastgele sayı üreteci (mulberry32): aynı tohum → aynı dizi, her makinede. */
export type Rng = () => number

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

/** İki tamsayıdan kararlı alt tohum (bölmeler, örneklemler ve başlangıç değerleri kendi tohumunu alır). */
export function mixSeed(seed: number, salt: number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0
  h = Math.imul(h ^ (salt + 0x7f4a7c15), 0x85ebca6b) >>> 0
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0
  return (h ^ (h >>> 16)) >>> 0
}

/** Standart normal örnek (Box–Muller; tek değer kullanılır, belirlenimcilik için basit tutuldu). */
export function gaussian(rng: Rng): number {
  const u = Math.max(rng(), 1e-12)
  const v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export function dot(a: ArrayLike<number>, ao: number, b: ArrayLike<number>, bo: number, n: number): number {
  let s = 0
  for (let k = 0; k < n; k++) s += a[ao + k]! * b[bo + k]!
  return s
}

/**
 * Yerinde Cholesky ayrıştırması: simetrik pozitif tanımlı A = L·Lᵀ; alt üçgene L yazılır.
 * Pozitif tanımlı değilse false döner (çağıran düzenlileştirmeyi artırır).
 */
export function cholesky(a: Float64Array, n: number): boolean {
  for (let j = 0; j < n; j++) {
    const jr = j * n
    let d = a[jr + j]!
    for (let k = 0; k < j; k++) d -= a[jr + k]! * a[jr + k]!
    if (!(d > 0)) return false
    const ljj = Math.sqrt(d)
    a[jr + j] = ljj
    for (let i = j + 1; i < n; i++) {
      const ir = i * n
      let s = a[ir + j]!
      for (let k = 0; k < j; k++) s -= a[ir + k]! * a[jr + k]!
      a[ir + j] = s / ljj
    }
  }
  return true
}

/** L·Lᵀ x = b çözümü (L cholesky() çıktısı); sonuç b'nin yerine yazılır. */
export function choleskySolve(l: Float64Array, n: number, b: Float64Array): void {
  for (let i = 0; i < n; i++) {
    const ir = i * n
    let s = b[i]!
    for (let k = 0; k < i; k++) s -= l[ir + k]! * b[k]!
    b[i] = s / l[ir + i]!
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i]!
    for (let k = i + 1; k < n; k++) s -= l[k * n + i]! * b[k]!
    b[i] = s / l[i * n + i]!
  }
}

/**
 * Simetrik pozitif tanımlı sistemi çözer (A bozulur). Sayısal olarak tekilse köşegene artan küçük bir pay eklenip
 * yeniden denenir; `backup` A'nın kopyası olarak gerekir.
 */
export function solveSpd(a: Float64Array, n: number, b: Float64Array): void {
  const backup = Float64Array.from(a)
  let jitter = 1e-9
  for (;;) {
    if (cholesky(a, n)) {
      choleskySolve(a, n, b)
      return
    }
    a.set(backup)
    let tr = 0
    for (let i = 0; i < n; i++) tr += Math.abs(backup[i * n + i]!)
    const add = jitter * Math.max(1, tr / n)
    for (let i = 0; i < n; i++) a[i * n + i]! += add
    jitter *= 10
    if (jitter > 1) throw new Error('doğrusal sistem çözülemedi (pozitif tanımlı değil)')
  }
}

/**
 * Eşlenik gradyan: A x = b, x başlangıç değeriyle (sıcak başlangıç) `steps` adım. `mul(p, out)` out ← A·p hesaplar.
 * A simetrik pozitif tanımlıysa her adım ikinci dereceden amacı azaltır (ALS'de kaybın düşmesi buna dayanır).
 */
export function conjugateGradient(
  mul: (p: Float64Array, out: Float64Array) => void,
  b: Float64Array,
  x: Float64Array,
  steps: number,
  scratch: { r: Float64Array; p: Float64Array; ap: Float64Array },
): void {
  const n = b.length
  const { r, p, ap } = scratch
  mul(x, ap)
  let rs = 0
  for (let i = 0; i < n; i++) {
    r[i] = b[i]! - ap[i]!
    p[i] = r[i]!
    rs += r[i]! * r[i]!
  }
  for (let s = 0; s < steps; s++) {
    if (rs < 1e-20) return
    mul(p, ap)
    let pap = 0
    for (let i = 0; i < n; i++) pap += p[i]! * ap[i]!
    if (!(pap > 0)) return
    const alpha = rs / pap
    let rsNew = 0
    for (let i = 0; i < n; i++) {
      x[i]! += alpha * p[i]!
      r[i]! -= alpha * ap[i]!
      rsNew += r[i]! * r[i]!
    }
    const beta = rsNew / rs
    for (let i = 0; i < n; i++) p[i] = r[i]! + beta * p[i]!
    rs = rsNew
  }
}

/** Gram matrisi G = Yᵀ Y (Y: rows × f, satır öncelikli). */
export function gram(y: ArrayLike<number>, rows: number, f: number, out: Float64Array): Float64Array {
  out.fill(0)
  for (let r = 0; r < rows; r++) {
    const o = r * f
    for (let i = 0; i < f; i++) {
      const yi = y[o + i]!
      if (yi === 0) continue
      const gi = i * f
      for (let j = i; j < f; j++) out[gi + j]! += yi * y[o + j]!
    }
  }
  for (let i = 0; i < f; i++) for (let j = 0; j < i; j++) out[i * f + j] = out[j * f + i]!
  return out
}

/** out ← M·v (M: n×n) */
export function matVec(m: Float64Array, n: number, v: ArrayLike<number>, out: Float64Array): void {
  for (let i = 0; i < n; i++) {
    let s = 0
    const o = i * n
    for (let j = 0; j < n; j++) s += m[o + j]! * v[j]!
    out[i] = s
  }
}

export const sigmoid = (z: number): number => (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)))
