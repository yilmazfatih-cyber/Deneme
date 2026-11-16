/**
 * Churn etkenleri: tek değişkenli tablo (dilim → churn oranı, bilgi değeri), çok değişkenli lojistik model
 * (diğer etkenler sabitken etki), ağaç modeli (doğrusal olmayan etki ve etkileşim; permütasyon önemi) ve
 * risk puanı. Soru: "kim risk altında ve hangi işaretler bunu haber veriyor?"
 *
 * Yorum sınırı: hepsi İLİŞKİSELDİR ve işaretlerin çoğu SONUÇTUR, neden değil (son etkinlikten beri geçen gün uzadıysa
 * kullanıcı zaten gitmektedir). "Neden gidiyorlar" sorusunun yanıtı triggers.ts'teki eşleştirilmiş karşılaştırma ve
 * neden dağılımıdır; kesin nedensellik simülasyon / gerçek A/B deneyiyle ölçülür.
 */
import type { ChurnModel, DriverRow, FeatureBin, ModelQuality, ReasonFamily } from '../../../shared/lab'
import { dayStr, num } from '../core/format'
import { gbdtFit, gbdtPredict, permutationImportance } from '../core/gbdt'
import { mulberry32, sampleIndices } from '../core/rng'
import {
  auc,
  calibration,
  liftAt,
  logistic,
  logisticPredict,
  logLoss,
  quantileSorted,
  sortedCopy,
  wilson,
} from '../core/stats'
import { FEATURES, type FeatureFrame } from './features'

/* ───────────── Tek değişkenli ───────────── */

function ivOf(bins: readonly { n: number; churned: number }[]): number {
  let pos = 0
  let neg = 0
  for (const b of bins) {
    pos += b.churned
    neg += b.n - b.churned
  }
  if (pos === 0 || neg === 0) return 0
  let iv = 0
  for (const b of bins) {
    const p = (b.churned + 0.5) / (pos + 0.5 * bins.length)
    const q = (b.n - b.churned + 0.5) / (neg + 0.5 * bins.length)
    iv += (p - q) * Math.log(p / q)
  }
  return iv
}

function toBin(label: string, n: number, churned: number): FeatureBin {
  const w = wilson(churned, n)
  return { label, n, churned, rate: n ? churned / n : 0, lo: w.lo, hi: w.hi }
}

/** Sayısal özelliği dilimler: çok sıfır varsa sıfır ayrı dilim; kalanı yüzdeliklere göre en çok 4 dilim. */
function numericBins(values: Float32Array, y: Uint8Array, flag: boolean): FeatureBin[] {
  const n = values.length
  if (flag) {
    const c = [0, 0, 0, 0]
    for (let i = 0; i < n; i++) {
      const k = values[i] > 0 ? 1 : 0
      c[k * 2]++
      c[k * 2 + 1] += y[i]
    }
    return [toBin('hayır', c[0], c[1]), toBin('evet', c[2], c[3])].filter((b) => b.n > 0)
  }
  let zeros = 0
  for (let i = 0; i < n; i++) if (values[i] === 0) zeros++
  const zeroBin = zeros >= n * 0.2
  const rest = zeroBin ? Float32Array.from(values).filter((v) => v !== 0) : values
  const sorted = sortedCopy(rest)
  const edges: number[] = []
  const parts = zeroBin ? 4 : 5
  for (let k = 1; k < parts; k++) {
    const e = quantileSorted(sorted, k / parts)
    if (!edges.length || e > edges[edges.length - 1]) edges.push(e)
  }
  // Dilim: (kenar[i−1], kenar[i]]
  const m = edges.length + 1
  const cn = new Float64Array(m + 1)
  const cc = new Float64Array(m + 1)
  for (let i = 0; i < n; i++) {
    const v = values[i]
    let b: number
    if (zeroBin && v === 0) b = m
    else {
      b = 0
      while (b < edges.length && v > edges[b]) b++
    }
    cn[b]++
    cc[b] += y[i]
  }
  const lo = sorted.length ? sorted[0] : 0
  const hi = sorted.length ? sorted[sorted.length - 1] : 0
  const out: FeatureBin[] = []
  if (zeroBin) out.push(toBin('0', cn[m], cc[m]))
  for (let b = 0; b < m; b++) {
    if (cn[b] === 0) continue
    const from = b === 0 ? lo : edges[b - 1]
    const to = b === m - 1 ? hi : edges[b]
    const label = b === 0 ? `≤ ${num(to)}` : b === m - 1 ? `> ${num(from)}` : `${num(from)}–${num(to)}`
    out.push(toBin(label, cn[b], cc[b]))
  }
  return out
}

function monotone(bins: readonly FeatureBin[]): 1 | -1 | 0 {
  const big = bins.filter((b) => b.n >= 30)
  if (big.length < 2) return 0
  let up = 0
  let down = 0
  for (let i = 1; i < big.length; i++) {
    if (big[i].rate > big[i - 1].rate) up++
    else if (big[i].rate < big[i - 1].rate) down++
  }
  return down === 0 && up > 0 ? 1 : up === 0 && down > 0 ? -1 : 0
}

/** Tek değişkenli etken tablosu (sayısal + kategorik). `minBin`: bundan küçük dilimler 'diğer'e katılır. */
export function univariate(frame: FeatureFrame, minBin: number): DriverRow[] {
  const P = FEATURES.length
  const n = frame.rows
  let pos = 0
  for (let i = 0; i < n; i++) pos += frame.y[i]
  const base = n ? pos / n : 0
  const out: DriverRow[] = []
  const col = new Float32Array(n)
  FEATURES.forEach((f, j) => {
    for (let i = 0; i < n; i++) col[i] = frame.X[i * P + j]
    let bins = numericBins(col, frame.y, f.transform === 'flag')
    bins = bins.filter((b) => b.n >= minBin)
    const a = auc(col, frame.y)
    const mono = monotone(bins)
    const strong = Math.abs(a - 0.5) >= 0.03
    const worst = bins.reduce<FeatureBin | null>((w, b) => (!w || b.rate > w.rate ? b : w), null)
    out.push({
      feature: f.key,
      label: f.label,
      family: f.family,
      kind: 'sayı',
      iv: ivOf(bins),
      auc: Number.isFinite(a) ? Math.max(a, 1 - a) : 0.5,
      direction:
        !Number.isFinite(a) || bins.length < 2
          ? '-'
          : !strong && mono === 0
            ? 'karışık'
            : a >= 0.5
              ? 'artınca artar'
              : 'artınca azalır',
      bins,
      worst: worst
        ? { label: worst.label, rate: worst.rate, lift: base > 0 ? worst.rate / base : 0, n: worst.n }
        : { label: '-', rate: 0, lift: 0, n: 0 },
      coef: null,
      oddsRatio: null,
      orLo: null,
      orHi: null,
      p: null,
      importance: null,
    })
  })
  for (const c of frame.cats) {
    const cn = new Float64Array(c.dict.length)
    const cc = new Float64Array(c.dict.length)
    for (let i = 0; i < n; i++) {
      cn[c.codes[i]]++
      cc[c.codes[i]] += frame.y[i]
    }
    const order = [...cn.keys()].filter((k) => cn[k] > 0).sort((a, b) => cn[b] - cn[a])
    const bins: FeatureBin[] = []
    let on = 0
    let oc = 0
    order.forEach((k, rank) => {
      if (cn[k] >= minBin && rank < 14) bins.push(toBin(c.dict[k] ?? String(k), cn[k], cc[k]))
      else {
        on += cn[k]
        oc += cc[k]
      }
    })
    if (on >= minBin) bins.push(toBin('diğer', on, oc))
    if (bins.length < 2) continue
    // Kategorinin kendi oranıyla puanlama (örneklem içi; yalnız sıralama gücü için)
    const rate = new Float64Array(c.dict.length)
    for (const k of order) rate[k] = cn[k] >= minBin ? cc[k] / cn[k] : base
    const score = new Float64Array(n)
    for (let i = 0; i < n; i++) score[i] = rate[c.codes[i]]
    const a = auc(score, frame.y)
    const worst = bins
      .filter((b) => b.label !== 'diğer')
      .reduce<FeatureBin | null>((w, b) => (!w || b.rate > w.rate ? b : w), null)
    out.push({
      feature: c.key,
      label: c.label,
      family: c.family,
      kind: 'kategori',
      iv: ivOf(bins),
      auc: Number.isFinite(a) ? Math.max(a, 1 - a) : 0.5,
      direction: '-',
      bins,
      worst: worst
        ? { label: worst.label, rate: worst.rate, lift: base > 0 ? worst.rate / base : 0, n: worst.n }
        : { label: '-', rate: 0, lift: 0, n: 0 },
      coef: null,
      oddsRatio: null,
      orLo: null,
      orHi: null,
      p: null,
      importance: null,
    })
  }
  return out
}

/* ───────────── Tasarım matrisi ───────────── */

export interface DesignColumn {
  name: string
  family: ReasonFamily
  /** FEATURES dizini (sayısal) ya da −1 (kategori kuklası) */
  feature: number
  /** Kategori kuklası: hangi kategorik özellik ve hangi kod */
  cat: number
  code: number
  mean: number
  sd: number
  lo: number
  hi: number
}

export interface Design {
  cols: DesignColumn[]
  /** Dönüştürülmüş ve ölçeklenmiş: rows × cols.length */
  Z: Float32Array
  q: number
}

const transformValue = (v: number, t: 'log' | 'flag' | 'none'): number =>
  t === 'log' ? Math.log1p(Math.max(0, v)) : t === 'flag' ? (v > 0 ? 1 : 0) : v

/**
 * Tasarım matrisi: sayısal özellikler dönüştürülür (log1p), eğitim satırlarının %1–%99 aralığına kırpılır ve
 * standartlaştırılır; bayraklar 0/1 kalır; kategorik özellikler kukla sütunlara açılır (en sık kategori başvurudur).
 */
export function buildDesign(frame: FeatureFrame, train: Uint8Array): Design {
  const P = FEATURES.length
  const n = frame.rows
  const cols: DesignColumn[] = []
  const tmp: number[] = []
  FEATURES.forEach((f, j) => {
    tmp.length = 0
    for (let i = 0; i < n; i++) if (train[i]) tmp.push(transformValue(frame.X[i * P + j], f.transform))
    if (f.transform === 'flag') {
      cols.push({ name: f.key, family: f.family, feature: j, cat: -1, code: 0, mean: 0, sd: 1, lo: 0, hi: 1 })
      return
    }
    const sorted = sortedCopy(tmp)
    const lo = quantileSorted(sorted, 0.01)
    const hi = quantileSorted(sorted, 0.99)
    let s = 0
    let s2 = 0
    for (const v of tmp) {
      const c = v < lo ? lo : v > hi ? hi : v
      s += c
      s2 += c * c
    }
    const m = tmp.length ? s / tmp.length : 0
    const sd = tmp.length > 1 ? Math.sqrt(Math.max(0, s2 / tmp.length - m * m)) : 0
    // Değişmeyen sütun modele girmez
    if (sd > 1e-9) cols.push({ name: f.key, family: f.family, feature: j, cat: -1, code: 0, mean: m, sd, lo, hi })
  })
  frame.cats.forEach((c, ci) => {
    const cn = new Float64Array(c.dict.length)
    let total = 0
    for (let i = 0; i < n; i++) {
      if (!train[i]) continue
      cn[c.codes[i]]++
      total++
    }
    const order = [...cn.keys()].filter((k) => cn[k] > 0).sort((a, b) => cn[b] - cn[a])
    // En sık kategori başvuru; 'bilinmiyor' (kod 0) kukla olmaz
    order
      .slice(1)
      .filter((k) => k !== 0 && cn[k] >= Math.max(50, total * 0.02))
      .slice(0, 8)
      .forEach((k) => {
        cols.push({
          name: `${c.key}=${c.dict[k] ?? k}`,
          family: c.family,
          feature: -1,
          cat: ci,
          code: k,
          mean: 0,
          sd: 1,
          lo: 0,
          hi: 1,
        })
      })
  })
  const q = cols.length
  const Z = new Float32Array(n * q)
  for (let c = 0; c < q; c++) {
    const col = cols[c]
    if (col.feature >= 0) {
      const t = FEATURES[col.feature].transform
      for (let i = 0; i < n; i++) {
        let v = transformValue(frame.X[i * P + col.feature], t)
        if (t !== 'flag') {
          v = v < col.lo ? col.lo : v > col.hi ? col.hi : v
          v = (v - col.mean) / col.sd
        }
        Z[i * q + c] = v
      }
    } else {
      const codes = frame.cats[col.cat].codes
      for (let i = 0; i < n; i++) Z[i * q + c] = codes[i] === col.code ? 1 : 0
    }
  }
  return { cols, Z, q }
}

function subset(
  Z: Float32Array,
  q: number,
  mask: Uint8Array,
  y: Uint8Array,
): { X: Float32Array; y: Uint8Array; n: number } {
  let n = 0
  for (let i = 0; i < mask.length; i++) if (mask[i]) n++
  const X = new Float32Array(n * q)
  const yy = new Uint8Array(n)
  let r = 0
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue
    X.set(Z.subarray(i * q, (i + 1) * q), r * q)
    yy[r++] = y[i]
  }
  return { X, y: yy, n }
}

const qualityOf = (p: ArrayLike<number>, y: ArrayLike<number>): ModelQuality => ({
  auc: auc(p, y),
  lift10: liftAt(p, y, 0.1).lift,
  logLoss: logLoss(p, y),
})

export interface FittedModel {
  result: ChurnModel
  design: Design
  /** [kesişim, …] */
  coef: Float64Array
  train: Uint8Array
  test: Uint8Array
  /** Tüm satırlar için lojistik model olasılığı */
  prob: Float64Array
}

/**
 * Modeli kurar: en yeni anlık görüntü sınama, öncekiler eğitim (tek anlık görüntü varsa kullanıcıya göre %70/%30).
 * `minBin` tek değişkenli tablolardaki en küçük dilimdir (k-anonimlik).
 */
export function fitChurnModel(
  frame: FeatureFrame,
  opts: { minBin: number; gbdt?: boolean; seed?: number },
): FittedModel {
  const n = frame.rows
  const train = new Uint8Array(n)
  const test = new Uint8Array(n)
  const snaps = frame.snapshots
  if (snaps.length >= 2) {
    const last = snaps[snaps.length - 1]
    for (let i = 0; i < n; i++) (frame.snap[i] === last ? test : train)[i] = 1
  } else {
    const rng = mulberry32(opts.seed ?? 5)
    // Kullanıcı bazlı ayrım (aynı kullanıcı iki yanda olmasın)
    const side = new Map<number, number>()
    for (let i = 0; i < n; i++) {
      let s = side.get(frame.uid[i])
      if (s === undefined) {
        s = rng() < 0.7 ? 1 : 0
        side.set(frame.uid[i], s)
      }
      ;(s ? train : test)[i] = 1
    }
  }
  const design = buildDesign(frame, train)
  const q = design.q
  const tr = subset(design.Z, q, train, frame.y)
  const te = subset(design.Z, q, test, frame.y)
  const fit = logistic(tr.X, tr.y, tr.n, q, { l2: 1 })
  const prob = logisticPredict(fit.coef, design.Z, n, q)
  const pTest = logisticPredict(fit.coef, te.X, te.n, q)
  const quality = qualityOf(pTest, te.y)

  /* ── Ağaç modeli (ham değerlerle) ── */
  let gb: ModelQuality | null = null
  const importance = new Float64Array(q)
  if (opts.gbdt !== false && tr.n >= 400 && te.n >= 100) {
    const cap = 120_000
    const rng = mulberry32(opts.seed ?? 5)
    const pickTr = sampleIndices(rng, tr.n, Math.min(tr.n, cap))
    const colsTr: Float32Array[] = []
    const colsTe: Float32Array[] = []
    for (let c = 0; c < q; c++) {
      const a = new Float32Array(pickTr.length)
      for (let i = 0; i < pickTr.length; i++) a[i] = tr.X[pickTr[i] * q + c]
      colsTr.push(a)
      const b = new Float32Array(te.n)
      for (let i = 0; i < te.n; i++) b[i] = te.X[i * q + c]
      colsTe.push(b)
    }
    const yTr = new Uint8Array(pickTr.length)
    for (let i = 0; i < pickTr.length; i++) yTr[i] = tr.y[pickTr[i]]
    const model = gbdtFit(colsTr, yTr, { trees: 120, depth: 3, learningRate: 0.1, seed: opts.seed ?? 5 })
    gb = qualityOf(gbdtPredict(model, colsTe), te.y)
    // Permütasyon önemi (sınama kümesinin örnekleminde)
    const pickTe = sampleIndices(rng, te.n, Math.min(te.n, 20_000))
    const colsImp = colsTe.map((c) => {
      const a = new Float32Array(pickTe.length)
      for (let i = 0; i < pickTe.length; i++) a[i] = c[pickTe[i]]
      return a
    })
    const yImp = new Uint8Array(pickTe.length)
    for (let i = 0; i < pickTe.length; i++) yImp[i] = te.y[pickTe[i]]
    importance.set(permutationImportance(model, colsImp, yImp, 17).drop)
  }

  /* ── Etken tablosu: tek değişkenli + çok değişkenli ── */
  const rows = univariate(frame, opts.minBin)
  const byKey = new Map(rows.map((r) => [r.feature, r]))
  design.cols.forEach((c, k) => {
    const key = c.feature >= 0 ? FEATURES[c.feature].key : frame.cats[c.cat].key
    const row = byKey.get(key)
    if (!row) return
    const b = fit.coef[k + 1]
    const se = fit.se[k + 1]
    if (c.feature >= 0) {
      row.coef = b
      row.oddsRatio = Math.exp(b)
      row.orLo = Math.exp(b - 1.96 * se)
      row.orHi = Math.exp(b + 1.96 * se)
      row.p = fit.p[k + 1]
      row.importance = gb ? importance[k] : null
    } else if (gb) row.importance = (row.importance ?? 0) + importance[k]
  })
  rows.sort((a, b) => b.iv - a.iv)

  let pos = 0
  for (let i = 0; i < n; i++) pos += frame.y[i]
  const result: ChurnModel = {
    snapshots: snaps.map((day) => {
      let c = 0
      let ch = 0
      for (let i = 0; i < n; i++) {
        if (frame.snap[i] !== day) continue
        c++
        ch += frame.y[i]
      }
      return {
        day: dayStr(day),
        n: c,
        churnRate: c ? ch / c : 0,
        role: snaps.length >= 2 && day === snaps[snaps.length - 1] ? ('sınama' as const) : ('eğitim' as const),
      }
    }),
    rows: n,
    churnRate: n ? pos / n : 0,
    lookback: frame.lookback,
    logistic: quality,
    gbdt: gb,
    calibration: calibration(pTest, te.y, 10),
    drivers: rows,
  }
  return { result, design, coef: fit.coef, train, test, prob }
}
