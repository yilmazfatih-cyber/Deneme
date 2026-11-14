/**
 * İçerik kulesi: başlığın içerik işaretlerinden iş birlikçi başlık vektörüne doğrusal eşleme (ağırlıklı ridge).
 *
 * İşaret grupları (her grup kendi içinde birim uzunluğa getirilir, sonra grup ağırlığıyla çarpılır; böylece çok
 * boyutlu bir grup diğerlerini ezmez):
 *   gömme vektörü (embeddings.titleVector) · etiket ölçekleri (0–5 → 0–1) · niteleyiciler · yüz değerleri ·
 *   türler · ruh hâlleri · mikro türler (en sık olanlar) · film/dizi · yapım dönemi · sabit terim
 *
 * Çözüm: (XᵀWX + λI) B = XᵀWV  (özellik sayısı ≤ başlık sayısıysa)  ya da eşdeğer ikili biçim
 *        B = XᵀW½ (W½XXᵀW½ + λI)⁻¹ W½V  (başlık sayısı daha azsa). W = izlenme sayısına göre güven.
 * Hiç izlenmemiş başlık için tahmin edilen vektör tek işarettir; az izlenende iş birlikçi vektörle harmanlanır.
 */
import type { ContentTitle } from '../../../../shared/content-schema'
import type { Work } from './data'
import { choleskySolve, solveSpd } from './linalg'

export interface ContentSources {
  tags: (titleId: number) => {
    scales: Record<string, number>
    facets: Record<string, string[]>
    descriptors: string[]
  } | null
  microgenres: (titleId: number) => string[]
  embedding: (titleId: number) => Float32Array | null
}

export interface ContentFeatures {
  /** Özellik adları (sözlük sırasıyla; gömme boyutları 'e:000' …) */
  names: string[]
  /** Başlık başına seyrek satır */
  rows: { idx: Int32Array; val: Float64Array }[]
  /** Hangi işaretler bulundu */
  signals: { tags: boolean; microgenres: boolean; embeddings: boolean; embeddingDims: number }
}

const GROUP_WEIGHT: Record<string, number> = {
  e: 1.2,
  s: 0.8,
  d: 0.6,
  f: 0.8,
  g: 1.0,
  m: 0.7,
  mg: 1.0,
  t: 0.5,
  y: 0.4,
  b: 1.0,
}

/** Bir mikro türün özellik olabilmesi için gereken en az başlık; en çok bu kadar mikro tür kullanılır */
const MG_MIN_TITLES = 3
const MG_MAX = 300

/** Başlık sırası `titleIds` ile aynıdır. */
export function* buildContentFeatures(titles: (ContentTitle | null)[], src: ContentSources): Work<ContentFeatures> {
  const perTitle: Map<string, number>[] = []
  const mgCount = new Map<string, number>()
  const mgOf: string[][] = []
  let anyTags = false
  let embDims = 0
  for (let k = 0; k < titles.length; k++) {
    const t = titles[k]
    const ids = t ? safe(() => src.microgenres(t.videoId), [] as string[]) : []
    mgOf.push(ids)
    for (const id of ids) mgCount.set(id, (mgCount.get(id) ?? 0) + 1)
    if ((k & 255) === 255) yield
  }
  const mgKeep = new Set(
    [...mgCount]
      .filter(([, c]) => c >= MG_MIN_TITLES)
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .slice(0, MG_MAX)
      .map(([id]) => id),
  )
  for (let k = 0; k < titles.length; k++) {
    const t = titles[k]
    const m = new Map<string, number>()
    perTitle.push(m)
    if (!t) continue
    const groups = new Map<string, Map<string, number>>()
    const put = (g: string, key: string, v: number) => {
      if (!Number.isFinite(v) || v === 0) return
      let gm = groups.get(g)
      if (!gm) {
        gm = new Map()
        groups.set(g, gm)
      }
      gm.set(`${g}:${key}`, v)
    }
    const emb = safe(() => src.embedding(t.videoId), null)
    if (emb && emb.length > 0) {
      embDims = Math.max(embDims, emb.length)
      for (let q = 0; q < emb.length; q++) put('e', String(q).padStart(3, '0'), emb[q]!)
    }
    const tags = safe(() => src.tags(t.videoId), null)
    if (tags) {
      for (const [key, v] of Object.entries(tags.scales)) {
        put('s', key, v / 5)
        anyTags = true
      }
      for (const d of tags.descriptors) {
        put('d', d, 1)
        anyTags = true
      }
      for (const [facet, values] of Object.entries(tags.facets))
        for (const v of values) {
          put('f', `${facet}=${v}`, 1)
          anyTags = true
        }
    }
    for (const g of t.genres) put('g', g, 1)
    for (const mood of t.moods) put('m', mood, 1)
    for (const id of mgOf[k]!) if (mgKeep.has(id)) put('mg', id, 1)
    put('t', t.type, 1)
    put('y', 'donem', Math.max(0.01, Math.min(1, (t.year - 1880) / 150)))
    put('b', 'sabit', 1)
    for (const [g, gm] of groups) {
      let norm = 0
      for (const v of gm.values()) norm += v * v
      const w = (GROUP_WEIGHT[g] ?? 1) / Math.sqrt(norm)
      for (const [key, v] of gm) m.set(key, v * w)
    }
    if ((k & 127) === 127) yield
  }
  const nameSet = new Set<string>()
  for (const m of perTitle) for (const key of m.keys()) nameSet.add(key)
  const names = [...nameSet].sort()
  const nameIndex = new Map(names.map((n, k) => [n, k]))
  const rows = perTitle.map((m) => {
    const entries = [...m].map(([key, v]) => [nameIndex.get(key)!, v] as const).sort((a, b) => a[0] - b[0])
    return { idx: Int32Array.from(entries.map((e) => e[0])), val: Float64Array.from(entries.map((e) => e[1])) }
  })
  return {
    names,
    rows,
    signals: { tags: anyTags, microgenres: mgKeep.size > 0, embeddings: embDims > 0, embeddingDims: embDims },
  }
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn()
  } catch {
    return fallback
  }
}

/** Seyrek iki satırın iç çarpımı */
function sparseDot(a: { idx: Int32Array; val: Float64Array }, b: { idx: Int32Array; val: Float64Array }): number {
  let i = 0
  let j = 0
  let s = 0
  while (i < a.idx.length && j < b.idx.length) {
    const ai = a.idx[i]!
    const bj = b.idx[j]!
    if (ai === bj) s += a.val[i++]! * b.val[j++]!
    else if (ai < bj) i++
    else j++
  }
  return s
}

export interface ContentTower {
  /** Özellik × f ağırlık matrisi (birincil biçim) */
  weights: Float64Array
  dims: number
  f: number
}

/**
 * Ağırlıklı ridge: `train` eğitimde görülen başlık satırları, `target` onların ALS vektörleri, `weight` güvenleri.
 */
export function* fitContentTower(
  feats: ContentFeatures,
  train: number[],
  target: Float32Array,
  weight: Float64Array,
  f: number,
  lambda: number,
): Work<ContentTower> {
  const d = feats.names.length
  const W = new Float64Array(d * f)
  const n = train.length
  if (n === 0 || d === 0) return { weights: W, dims: d, f }
  if (d <= n) {
    // Birincil: (XᵀWX + λI) B = XᵀWV
    const A = new Float64Array(d * d)
    const R = new Float64Array(d * f)
    for (let q = 0; q < n; q++) {
      const t = train[q]!
      const row = feats.rows[t]!
      const w = weight[q]!
      for (let a = 0; a < row.idx.length; a++) {
        const ia = row.idx[a]!
        const va = w * row.val[a]!
        for (let c = 0; c < row.idx.length; c++) A[ia * d + row.idx[c]!]! += va * row.val[c]!
        for (let c = 0; c < f; c++) R[ia * f + c]! += va * target[t * f + c]!
      }
      if ((q & 63) === 63) yield
    }
    for (let a = 0; a < d; a++) A[a * d + a]! += lambda
    yield
    solveColumns(A, d, R, f)
    W.set(R)
    return { weights: W, dims: d, f }
  }
  // İkili: K = W½ X Xᵀ W½ + λI ;  α = K⁻¹ W½ V ;  B = Xᵀ W½ α
  const K = new Float64Array(n * n)
  const sw = Float64Array.from(weight.subarray(0, n), Math.sqrt)
  for (let a = 0; a < n; a++) {
    const ra = feats.rows[train[a]!]!
    for (let c = 0; c <= a; c++) {
      const v = sw[a]! * sw[c]! * sparseDot(ra, feats.rows[train[c]!]!)
      K[a * n + c] = v
      K[c * n + a] = v
    }
    K[a * n + a]! += lambda
    if ((a & 15) === 15) yield
  }
  const R = new Float64Array(n * f)
  for (let a = 0; a < n; a++) for (let c = 0; c < f; c++) R[a * f + c] = sw[a]! * target[train[a]! * f + c]!
  solveColumns(K, n, R, f)
  yield
  for (let a = 0; a < n; a++) {
    const row = feats.rows[train[a]!]!
    for (let q = 0; q < row.idx.length; q++) {
      const ia = row.idx[q]!
      const v = sw[a]! * row.val[q]!
      for (let c = 0; c < f; c++) W[ia * f + c]! += v * R[a * f + c]!
    }
  }
  return { weights: W, dims: d, f }
}

/** A X = R (A: n×n SPD, R: n×f satır öncelikli); sonuç R'ye yazılır. */
function solveColumns(A: Float64Array, n: number, R: Float64Array, f: number): void {
  // Tek ayrıştırma: ilk sütun solveSpd ile (tekillikte köşegen güçlendirilir), kalanlar aynı çarpanla.
  const col = new Float64Array(n)
  const L = Float64Array.from(A)
  for (let c = 0; c < n; c++) col[c] = R[c * f]!
  solveSpd(L, n, col)
  for (let c = 0; c < n; c++) R[c * f] = col[c]!
  for (let k = 1; k < f; k++) {
    for (let c = 0; c < n; c++) col[c] = R[c * f + k]!
    // L artık alt üçgende Cholesky çarpanını taşır
    choleskySolve(L, n, col)
    for (let c = 0; c < n; c++) R[c * f + k] = col[c]!
  }
}

/** Tüm başlıklar için içerikten tahmin edilen vektörler (başlık × f). */
export function predictContent(feats: ContentFeatures, tower: ContentTower): Float32Array {
  const f = tower.f
  const out = new Float32Array(feats.rows.length * f)
  const acc = new Float64Array(f)
  feats.rows.forEach((row, t) => {
    acc.fill(0)
    for (let q = 0; q < row.idx.length; q++) {
      const o = row.idx[q]! * f
      const v = row.val[q]!
      for (let c = 0; c < f; c++) acc[c]! += v * tower.weights[o + c]!
    }
    for (let c = 0; c < f; c++) out[t * f + c] = acc[c]!
  })
  return out
}

/** Az izlenen başlıkta içerik vektörüne güven: n / (n + k) iş birlikçi, k / (n + k) içerik. */
export const SHRINKAGE = 5

export function blend(cf: Float32Array, content: Float32Array, counts: ArrayLike<number>, f: number): Float32Array {
  const out = new Float32Array(cf.length)
  for (let t = 0; t < counts.length; t++) {
    const n = counts[t]!
    const a = n / (n + SHRINKAGE)
    for (let c = 0; c < f; c++) out[t * f + c] = a * cf[t * f + c]! + (1 - a) * content[t * f + c]!
  }
  return out
}
