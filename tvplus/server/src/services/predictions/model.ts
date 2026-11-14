/**
 * Eğitilmiş tahmin modeli: bellekteki biçim, istek anında izleyici vektörünün çözülmesi (fold-in), sıralayıcı
 * özellikleri ve kalıcılık (dataDir/models/prediction.bin + prediction.json).
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PredictionModelInfo, TrainRequest, ViewingSource } from '../../../../shared/intelligence'
import { cholesky, choleskySolve } from './linalg'
import { NF, type Ranker } from './ranker'

export const MODEL_FORMAT = 1
const DAY_MS = 86_400_000
/** Yenilik özelliğinin yarı ömür benzeri ölçeği */
export const RECENCY_DAYS = 60

/** Verinin ve içerik işaretlerinin parmak izi: "anlamlı değişiklik" kararı buna göre verilir. */
export interface Fingerprint {
  sources: ViewingSource[]
  interactions: number
  viewers: number
  engagementSum: number
  lastTs: number
  /** İçerik özelliklerinin (gömme, etiket, mikro tür, tür) özeti */
  content: string
  /** Zevk topluluğu çalıştırması (yoksa null) */
  audience: string | null
}

export interface PredictionModel {
  runId: string
  trainedAt: string
  params: Required<TrainRequest>
  f: number
  titleIds: number[]
  titleIndex: Map<number, number>
  /** Sunulan başlık vektörleri: iş birlikçi + içerik harmanı (başlık × f) */
  V: Float32Array
  /** İçerik kulesinin tahmin ettiği vektörler (başlık × f) */
  C: Float32Array
  /** Eğitimdeki etkileşim sayısı */
  counts: Float32Array
  /** log(1 + izleyen sayısı) */
  popularity: Float32Array
  /** Kataloğa eklenme anı (ms) */
  addedAt: Float64Array
  /** VᵀV + λI (fold-in için) */
  gram: Float64Array
  ranker: Ranker
  /** Üretim modelinin puanlarını sıralayıcının eğitildiği ölçeğe taşır: s' = s·a + b */
  adjust: { cf: [number, number]; content: [number, number] }
  /** Topluluk × başlık log kaldıraç (yoksa null) */
  communities: { ids: string[]; lift: Float32Array } | null
  contentSignals: PredictionModelInfo['contentSignals']
  sources: ViewingSource[]
  synthetic: boolean
  note: string
  fingerprint: Fingerprint
}

/* ───────────── istek anı hesapları ───────────── */

export interface FoldIn {
  x: Float64Array
  /** A = G + Σ α e y yᵀ'nin Cholesky çarpanı (açıklama için) */
  chol: Float64Array
  /** Geçmiş: başlık dizini, ilgi, güven */
  hist: { t: number; e: number; c: number }[]
}

/**
 * İzleyici vektörünü kendi özetlerinden çözer (ALS'nin izleyici adımının aynısı; yeniden eğitim gerekmez):
 *   (VᵀV + λI + Σ α·e·v vᵀ) x = Σ (1 + α·e) v
 */
export function foldIn(m: PredictionModel, history: { t: number; e: number }[]): FoldIn | null {
  if (history.length === 0) return null
  const f = m.f
  const A = Float64Array.from(m.gram)
  const b = new Float64Array(f)
  const alpha = m.params.alpha
  const hist: FoldIn['hist'] = []
  for (const { t, e } of history) {
    const o = t * f
    const w = alpha * e
    hist.push({ t, e, c: 1 + w })
    for (let a = 0; a < f; a++) {
      const va = m.V[o + a]!
      b[a]! += (1 + w) * va
      if (w === 0) continue
      const wa = w * va
      for (let c = 0; c <= a; c++) A[a * f + c]! += wa * m.V[o + c]!
    }
  }
  for (let a = 0; a < f; a++) for (let c = a + 1; c < f; c++) A[a * f + c] = A[c * f + a]!
  if (!cholesky(A, f)) return null
  choleskySolve(A, f, b)
  return { x: b, chol: A, hist }
}

export function rowDot(x: ArrayLike<number>, M: Float32Array, t: number, f: number): number {
  let s = 0
  const o = t * f
  for (let c = 0; c < f; c++) s += x[c]! * M[o + c]!
  return s
}

export function recencyOf(addedAt: number, now: number): number {
  if (!Number.isFinite(addedAt)) return 0
  return Math.exp(-Math.max(0, now - addedAt) / (RECENCY_DAYS * DAY_MS))
}

export interface FeatureContext {
  x: ArrayLike<number> | null
  now: number
  /** Topluluk satırı (m.communities.lift içindeki başlangıç) ya da −1 */
  communityRow: number
  inProgress: (t: number) => boolean
  inList: (t: number) => boolean
}

/** Sıralayıcı özelliklerini `out[o..o+NF)` içine yazar (sıra: RANKER_FEATURES). */
export function features(m: PredictionModel, t: number, ctx: FeatureContext, out: Float64Array, o = 0): void {
  const f = m.f
  out[o] = ctx.x ? rowDot(ctx.x, m.V, t, f) * m.adjust.cf[0] + m.adjust.cf[1] : m.ranker.mean[0]!
  out[o + 1] = ctx.x ? rowDot(ctx.x, m.C, t, f) * m.adjust.content[0] + m.adjust.content[1] : m.ranker.mean[1]!
  out[o + 2] = m.popularity[t]!
  out[o + 3] = recencyOf(m.addedAt[t]!, ctx.now)
  out[o + 4] =
    ctx.communityRow >= 0 && m.communities ? m.communities.lift[ctx.communityRow * m.titleIds.length + t]! : 0
  out[o + 5] = ctx.inProgress(t) ? 1 : 0
  out[o + 6] = ctx.inList(t) ? 1 : 0
}

/**
 * İzleyicinin topluluk satırı, modelin kendi kaldıraç tablosundan: geçmişindeki başlıkların ilgi ağırlıklı ortalama
 * kaldıracı en yüksek topluluk (hiçbiri pozitif değilse −1). Eğitimde (kesit öncesi geçmişle) ve sunumda aynı hesap;
 * zevk toplulukları servisi yeniden hesaplayıp numaraları değiştirse de model tutarlı kalır.
 */
export function nearestCommunity(
  lift: Float32Array | null,
  k: number,
  T: number,
  history: { t: number; e: number }[],
): number {
  if (!lift || k === 0 || history.length === 0) return -1
  let best = -1
  let bestScore = 0
  for (let c = 0; c < k; c++) {
    let s = 0
    for (const h of history) s += h.e * lift[c * T + h.t]!
    if (s > bestScore + 1e-12) {
      bestScore = s
      best = c
    }
  }
  return best
}

/**
 * İş birlikçi puanın izlenen başlıklara ayrıştırılması: s = vᵢᵀ A⁻¹ b = Σⱼ cⱼ · (A⁻¹ vᵢ)ᵀ vⱼ  (tam eşitlik).
 * Dönen katkılar toplamı ham iş birlikçi puana eşittir.
 */
export function contributions(m: PredictionModel, fi: FoldIn, t: number): { t: number; weight: number }[] {
  const f = m.f
  const w = new Float64Array(f)
  for (let c = 0; c < f; c++) w[c] = m.V[t * f + c]!
  choleskySolve(fi.chol, f, w)
  return fi.hist.map((h) => ({ t: h.t, weight: h.c * rowDot(w, m.V, h.t, f) }))
}

/* ───────────── kalıcılık ───────────── */

interface Persisted {
  format: number
  runId: string
  trainedAt: string
  params: Required<TrainRequest>
  f: number
  titleIds: number[]
  ranker: Ranker
  adjust: PredictionModel['adjust']
  communityIds: string[] | null
  contentSignals: PredictionModelInfo['contentSignals']
  sources: ViewingSource[]
  synthetic: boolean
  note: string
  fingerprint: Fingerprint
  /** İkili dosyadaki diziler: ad → [bayt başlangıcı, öğe sayısı, tür] */
  arrays: Record<string, [number, number, 'f32' | 'f64']>
  sha1: string
}

const BIN = 'prediction.bin'
const META = 'prediction.json'

export function saveModel(dir: string, m: PredictionModel): void {
  mkdirSync(dir, { recursive: true })
  const parts: [string, Float32Array | Float64Array][] = [
    ['V', m.V],
    ['C', m.C],
    ['counts', m.counts],
    ['popularity', m.popularity],
    ['addedAt', m.addedAt],
    ['gram', m.gram],
  ]
  if (m.communities) parts.push(['lift', m.communities.lift])
  const arrays: Persisted['arrays'] = {}
  let off = 0
  const bufs: Buffer[] = []
  for (const [name, arr] of parts) {
    // 8 bayt hizası (Float64Array görünümü için)
    const pad = (8 - (off % 8)) % 8
    if (pad) {
      bufs.push(Buffer.alloc(pad))
      off += pad
    }
    arrays[name] = [off, arr.length, arr instanceof Float64Array ? 'f64' : 'f32']
    const b = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength)
    bufs.push(b)
    off += b.byteLength
  }
  const bin = Buffer.concat(bufs)
  const meta: Persisted = {
    format: MODEL_FORMAT,
    runId: m.runId,
    trainedAt: m.trainedAt,
    params: m.params,
    f: m.f,
    titleIds: m.titleIds,
    ranker: m.ranker,
    adjust: m.adjust,
    communityIds: m.communities?.ids ?? null,
    contentSignals: m.contentSignals,
    sources: m.sources,
    synthetic: m.synthetic,
    note: m.note,
    fingerprint: m.fingerprint,
    arrays,
    sha1: createHash('sha1').update(bin).digest('hex'),
  }
  // Önce ikili, sonra üst veri (üst veri ikilinin özetini taşır; yarım yazım yüklenmez)
  const tmpBin = join(dir, `${BIN}.${process.pid}.tmp`)
  writeFileSync(tmpBin, bin)
  renameSync(tmpBin, join(dir, BIN))
  const tmpMeta = join(dir, `${META}.${process.pid}.tmp`)
  writeFileSync(tmpMeta, JSON.stringify(meta))
  renameSync(tmpMeta, join(dir, META))
}

export function loadModel(dir: string): PredictionModel | null {
  const metaFile = join(dir, META)
  const binFile = join(dir, BIN)
  if (!existsSync(metaFile) || !existsSync(binFile)) return null
  const meta = JSON.parse(readFileSync(metaFile, 'utf8')) as Persisted
  if (meta.format !== MODEL_FORMAT) return null
  const bin = readFileSync(binFile)
  if (createHash('sha1').update(bin).digest('hex') !== meta.sha1) return null
  const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)
  const get = (name: string): Float32Array | Float64Array | null => {
    const a = meta.arrays[name]
    if (!a) return null
    const [off, len, kind] = a
    return kind === 'f64' ? new Float64Array(ab, off, len) : new Float32Array(ab, off, len)
  }
  const f32 = (name: string) => {
    const a = get(name)
    if (!(a instanceof Float32Array)) throw new Error(`model dosyası bozuk: ${name}`)
    return a
  }
  const f64 = (name: string) => {
    const a = get(name)
    if (!(a instanceof Float64Array)) throw new Error(`model dosyası bozuk: ${name}`)
    return a
  }
  const T = meta.titleIds.length
  const V = f32('V')
  if (V.length !== T * meta.f || meta.ranker.weights.length !== NF) return null
  const lift = get('lift')
  return {
    runId: meta.runId,
    trainedAt: meta.trainedAt,
    params: meta.params,
    f: meta.f,
    titleIds: meta.titleIds,
    titleIndex: new Map(meta.titleIds.map((t, k) => [t, k])),
    V,
    C: f32('C'),
    counts: f32('counts'),
    popularity: f32('popularity'),
    addedAt: f64('addedAt'),
    gram: f64('gram'),
    ranker: meta.ranker,
    adjust: meta.adjust,
    communities: meta.communityIds && lift instanceof Float32Array ? { ids: meta.communityIds, lift } : null,
    contentSignals: meta.contentSignals,
    sources: meta.sources,
    synthetic: meta.synthetic,
    note: meta.note,
    fingerprint: meta.fingerprint,
  }
}
