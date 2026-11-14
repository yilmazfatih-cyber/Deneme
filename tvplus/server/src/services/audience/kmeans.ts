/**
 * Küresel k-ortalama (kosinüs) — seyrek, birim uzunluklu satırlar üzerinde.
 *
 * - Satırlar CSR biçiminde (rowPtr / col / val) tutulur; merkezler özellik-öncelikli yoğun dizidir: CT[f·k + j].
 *   Bir satırın tüm merkezlere benzerliği O(nnz·k) — n satır için bir tur O(n·nnz·k); n² geçiş yoktur.
 * - Başlangıç: tohumlu k-means++ (uzaklık = 1 − kosinüs, ağırlık = uzaklık²). Ayrık nokta kalmazsa daha az merkezle durur
 *   (k veriyle sınırlanır).
 * - k seçimi: aday k'lar örneklem üzerinde kümelenir, siluetle karşılaştırılır (en iyiye 0,01 yakın adaylardan en
 *   büyük k); seçilen k tüm veride yeniden koşar.
 * - Siluet: birim vektörlerde bir noktanın bir kümeye ortalama kosinüs uzaklığı 1 − x·ΣC/|C| olduğundan küme toplamlarıyla
 *   KESİN hesaplanır (örneklem üzerinde, nokta başına O(nnz·k)).
 * - Hesap üreteç (generator) olarak yazılmıştır: `yield` noktalarında arka plan sürücüsü olay döngüsüne nefes aldırır;
 *   eşzamanlı sürücü aynı kodu tek seferde koşar. Sonuç ikisinde de aynıdır.
 */
import { mixSeed, mulberry32, sampleIndices, type Rng } from './prng'

export type Work<T> = Generator<void, T, void>

export interface SparseMatrix {
  n: number
  dims: number
  rowPtr: Uint32Array
  col: Uint32Array
  /** Satırlar L2 ile birim uzunluğa getirilmiştir */
  val: Float32Array
}

export interface ClusterOptions {
  seed: number
  /** Verilirse aday aranmaz (yine üst sınırlarla kısılır) */
  k: number | null
  /** Üst sınır (config.maxCommunities) */
  maxK: number
}

export interface ClusterResult {
  k: number
  /** Satır → küme (0…k−1) */
  assign: Int32Array
  /** Satırın kendi merkezine kosinüsü */
  sim: Float32Array
  /** Özellik-öncelikli birim merkezler: CT[f·k + j] */
  ct: Float32Array
  iterations: number
  silhouette: number | null
  candidates: { k: number; silhouette: number | null }[]
}

/** k seçimi için örneklem büyüklüğü ve siluetin değerlendirildiği nokta sayısı */
const SAMPLE_SIZE = 8000
const EVAL_SIZE = 4000
const MAX_ITER = 40
const MAX_ITER_SAMPLE = 25
/** Değişen atama oranı bunun altına inince durulur */
const CONVERGE_TOL = 0.0002
/** Ortalama küme boyunun bu oranından küçük kümeler dağıtılıp komşularına katılır */
const TINY_FRACTION = 0.2
const MAX_CANDIDATES = 12
/** Aday başına k-means++ başlangıç sayısı (küçük örneklemde daha çok) */
const RESTARTS = 3
const RESTARTS_SMALL = 5
const SMALL_SAMPLE = 3000
/** Siluette bu kadar fark "aynı" sayılır; düzlükte daha ince bölümleme seçilir */
const SIL_TOLERANCE = 0.01
const YIELD_EVERY = 1024

/* ───────────── çekirdek işlemler ───────────── */

function scoreRow(m: SparseMatrix, i: number, ct: Float32Array | Float64Array, k: number, scores: Float64Array): void {
  scores.fill(0, 0, k)
  const end = m.rowPtr[i + 1]!
  for (let p = m.rowPtr[i]!; p < end; p++) {
    const v = m.val[p]!
    const base = m.col[p]! * k
    for (let j = 0; j < k; j++) scores[j] = scores[j]! + v * ct[base + j]!
  }
}

function argmax(scores: Float64Array, k: number): number {
  let bj = 0
  let bs = scores[0]!
  for (let j = 1; j < k; j++) {
    if (scores[j]! > bs) {
      bs = scores[j]!
      bj = j
    }
  }
  return bj
}

function rowAt(rows: Uint32Array | null, t: number): number {
  return rows ? rows[t]! : t
}

/** Tohumlu k-means++: `rows` içinden en çok k merkez seçer (ayrık nokta biterse daha az). */
export function* seedPlusPlus(
  m: SparseMatrix,
  rows: Uint32Array | null,
  k: number,
  rng: Rng,
): Work<{ ct: Float32Array; k: number }> {
  const len = rows ? rows.length : m.n
  const best = new Float64Array(len).fill(-Infinity)
  const dense = new Float64Array(m.dims)
  const centers: number[] = []
  let next = rowAt(rows, Math.floor(rng() * len))
  for (;;) {
    centers.push(next)
    for (let p = m.rowPtr[next]!; p < m.rowPtr[next + 1]!; p++) dense[m.col[p]!] = m.val[p]!
    for (let t = 0; t < len; t++) {
      const i = rowAt(rows, t)
      let s = 0
      for (let p = m.rowPtr[i]!; p < m.rowPtr[i + 1]!; p++) s += m.val[p]! * dense[m.col[p]!]!
      if (s > best[t]!) best[t] = s
      if ((t & (YIELD_EVERY * 4 - 1)) === 0) yield
    }
    for (let p = m.rowPtr[next]!; p < m.rowPtr[next + 1]!; p++) dense[m.col[p]!] = 0
    if (centers.length >= k) break
    let total = 0
    for (let t = 0; t < len; t++) {
      const d = Math.max(0, 1 - best[t]!)
      total += d * d
    }
    if (total <= 1e-9) break // kalan noktalar seçilmiş merkezlerle aynı
    let u = rng() * total
    let pick = len - 1
    for (let t = 0; t < len; t++) {
      const d = Math.max(0, 1 - best[t]!)
      u -= d * d
      if (u <= 0 && d > 0) {
        pick = t
        break
      }
    }
    next = rowAt(rows, pick)
  }
  const kk = centers.length
  const ct = new Float32Array(m.dims * kk)
  centers.forEach((r, j) => {
    for (let p = m.rowPtr[r]!; p < m.rowPtr[r + 1]!; p++) ct[m.col[p]! * kk + j] = m.val[p]!
  })
  return { ct, k: kk }
}

/** Merkez sütunlarını birim uzunluğa getirir (boş sütun sıfır kalır). */
function normaliseColumns(sums: Float64Array, dims: number, k: number, ct: Float32Array): void {
  const norms = new Float64Array(k)
  for (let f = 0; f < dims; f++) {
    const base = f * k
    for (let j = 0; j < k; j++) {
      const v = sums[base + j]!
      norms[j] = norms[j]! + v * v
    }
  }
  for (let j = 0; j < k; j++) norms[j] = norms[j]! > 0 ? 1 / Math.sqrt(norms[j]!) : 0
  for (let f = 0; f < dims; f++) {
    const base = f * k
    for (let j = 0; j < k; j++) ct[base + j] = sums[base + j]! * norms[j]!
  }
}

/** Satır toplamlarını kümelere ekler (özellik-öncelikli). */
function accumulate(
  m: SparseMatrix,
  rows: Uint32Array | null,
  assign: Int32Array,
  k: number,
  sums: Float64Array,
  counts: Int32Array,
): void {
  sums.fill(0)
  counts.fill(0)
  for (let t = 0; t < assign.length; t++) {
    const a = assign[t]!
    if (a < 0) continue
    counts[a] = counts[a]! + 1
    const i = rowAt(rows, t)
    for (let p = m.rowPtr[i]!; p < m.rowPtr[i + 1]!; p++) {
      const idx = m.col[p]! * k + a
      sums[idx] = sums[idx]! + m.val[p]!
    }
  }
}

export interface LloydResult {
  k: number
  assign: Int32Array
  sim: Float32Array
  ct: Float32Array
  iterations: number
}

/** Lloyd turları (küresel): en yakın merkeze ata → merkez = üyelerin birim ortalaması. Boş küme en uyumsuz noktayla doldurulur. */
export function* lloyd(
  m: SparseMatrix,
  rows: Uint32Array | null,
  k: number,
  init: Float32Array,
  maxIter: number,
): Work<LloydResult> {
  const len = rows ? rows.length : m.n
  const ct = new Float32Array(init)
  const assign = new Int32Array(len).fill(-1)
  const sim = new Float32Array(len)
  const scores = new Float64Array(k)
  const sums = new Float64Array(m.dims * k)
  const counts = new Int32Array(k)
  let iterations = 0
  for (let iter = 0; iter < maxIter; iter++) {
    let changes = 0
    for (let t = 0; t < len; t++) {
      scoreRow(m, rowAt(rows, t), ct, k, scores)
      const bj = argmax(scores, k)
      sim[t] = scores[bj]!
      if (assign[t] !== bj) {
        changes++
        assign[t] = bj
      }
      if ((t & (YIELD_EVERY - 1)) === 0) yield
    }
    accumulate(m, rows, assign, k, sums, counts)
    // Boş küme: kendi merkezine en az benzeyen (ve kümesinde yalnız olmayan) nokta oraya taşınır.
    for (let j = 0; j < k; j++) {
      if (counts[j]! > 0) continue
      let worst = -1
      for (let t = 0; t < len; t++) {
        if (counts[assign[t]!]! <= 1) continue
        if (worst < 0 || sim[t]! < sim[worst]!) worst = t
      }
      if (worst < 0) break
      const from = assign[worst]!
      const i = rowAt(rows, worst)
      for (let p = m.rowPtr[i]!; p < m.rowPtr[i + 1]!; p++) {
        const f = m.col[p]!
        sums[f * k + from] = sums[f * k + from]! - m.val[p]!
        sums[f * k + j] = sums[f * k + j]! + m.val[p]!
      }
      counts[from] = counts[from]! - 1
      counts[j] = 1
      assign[worst] = j
      sim[worst] = 1
      changes++
    }
    normaliseColumns(sums, m.dims, k, ct)
    iterations = iter + 1
    yield
    if (changes <= len * CONVERGE_TOL) break
  }
  // Son merkezlere göre benzerlikler (atama değişmez)
  for (let t = 0; t < len; t++) {
    const i = rowAt(rows, t)
    const a = assign[t]!
    let s = 0
    for (let p = m.rowPtr[i]!; p < m.rowPtr[i + 1]!; p++) s += m.val[p]! * ct[m.col[p]! * k + a]!
    sim[t] = s
    if ((t & (YIELD_EVERY * 4 - 1)) === 0) yield
  }
  return { k, assign, sim, ct, iterations }
}

/**
 * Ortalama siluet (kosinüs uzaklığı). Küme toplamları `rows`'un tümünden; değerlendirme `evalPos` konumlarında.
 * k < 2 ise null.
 */
export function* silhouette(
  m: SparseMatrix,
  rows: Uint32Array | null,
  assign: Int32Array,
  k: number,
  evalPos: Uint32Array,
): Work<number | null> {
  if (k < 2 || evalPos.length === 0) return null
  const sums = new Float64Array(m.dims * k)
  const counts = new Int32Array(k)
  accumulate(m, rows, assign, k, sums, counts)
  const scores = new Float64Array(k)
  let total = 0
  for (let e = 0; e < evalPos.length; e++) {
    const t = evalPos[e]!
    const i = rowAt(rows, t)
    const a = assign[t]!
    scoreRow(m, i, sums, k, scores)
    let self = 0
    for (let p = m.rowPtr[i]!; p < m.rowPtr[i + 1]!; p++) self += m.val[p]! * m.val[p]!
    if (counts[a]! <= 1) continue // tekil küme: s = 0
    const ad = Math.max(0, 1 - (scores[a]! - self) / (counts[a]! - 1))
    let bd = Infinity
    for (let j = 0; j < k; j++) {
      if (j === a || counts[j]! === 0) continue
      const d = Math.max(0, 1 - scores[j]! / counts[j]!)
      if (d < bd) bd = d
    }
    if (!Number.isFinite(bd)) continue
    const den = Math.max(ad, bd)
    total += den > 0 ? (bd - ad) / den : 0
    if ((e & (YIELD_EVERY - 1)) === 0) yield
  }
  return total / evalPos.length
}

/** Aday k'lar: küçük üst sınırda hepsi, büyükte 2…8 ve sonrası geometrik (en çok MAX_CANDIDATES). */
export function kCandidates(kMax: number): number[] {
  if (kMax < 2) return [Math.max(1, kMax)]
  if (kMax <= MAX_CANDIDATES + 1) return Array.from({ length: kMax - 1 }, (_, i) => i + 2)
  const out = new Set<number>([2, 3, 4, 5, 6])
  const steps = MAX_CANDIDATES - out.size
  const ratio = Math.pow(kMax / 6, 1 / steps)
  for (let s = 1; s <= steps; s++) out.add(Math.min(kMax, Math.round(6 * Math.pow(ratio, s))))
  return [...out].sort((a, b) => a - b)
}

/** Konumları eşit aralıkla seçer (en çok `limit`). */
function strided(len: number, limit: number): Uint32Array {
  const m = Math.min(len, limit)
  const out = new Uint32Array(m)
  for (let e = 0; e < m; e++) out[e] = Math.floor((e * len) / m)
  return out
}

/** Merkez sütunlarından bir alt küme (küçük kümeler dağıtılırken). */
function selectColumns(ct: Float32Array, dims: number, k: number, keep: number[]): Float32Array {
  const kk = keep.length
  const out = new Float32Array(dims * kk)
  for (let f = 0; f < dims; f++) keep.forEach((j, c) => (out[f * kk + c] = ct[f * k + j]!))
  return out
}

/**
 * Tüm hat: (aday k'lar → örneklemde k-means++ + Lloyd + siluet) → seçilen k ile tüm veride Lloyd →
 * küçük kümeleri dağıt → son siluet.
 */
export function* cluster(m: SparseMatrix, opts: ClusterOptions): Work<ClusterResult> {
  const n = m.n
  if (n === 0) {
    return {
      k: 0,
      assign: new Int32Array(0),
      sim: new Float32Array(0),
      ct: new Float32Array(0),
      iterations: 0,
      silhouette: null,
      candidates: [],
    }
  }
  const rng = mulberry32(opts.seed)
  const sampleRows = sampleIndices(n, SAMPLE_SIZE, rng)
  const sampleIsAll = sampleRows.length === n
  const bound = Math.max(1, Math.min(opts.maxK, n))
  const candidates =
    opts.k !== null
      ? [Math.max(1, Math.min(Math.round(opts.k), bound))]
      : kCandidates(Math.min(bound, Math.max(1, Math.floor(Math.sqrt(n)))))
  const evalSample = strided(sampleRows.length, EVAL_SIZE)

  const results: { res: LloydResult; sil: number | null }[] = []
  const tried: { k: number; silhouette: number | null }[] = []
  const restarts = sampleRows.length <= SMALL_SAMPLE ? RESTARTS_SMALL : RESTARTS
  for (const kc of candidates) {
    // Birkaç tohumlu başlangıç; amaç (üyelerin merkezlerine toplam benzerliği) en yüksek olan kalır
    let res: LloydResult | null = null
    let bestObjective = -Infinity
    for (let r = 0; r < restarts; r++) {
      const init = yield* seedPlusPlus(m, sampleRows, kc, mulberry32(mixSeed(opts.seed, kc * 16 + r)))
      const cand = yield* lloyd(m, sampleRows, init.k, init.ct, sampleIsAll ? MAX_ITER : MAX_ITER_SAMPLE)
      let objective = 0
      for (const x of cand.sim) objective += x
      if (objective > bestObjective + 1e-9) {
        bestObjective = objective
        res = cand
      }
    }
    if (!res || tried.some((c) => c.k === res.k)) continue // veri daha fazla ayrık merkez vermedi
    const sil = candidates.length > 1 ? yield* silhouette(m, sampleRows, res.assign, res.k, evalSample) : null
    tried.push({ k: res.k, silhouette: sil === null ? null : round(sil, 4) })
    results.push({ res, sil })
  }
  if (results.length === 0) throw new Error('kümeleme adayı yok')
  // Siluet düzlüğü: en iyiye SIL_TOLERANCE kadar yakın adaylardan en ince olanı (en büyük k) seçilir —
  // veri ayrımı bozmadan ne kadar ince topluluk taşıyorsa o kadar; gürültü düzeyindeki farklar seçimi oynatmaz.
  const bestSil = Math.max(...results.map((r) => r.sil ?? -2))
  let best = results[0]!
  for (const r of results) if ((r.sil ?? -2) >= bestSil - SIL_TOLERANCE && r.res.k > best.res.k) best = r
  if ((best.sil ?? -2) < bestSil - SIL_TOLERANCE) best = results.find((r) => (r.sil ?? -2) === bestSil)!

  let full: LloydResult = sampleIsAll ? best.res : yield* lloyd(m, null, best.res.k, best.res.ct, MAX_ITER)
  let iterations = full.iterations

  // Küçük kümeler: dağıtılır, üyeleri en yakın kalan merkeze katılır.
  for (let pass = 0; pass < 3 && full.k > 1; pass++) {
    const counts = new Int32Array(full.k)
    for (const a of full.assign) counts[a] = counts[a]! + 1
    const minSize = Math.max(2, Math.ceil((TINY_FRACTION * n) / full.k))
    const keep: number[] = []
    for (let j = 0; j < full.k; j++) if (counts[j]! >= minSize) keep.push(j)
    if (keep.length === full.k) break
    if (keep.length === 0) {
      let largest = 0
      for (let j = 1; j < full.k; j++) if (counts[j]! > counts[largest]!) largest = j
      keep.push(largest)
    }
    full = yield* lloyd(m, null, keep.length, selectColumns(full.ct, m.dims, full.k, keep), MAX_ITER)
    iterations += full.iterations
  }

  const sil = full.k > 1 ? yield* silhouette(m, null, full.assign, full.k, evalOf(sampleRows)) : null
  return {
    k: full.k,
    assign: full.assign,
    sim: full.sim,
    ct: full.ct,
    iterations,
    silhouette: sil === null ? null : round(sil, 4),
    candidates: tried,
  }
}

/** Tüm veride siluetin değerlendirileceği satırlar: örneklemden eşit aralıkla en çok EVAL_SIZE. */
function evalOf(sampleRows: Uint32Array): Uint32Array {
  const pos = strided(sampleRows.length, EVAL_SIZE)
  const out = new Uint32Array(pos.length)
  for (let e = 0; e < pos.length; e++) out[e] = sampleRows[pos[e]!]!
  return out
}

export function round(x: number, digits: number): number {
  const f = Math.pow(10, digits)
  return Math.round(x * f) / f
}
