/**
 * Örtük geri bildirimli matris ayrıştırma — ağırlıklı değişken en küçük kareler (Hu, Koren, Volinsky 2008).
 *
 *   amaç  = Σ_{u,i} c_ui (p_ui − x_uᵀ y_i)² + λ (Σ‖x_u‖² + Σ‖y_i‖²)
 *   p_ui  = 1 gözlenen çiftte, 0 diğerlerinde ·  c_ui = 1 + α · ilgi (gözlenmeyende 1)
 *
 * Bir taraf sabitken her satırın normal denklemleri tam çözülür:
 *   (YᵀY + Yᵀ(C_u − I)Y + λI) x_u = Yᵀ C_u p_u
 * YᵀY her yarım adımda bir kez hesaplanır; satırın kendi çiftleri yalnız kendi katkısını ekler. Küçük problemlerde
 * Cholesky (tam), büyüklerde sıcak başlangıçlı eşlenik gradyan (birkaç adım; amaç yine her adımda düşer).
 * Tüm döngüler üreteçtir (`yield`): arka plan sürücüsü kısa dilimlerle çalıştırır, olay döngüsü kilitlenmez.
 */
import type { Csr, Work } from './data'
import { cholesky, choleskySolve, conjugateGradient, gaussian, gram, mixSeed, mulberry32 } from './linalg'

export interface AlsParams {
  factors: number
  iterations: number
  regularization: number
  alpha: number
  seed: number
  /** 'auto': satır × f³ küçükse Cholesky, değilse eşlenik gradyan */
  solver?: 'cholesky' | 'cg' | 'auto'
  cgSteps?: number
}

export interface AlsResult {
  /** İzleyici vektörleri (satır × f) */
  x: Float32Array
  /** Başlık vektörleri (başlık × f) */
  y: Float32Array
  /** Yineleme başına kayıp (etkileşim başına; düzenlileştirme dahil) */
  loss: number[]
  solver: 'cholesky' | 'cg'
}

/** Yaklaşık kayan nokta işlemi cinsinden verim aralığı (kalabalık satırlar tek başına uzun sürebilir) */
const YIELD_WORK = 2_000_000

/**
 * Bir tarafın tüm satırlarını çözer: `rows` (CSR) her satırın karşı taraftaki sütunları ve ilgi puanları,
 * `other` karşı tarafın vektörleri. Sonuç `out`a yazılır (CG için aynı zamanda sıcak başlangıç).
 */
export function* solveSide(
  rows: Csr,
  other: Float32Array,
  out: Float32Array,
  f: number,
  lambda: number,
  alpha: number,
  solver: 'cholesky' | 'cg',
  cgSteps: number,
): Work<void> {
  const G = gram(other, rows.cols, f, new Float64Array(f * f))
  for (let k = 0; k < f; k++) G[k * f + k]! += lambda
  const A = new Float64Array(f * f)
  const b = new Float64Array(f)
  const x = new Float64Array(f)
  const scratch = { r: new Float64Array(f), p: new Float64Array(f), ap: new Float64Array(f) }
  let start = 0
  let end = 0
  let work = 0
  const mul = (p: Float64Array, o: Float64Array) => {
    for (let a = 0; a < f; a++) {
      let s = 0
      const ga = a * f
      for (let c = 0; c < f; c++) s += G[ga + c]! * p[c]!
      o[a] = s
    }
    for (let q = start; q < end; q++) {
      const yo = rows.idx[q]! * f
      let s = 0
      for (let c = 0; c < f; c++) s += other[yo + c]! * p[c]!
      s *= alpha * rows.val[q]!
      if (s === 0) continue
      for (let c = 0; c < f; c++) o[c]! += s * other[yo + c]!
    }
  }
  for (let r = 0; r < rows.rows; r++) {
    start = rows.ptr[r]!
    end = rows.ptr[r + 1]!
    const ro = r * f
    if (start === end) {
      for (let c = 0; c < f; c++) out[ro + c] = 0
    } else {
      b.fill(0)
      for (let q = start; q < end; q++) {
        const yo = rows.idx[q]! * f
        const conf = 1 + alpha * rows.val[q]!
        for (let c = 0; c < f; c++) b[c]! += conf * other[yo + c]!
      }
      if (solver === 'cholesky') {
        A.set(G)
        for (let q = start; q < end; q++) {
          const yo = rows.idx[q]! * f
          const w = alpha * rows.val[q]!
          if (w === 0) continue
          for (let a = 0; a < f; a++) {
            const wa = w * other[yo + a]!
            const aa = a * f
            for (let c = 0; c <= a; c++) A[aa + c]! += wa * other[yo + c]!
          }
        }
        for (let a = 0; a < f; a++) for (let c = a + 1; c < f; c++) A[a * f + c] = A[c * f + a]!
        if (!cholesky(A, f)) throw new Error('ALS: normal denklemler pozitif tanımlı değil')
        choleskySolve(A, f, b)
        for (let c = 0; c < f; c++) out[ro + c] = b[c]!
      } else {
        for (let c = 0; c < f; c++) x[c] = out[ro + c]!
        conjugateGradient(mul, b, x, cgSteps, scratch)
        for (let c = 0; c < f; c++) out[ro + c] = x[c]!
      }
    }
    work += (end - start) * f * (solver === 'cholesky' ? f : 4 * cgSteps) + f * f * (solver === 'cholesky' ? 1 : cgSteps)
    if (work >= YIELD_WORK) {
      work = 0
      yield
    }
  }
}

/**
 * Etkileşim başına kayıp: [Σ_u x_uᵀ (YᵀY) x_u + Σ_gözlenen (c(1 − s)² − s²) + λ(‖X‖² + ‖Y‖²)] / nnz.
 * Gözlenmeyen çiftlerin toplamı Gram matrisiyle kapalı biçimde hesaplanır (tüm çiftler gezilmez).
 */
export function* alsLoss(
  byViewer: Csr,
  x: Float32Array,
  y: Float32Array,
  f: number,
  lambda: number,
  alpha: number,
): Work<number> {
  const G = gram(y, byViewer.cols, f, new Float64Array(f * f))
  let total = 0
  let reg = 0
  let nnz = 0
  for (let u = 0; u < byViewer.rows; u++) {
    const xo = u * f
    let quad = 0
    for (let a = 0; a < f; a++) {
      const xa = x[xo + a]!
      if (xa === 0) continue
      let s = 0
      const ga = a * f
      for (let c = 0; c < f; c++) s += G[ga + c]! * x[xo + c]!
      quad += xa * s
      reg += xa * xa
    }
    total += quad
    for (let q = byViewer.ptr[u]!; q < byViewer.ptr[u + 1]!; q++) {
      const yo = byViewer.idx[q]! * f
      let s = 0
      for (let c = 0; c < f; c++) s += x[xo + c]! * y[yo + c]!
      const conf = 1 + alpha * byViewer.val[q]!
      total += conf * (1 - s) * (1 - s) - s * s
      nnz++
    }
    if (u % 256 === 255) yield
  }
  for (let k = 0; k < y.length; k++) reg += y[k]! * y[k]!
  return nnz > 0 ? (total + lambda * reg) / nnz : 0
}

export function chooseSolver(p: AlsParams, rows: number): 'cholesky' | 'cg' {
  if (p.solver === 'cholesky' || p.solver === 'cg') return p.solver
  return rows * p.factors ** 3 <= 1.5e8 ? 'cholesky' : 'cg'
}

/** ALS eğitimi. Başlık vektörleri tohumlu küçük normal değerlerle başlar; ilk adım izleyicileri çözer. */
export function* trainAls(
  byViewer: Csr,
  byTitle: Csr,
  p: AlsParams,
  onIteration?: (iteration: number, loss: number) => void,
): Work<AlsResult> {
  const f = p.factors
  const rng = mulberry32(mixSeed(p.seed, 7))
  const y = new Float32Array(byTitle.rows * f)
  const scale = 0.1 / Math.sqrt(f)
  for (let k = 0; k < y.length; k++) y[k] = gaussian(rng) * scale
  const x = new Float32Array(byViewer.rows * f)
  const solver = chooseSolver(p, byViewer.rows + byTitle.rows)
  const cgSteps = p.cgSteps ?? 3
  const loss: number[] = []
  for (let it = 0; it < p.iterations; it++) {
    yield* solveSide(byViewer, y, x, f, p.regularization, p.alpha, solver, it === 0 ? cgSteps + 3 : cgSteps)
    yield* solveSide(byTitle, x, y, f, p.regularization, p.alpha, solver, cgSteps)
    const l = yield* alsLoss(byViewer, x, y, f, p.regularization, p.alpha)
    loss.push(l)
    onIteration?.(it, l)
  }
  return { x, y, loss, solver }
}
