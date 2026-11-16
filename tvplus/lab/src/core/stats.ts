/**
 * İstatistik çekirdeği: özel işlevler, dağılımlar, özetler, güven aralıkları ve sınamalar.
 * Dış bağımlılık yoktur; değerler lab/test/stats.test.ts içinde bilinen başvuru değerleriyle sınanır.
 */

/* ───────────── Özel işlevler ───────────── */

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
]

/** ln Γ(x), x > 0 (Lanczos, g = 7). */
export function lgamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x)
  x -= 1
  let a = LANCZOS[0]
  const t = x + 7.5
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (x + i)
  return 0.9189385332046727 + (x + 0.5) * Math.log(t) - t + Math.log(a)
}

const EPS = 1e-15
const FPMIN = 1e-300

/** Düzenlenmiş alt eksik gama P(a, x). */
export function gammaP(a: number, x: number): number {
  if (x <= 0) return 0
  if (x < a + 1) return gammaSeries(a, x)
  return 1 - gammaCf(a, x)
}
/** Düzenlenmiş üst eksik gama Q(a, x) = 1 − P(a, x) (kuyrukta duyarlılığı korur). */
export function gammaQ(a: number, x: number): number {
  if (x <= 0) return 1
  if (x < a + 1) return 1 - gammaSeries(a, x)
  return gammaCf(a, x)
}
function gammaSeries(a: number, x: number): number {
  let ap = a
  let sum = 1 / a
  let del = sum
  for (let n = 0; n < 1000; n++) {
    ap += 1
    del *= x / ap
    sum += del
    if (Math.abs(del) < Math.abs(sum) * EPS) break
  }
  return sum * Math.exp(-x + a * Math.log(x) - lgamma(a))
}
function gammaCf(a: number, x: number): number {
  let b = x + 1 - a
  let c = 1 / FPMIN
  let d = 1 / b
  let h = d
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a)
    b += 2
    d = an * d + b
    if (Math.abs(d) < FPMIN) d = FPMIN
    c = b + an / c
    if (Math.abs(c) < FPMIN) c = FPMIN
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < EPS) break
  }
  return Math.exp(-x + a * Math.log(x) - lgamma(a)) * h
}

export function erf(x: number): number {
  return x >= 0 ? gammaP(0.5, x * x) : -gammaP(0.5, x * x)
}
export function erfc(x: number): number {
  return x >= 0 ? gammaQ(0.5, x * x) : 1 + gammaP(0.5, x * x)
}

/** Düzenlenmiş eksik beta I_x(a, b). */
export function betaInc(a: number, b: number, x: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x))
  if (x < (a + 1) / (a + b + 2)) return (bt * betaCf(a, b, x)) / a
  return 1 - (bt * betaCf(b, a, 1 - x)) / b
}
function betaCf(a: number, b: number, x: number): number {
  const qab = a + b
  const qap = a + 1
  const qam = a - 1
  let c = 1
  let d = 1 - (qab * x) / qap
  if (Math.abs(d) < FPMIN) d = FPMIN
  d = 1 / d
  let h = d
  for (let m = 1; m < 1000; m++) {
    const m2 = 2 * m
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2))
    d = 1 + aa * d
    if (Math.abs(d) < FPMIN) d = FPMIN
    c = 1 + aa / c
    if (Math.abs(c) < FPMIN) c = FPMIN
    d = 1 / d
    h *= d * c
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2))
    d = 1 + aa * d
    if (Math.abs(d) < FPMIN) d = FPMIN
    c = 1 + aa / c
    if (Math.abs(c) < FPMIN) c = FPMIN
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < EPS) break
  }
  return h
}

/* ───────────── Dağılımlar ───────────── */

export const normPdf = (z: number): number => Math.exp(-0.5 * z * z) / 2.5066282746310002
export const normCdf = (z: number): number => 0.5 * erfc(-z / Math.SQRT2)
/** Üst kuyruk 1 − Φ(z) (büyük z'de duyarlı). */
export const normSf = (z: number): number => 0.5 * erfc(z / Math.SQRT2)

/** Φ⁻¹(p) — Acklam yaklaşıklığı + bir Halley adımı. */
export function normInv(p: number): number {
  if (!(p > 0)) return -Infinity
  if (!(p < 1)) return Infinity
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1,
    2.506628277459239,
  ]
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1]
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968,
    2.938163982698783,
  ]
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416]
  const pl = 0.02425
  let x: number
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p))
    x =
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  } else if (p <= 1 - pl) {
    const q = p - 0.5
    const r = q * q
    x =
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p))
    x =
      -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  const e = p < 0.5 ? normCdf(x) - p : -(normSf(x) - (1 - p))
  const u = e * 2.5066282746310002 * Math.exp(0.5 * x * x)
  return x - u / (1 + 0.5 * x * u)
}

/** Student t birikimli dağılımı. */
export function tCdf(t: number, df: number): number {
  if (!Number.isFinite(t)) return t > 0 ? 1 : 0
  const p = 0.5 * betaInc(df / 2, 0.5, df / (df + t * t))
  return t > 0 ? 1 - p : p
}
/** İki yönlü p değeri: P(|T| ≥ |t|). */
export const tTwoSided = (t: number, df: number): number =>
  Number.isFinite(t) ? betaInc(df / 2, 0.5, df / (df + t * t)) : 0
/** t dağılımının p. yüzdeliği (ikiye bölme). */
export function tInv(p: number, df: number): number {
  if (df > 1e6) return normInv(p)
  if (p === 0.5) return 0
  let lo = -1
  let hi = 1
  while (tCdf(lo, df) > p) lo *= 2
  while (tCdf(hi, df) < p) hi *= 2
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi)
    if (tCdf(mid, df) < p) lo = mid
    else hi = mid
    if (hi - lo < 1e-12 * Math.max(1, Math.abs(mid))) break
  }
  return 0.5 * (lo + hi)
}

/** Ki-kare üst kuyruk olasılığı P(X ≥ x), k serbestlik derecesi. */
export const chi2Sf = (x: number, k: number): number => (x <= 0 ? 1 : gammaQ(k / 2, x / 2))

/* ───────────── Özetler ───────────── */

export function mean(xs: ArrayLike<number>): number {
  let s = 0
  for (let i = 0; i < xs.length; i++) s += xs[i]
  return xs.length ? s / xs.length : NaN
}
/** Örneklem varyansı (n − 1). */
export function variance(xs: ArrayLike<number>, m = mean(xs)): number {
  if (xs.length < 2) return 0
  let s = 0
  for (let i = 0; i < xs.length; i++) s += (xs[i] - m) * (xs[i] - m)
  return s / (xs.length - 1)
}
export const sd = (xs: ArrayLike<number>): number => Math.sqrt(variance(xs))

export interface Moments {
  n: number
  mean: number
  var: number
}
export function moments(xs: ArrayLike<number>): Moments {
  const m = mean(xs)
  return { n: xs.length, mean: m, var: variance(xs, m) }
}

/** Sıralı diziden yüzdelik (doğrusal ara değer; R tip 7). */
export function quantileSorted(sorted: ArrayLike<number>, q: number): number {
  const n = sorted.length
  if (n === 0) return NaN
  if (n === 1) return sorted[0]
  const h = (n - 1) * Math.min(1, Math.max(0, q))
  const lo = Math.floor(h)
  const hi = Math.min(n - 1, lo + 1)
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo])
}
/** Kopyalayıp sıralar; NaN'lar atılır. */
export function sortedCopy(xs: ArrayLike<number>): Float64Array {
  let n = 0
  const out = new Float64Array(xs.length)
  for (let i = 0; i < xs.length; i++) {
    const v = xs[i]
    if (v === v) out[n++] = v
  }
  return out.subarray(0, n).sort()
}
export const quantile = (xs: ArrayLike<number>, q: number): number => quantileSorted(sortedCopy(xs), q)
export function quantiles(xs: ArrayLike<number>, qs: readonly number[]): number[] {
  const s = sortedCopy(xs)
  return qs.map((q) => quantileSorted(s, q))
}
export const median = (xs: ArrayLike<number>): number => quantile(xs, 0.5)

export function pearson(x: ArrayLike<number>, y: ArrayLike<number>): number {
  const n = Math.min(x.length, y.length)
  if (n < 2) return NaN
  const mx = mean(x)
  const my = mean(y)
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx
    const dy = y[i] - my
    sxy += dx * dy
    sxx += dx * dx
    syy += dy * dy
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0
}

/* ───────────── Güven aralıkları ve sınamalar ───────────── */

export interface Interval {
  lo: number
  hi: number
}

/** Oran için Wilson aralığı. */
export function wilson(k: number, n: number, conf = 0.95): Interval & { p: number } {
  if (n <= 0) return { p: NaN, lo: 0, hi: 1 }
  const z = normInv(1 - (1 - conf) / 2)
  const p = k / n
  const z2 = z * z
  const den = 1 + z2 / n
  const centre = (p + z2 / (2 * n)) / den
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / den
  return { p, lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) }
}

export interface TestResult {
  /** Fark: b − a */
  diff: number
  se: number
  stat: number
  df: number | null
  /** İki yönlü p */
  p: number
  lo: number
  hi: number
}

/** Welch t sınaması (eşit olmayan varyans), özetlerden. Fark = b − a. */
export function welch(a: Moments, b: Moments, conf = 0.95): TestResult {
  const va = a.var / a.n
  const vb = b.var / b.n
  const se = Math.sqrt(va + vb)
  const diff = b.mean - a.mean
  // Bilgi yok (boş kol ya da tek gözlem: varyans bilinemez) → anlamlı sonuç üretilmez
  if (a.n < 2 || b.n < 2 || !Number.isFinite(diff) || !Number.isFinite(se))
    return { diff, se: NaN, stat: 0, df: null, p: 1, lo: NaN, hi: NaN }
  if (!(se > 0)) return { diff, se: 0, stat: 0, df: null, p: diff === 0 ? 1 : 0, lo: diff, hi: diff }
  const df = ((va + vb) * (va + vb)) / ((va * va) / Math.max(1, a.n - 1) + (vb * vb) / Math.max(1, b.n - 1))
  const stat = diff / se
  const q = tInv(1 - (1 - conf) / 2, df)
  return { diff, se, stat, df, p: tTwoSided(stat, df), lo: diff - q * se, hi: diff + q * se }
}

/** İki oran: sınama havuzlanmış varyansla, aralık havuzlanmamış varyansla. Fark = b − a. */
export function twoProportion(ka: number, na: number, kb: number, nb: number, conf = 0.95): TestResult {
  const pa = ka / na
  const pb = kb / nb
  const diff = pb - pa
  const pool = (ka + kb) / (na + nb)
  const sePool = Math.sqrt(pool * (1 - pool) * (1 / na + 1 / nb))
  const se = Math.sqrt((pa * (1 - pa)) / na + (pb * (1 - pb)) / nb)
  const stat = sePool > 0 ? diff / sePool : 0
  const z = normInv(1 - (1 - conf) / 2)
  return {
    diff,
    se,
    stat,
    df: null,
    p: sePool > 0 ? 2 * normSf(Math.abs(stat)) : 1,
    lo: diff - z * se,
    hi: diff + z * se,
  }
}

/** Uyum iyiliği ki-kare (ör. örneklem oranı uyuşmazlığı — SRM). */
export function chi2Gof(
  observed: readonly number[],
  expected: readonly number[],
): { stat: number; df: number; p: number } {
  let stat = 0
  for (let i = 0; i < observed.length; i++) if (expected[i] > 0) stat += (observed[i] - expected[i]) ** 2 / expected[i]
  const df = observed.length - 1
  return { stat, df, p: chi2Sf(stat, df) }
}

export interface Stratum {
  /** Etkene maruz: olay / toplam */
  a: number
  n1: number
  /** Maruz değil: olay / toplam */
  c: number
  n0: number
}
/** Mantel–Haenszel risk oranı (katmanlı) + Greenland–Robins varyansı. */
export function mantelHaenszelRR(
  strata: readonly Stratum[],
  conf = 0.95,
): { rr: number; lo: number; hi: number; p: number; exposed: number; events: number } {
  let num = 0
  let den = 0
  let v = 0
  let exposed = 0
  let events = 0
  for (const s of strata) {
    const n = s.n1 + s.n0
    if (s.n1 <= 0 || s.n0 <= 0) continue
    num += (s.a * s.n0) / n
    den += (s.c * s.n1) / n
    v += (s.n1 * s.n0 * (s.a + s.c) - s.a * s.c * n) / (n * n)
    exposed += s.n1
    events += s.a
  }
  if (!(num > 0) || !(den > 0)) return { rr: NaN, lo: NaN, hi: NaN, p: 1, exposed, events }
  const rr = num / den
  const se = Math.sqrt(Math.max(0, v / (num * den)))
  const z = normInv(1 - (1 - conf) / 2)
  const ln = Math.log(rr)
  return {
    rr,
    lo: Math.exp(ln - z * se),
    hi: Math.exp(ln + z * se),
    p: se > 0 ? 2 * normSf(Math.abs(ln / se)) : 1,
    exposed,
    events,
  }
}

/** Benjamini–Hochberg düzeltilmiş p değerleri (yanlış keşif oranı). Girdi sırasını korur. */
export function benjaminiHochberg(ps: readonly number[]): number[] {
  // Tanımsız (NaN) p değerleri düzeltmeye girmez ve tanımsız kalır; aile büyüklüğü tanımlı olanların sayısıdır
  const order = ps
    .map((p, i) => ({ p, i }))
    .filter((x) => Number.isFinite(x.p))
    .sort((x, y) => x.p - y.p)
  const m = order.length
  const out = new Array<number>(ps.length).fill(NaN)
  let prev = 1
  for (let k = m - 1; k >= 0; k--) {
    const adj = Math.min(prev, (order[k].p * m) / (k + 1))
    out[order[k].i] = adj
    prev = adj
  }
  return out
}
/** Holm düzeltmesi (aile düzeyi hata oranı). Tanımsız (NaN) p değerleri düzeltmeye girmez. */
export function holm(ps: readonly number[]): number[] {
  const order = ps
    .map((p, i) => ({ p, i }))
    .filter((x) => Number.isFinite(x.p))
    .sort((x, y) => x.p - y.p)
  const m = order.length
  const out = new Array<number>(ps.length).fill(NaN)
  let prev = 0
  for (let k = 0; k < m; k++) {
    const adj = Math.min(1, Math.max(prev, order[k].p * (m - k)))
    out[order[k].i] = adj
    prev = adj
  }
  return out
}

/* ───────────── Sınıflandırma ölçüleri ───────────── */

/** ROC eğrisi altındaki alan (sıra tabanlı; eşit puanlarda ortalama sıra). */
export function auc(scores: ArrayLike<number>, labels: ArrayLike<number>): number {
  const n = scores.length
  const idx = new Int32Array(n)
  for (let i = 0; i < n; i++) idx[i] = i
  idx.sort((a, b) => scores[a] - scores[b])
  let pos = 0
  let rankSum = 0
  let i = 0
  while (i < n) {
    let j = i
    while (j + 1 < n && scores[idx[j + 1]] === scores[idx[i]]) j++
    const avgRank = (i + j) / 2 + 1
    for (let k = i; k <= j; k++) {
      if (labels[idx[k]]) {
        pos++
        rankSum += avgRank
      }
    }
    i = j + 1
  }
  const neg = n - pos
  if (pos === 0 || neg === 0) return NaN
  return (rankSum - (pos * (pos + 1)) / 2) / (pos * neg)
}

/** Ortalama log kaybı. */
export function logLoss(probs: ArrayLike<number>, labels: ArrayLike<number>): number {
  let s = 0
  for (let i = 0; i < probs.length; i++) {
    const p = Math.min(1 - 1e-12, Math.max(1e-12, probs[i]))
    s -= labels[i] ? Math.log(p) : Math.log(1 - p)
  }
  return probs.length ? s / probs.length : NaN
}

/** En yüksek puanlı `share` dilimindeki olay oranı / genel olay oranı. */
export function liftAt(
  scores: ArrayLike<number>,
  labels: ArrayLike<number>,
  share = 0.1,
): { rate: number; lift: number; n: number } {
  const n = scores.length
  const idx = new Int32Array(n)
  for (let i = 0; i < n; i++) idx[i] = i
  idx.sort((a, b) => scores[b] - scores[a])
  const k = Math.max(1, Math.round(n * share))
  let top = 0
  let all = 0
  for (let i = 0; i < n; i++) {
    if (labels[idx[i]]) {
      all++
      if (i < k) top++
    }
  }
  const rate = top / k
  return { rate, lift: all > 0 ? rate / (all / n) : NaN, n: k }
}

/** Ayar eğrisi: tahmin olasılığına göre eşit büyüklükte dilimler. */
export function calibration(
  probs: ArrayLike<number>,
  labels: ArrayLike<number>,
  bins = 10,
): { predicted: number; observed: number; n: number }[] {
  const n = probs.length
  const idx = new Int32Array(n)
  for (let i = 0; i < n; i++) idx[i] = i
  idx.sort((a, b) => probs[a] - probs[b])
  const out: { predicted: number; observed: number; n: number }[] = []
  for (let b = 0; b < bins; b++) {
    const from = Math.floor((b * n) / bins)
    const to = Math.floor(((b + 1) * n) / bins)
    if (to <= from) continue
    let sp = 0
    let sy = 0
    for (let i = from; i < to; i++) {
      sp += probs[idx[i]]
      sy += labels[idx[i]] ? 1 : 0
    }
    out.push({ predicted: sp / (to - from), observed: sy / (to - from), n: to - from })
  }
  return out
}

/* ───────────── Sağkalım ───────────── */

export interface KmPoint {
  t: number
  atRisk: number
  events: number
  s: number
  /** Greenwood standart hatası */
  se: number
}
/** Kaplan–Meier. `time[i]` süre, `event[i]` 1 = olay (churn), 0 = sansürlü. */
export function kaplanMeier(time: ArrayLike<number>, event: ArrayLike<number>): KmPoint[] {
  const n = time.length
  const idx = new Int32Array(n)
  for (let i = 0; i < n; i++) idx[i] = i
  idx.sort((a, b) => time[a] - time[b])
  const out: KmPoint[] = []
  let s = 1
  let g = 0
  let i = 0
  while (i < n) {
    const t = time[idx[i]]
    let d = 0
    let j = i
    while (j < n && time[idx[j]] === t) {
      if (event[idx[j]]) d++
      j++
    }
    const atRisk = n - i
    if (d > 0) {
      s *= 1 - d / atRisk
      if (atRisk > d) g += d / (atRisk * (atRisk - d))
      out.push({ t, atRisk, events: d, s, se: s * Math.sqrt(g) })
    }
    i = j
  }
  return out
}
/** KM eğrisinden S(t). */
export function kmAt(km: readonly KmPoint[], t: number): number {
  let s = 1
  for (const p of km) {
    if (p.t > t) break
    s = p.s
  }
  return s
}
/** S(t) ≤ 0.5 olan ilk süre; ulaşılmadıysa null. */
export function kmMedian(km: readonly KmPoint[]): number | null {
  for (const p of km) if (p.s <= 0.5) return p.t
  return null
}

/** Log-rank sınaması (k grup). */
export function logRank(
  time: ArrayLike<number>,
  event: ArrayLike<number>,
  group: ArrayLike<number>,
  groups: number,
): { stat: number; df: number; p: number; observed: number[]; expected: number[] } {
  const n = time.length
  const idx = new Int32Array(n)
  for (let i = 0; i < n; i++) idx[i] = i
  idx.sort((a, b) => time[a] - time[b])
  const atRisk = new Float64Array(groups)
  for (let i = 0; i < n; i++) atRisk[group[i]]++
  const O = new Float64Array(groups)
  const E = new Float64Array(groups)
  const V = new Float64Array(groups * groups)
  let i = 0
  while (i < n) {
    const t = time[idx[i]]
    const d = new Float64Array(groups)
    const leave = new Float64Array(groups)
    let j = i
    while (j < n && time[idx[j]] === t) {
      const g = group[idx[j]]
      leave[g]++
      if (event[idx[j]]) d[g]++
      j++
    }
    let dTot = 0
    let nTot = 0
    for (let g = 0; g < groups; g++) {
      dTot += d[g]
      nTot += atRisk[g]
    }
    if (dTot > 0 && nTot > 1) {
      for (let g = 0; g < groups; g++) {
        O[g] += d[g]
        E[g] += (dTot * atRisk[g]) / nTot
        const f = (dTot * (nTot - dTot)) / (nTot * nTot * (nTot - 1))
        for (let h = 0; h < groups; h++) V[g * groups + h] += f * atRisk[g] * ((g === h ? nTot : 0) - atRisk[h])
      }
    } else if (dTot > 0) {
      for (let g = 0; g < groups; g++) {
        O[g] += d[g]
        E[g] += d[g]
      }
    }
    for (let g = 0; g < groups; g++) atRisk[g] -= leave[g]
    i = j
  }
  // Son grup atılarak (k−1)×(k−1) sistem çözülür
  const k = groups - 1
  let stat = 0
  if (k === 1) {
    stat = V[0] > 0 ? ((O[0] - E[0]) * (O[0] - E[0])) / V[0] : 0
  } else if (k > 1) {
    const A = new Float64Array(k * k)
    const b = new Float64Array(k)
    for (let g = 0; g < k; g++) {
      b[g] = O[g] - E[g]
      for (let h = 0; h < k; h++) A[g * k + h] = V[g * groups + h]
    }
    const x = solveSymmetric(A, b, k)
    if (x) for (let g = 0; g < k; g++) stat += b[g] * x[g]
  }
  return { stat, df: Math.max(1, k), p: chi2Sf(stat, Math.max(1, k)), observed: [...O], expected: [...E] }
}

/* ───────────── Doğrusal cebir (küçük, yoğun, simetrik) ───────────── */

/**
 * Cholesky ayrıştırması (yerinde, alt üçgen). Pozitif tanımlı değilse köşegene küçük bir sırt ekleyip yeniden dener;
 * yine olmazsa false.
 */
export function cholesky(A: Float64Array, n: number): boolean {
  for (let attempt = 0; attempt < 4; attempt++) {
    const L = A.slice()
    let ok = true
    for (let i = 0; i < n && ok; i++) {
      for (let j = 0; j <= i; j++) {
        let s = L[i * n + j]
        for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k]
        if (i === j) {
          if (!(s > 1e-12)) {
            ok = false
            break
          }
          L[i * n + i] = Math.sqrt(s)
        } else L[i * n + j] = s / L[j * n + j]
      }
    }
    if (ok) {
      A.set(L)
      return true
    }
    let tr = 0
    for (let i = 0; i < n; i++) tr += Math.abs(A[i * n + i])
    const ridge = Math.max(1e-10, (tr / n) * Math.pow(10, -8 + 2 * attempt))
    for (let i = 0; i < n; i++) A[i * n + i] += ridge
  }
  return false
}
/** L Lᵀ x = b (L: cholesky çıktısı). */
export function choleskySolve(L: Float64Array, b: ArrayLike<number>, n: number): Float64Array {
  const y = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    let s = b[i]
    for (let k = 0; k < i; k++) s -= L[i * n + k] * y[k]
    y[i] = s / L[i * n + i]
  }
  const x = new Float64Array(n)
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i]
    for (let k = i + 1; k < n; k++) s -= L[k * n + i] * x[k]
    x[i] = s / L[i * n + i]
  }
  return x
}
/** Simetrik pozitif tanımlı A için A x = b; çözülemezse null. A değişmez. */
export function solveSymmetric(A: Float64Array, b: ArrayLike<number>, n: number): Float64Array | null {
  const L = A.slice()
  if (!cholesky(L, n)) return null
  return choleskySolve(L, b, n)
}
/** A⁻¹'in köşegeni (L: cholesky çıktısı) — katsayı standart hataları için. */
export function choleskyInverseDiag(L: Float64Array, n: number): Float64Array {
  const out = new Float64Array(n)
  const e = new Float64Array(n)
  for (let j = 0; j < n; j++) {
    e.fill(0)
    e[j] = 1
    out[j] = choleskySolve(L, e, n)[j]
  }
  return out
}

/* ───────────── Lojistik regresyon ───────────── */

export interface LogisticFit {
  /** [kesişim, β₁ … βₚ] */
  coef: Float64Array
  se: Float64Array
  /** Wald z ve iki yönlü p */
  z: Float64Array
  p: Float64Array
  logLik: number
  iterations: number
  converged: boolean
}

export const sigmoid = (x: number): number => (x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x)))
/** ln(1 + eˣ), taşmasız. */
export const softplus = (x: number): number => (x > 35 ? x : Math.log1p(Math.exp(x)))

/**
 * Lojistik regresyon (Newton / IRLS), L2 cezası kesişime uygulanmaz.
 * X: satır öncelikli n × p (kesişim sütunu YOK; içeride eklenir). weights verilirse gözlem ağırlıklarıdır.
 */
export function logistic(
  X: Float64Array | Float32Array,
  y: ArrayLike<number>,
  n: number,
  p: number,
  opts: { l2?: number; maxIter?: number; tol?: number; weights?: ArrayLike<number> } = {},
): LogisticFit {
  const l2 = opts.l2 ?? 1e-4
  const maxIter = opts.maxIter ?? 50
  const tol = opts.tol ?? 1e-7
  const w = opts.weights
  const q = p + 1
  const beta = new Float64Array(q)
  let sw = 0
  let sy = 0
  for (let i = 0; i < n; i++) {
    const wi = w ? w[i] : 1
    sw += wi
    sy += wi * (y[i] ? 1 : 0)
  }
  const p0 = Math.min(1 - 1e-6, Math.max(1e-6, sy / Math.max(1e-12, sw)))
  beta[0] = Math.log(p0 / (1 - p0))
  const grad = new Float64Array(q)
  const H = new Float64Array(q * q)
  const xi = new Float64Array(q)
  const ll = (b: Float64Array): number => {
    let s = 0
    for (let i = 0; i < n; i++) {
      let eta = b[0]
      const off = i * p
      for (let j = 0; j < p; j++) eta += b[j + 1] * X[off + j]
      const wi = w ? w[i] : 1
      // log σ(η) = −softplus(−η) · log(1 − σ(η)) = −softplus(η)
      s -= wi * softplus(y[i] ? -eta : eta)
    }
    let pen = 0
    for (let j = 1; j < q; j++) pen += b[j] * b[j]
    return s - 0.5 * l2 * pen
  }
  /** Verilen katsayılarda gradyan ve (eksi) Hessian; grad ve H yerinde doldurulur. */
  const gradHess = (b: Float64Array): void => {
    grad.fill(0)
    H.fill(0)
    xi[0] = 1
    for (let i = 0; i < n; i++) {
      let eta = b[0]
      const off = i * p
      for (let j = 0; j < p; j++) {
        const v = X[off + j]
        xi[j + 1] = v
        eta += b[j + 1] * v
      }
      const mu = sigmoid(eta)
      const wi = w ? w[i] : 1
      const r = wi * ((y[i] ? 1 : 0) - mu)
      const ww = wi * Math.max(1e-10, mu * (1 - mu))
      for (let a = 0; a < q; a++) {
        const xa = xi[a]
        if (xa === 0) continue
        grad[a] += r * xa
        const row = a * q
        const wx = ww * xa
        for (let c = 0; c <= a; c++) H[row + c] += wx * xi[c]
      }
    }
    for (let a = 1; a < q; a++) {
      grad[a] -= l2 * b[a]
      H[a * q + a] += l2
    }
    for (let a = 0; a < q; a++) for (let c = a + 1; c < q; c++) H[a * q + c] = H[c * q + a]
  }
  let prev = ll(beta)
  let converged = false
  let it = 0
  for (; it < maxIter; it++) {
    gradHess(beta)
    const L = H.slice()
    if (!cholesky(L, q)) break
    const step = choleskySolve(L, grad, q)
    // Adım yarılama: olabilirlik düşerse adımı küçült
    let scale = 1
    let next = beta
    let cur = prev
    for (let h = 0; h < 12; h++) {
      const cand = new Float64Array(q)
      for (let a = 0; a < q; a++) cand[a] = beta[a] + scale * step[a]
      const c = ll(cand)
      if (Number.isFinite(c) && c >= prev - 1e-10) {
        next = cand
        cur = c
        break
      }
      scale *= 0.5
    }
    let maxDelta = 0
    for (let a = 0; a < q; a++) maxDelta = Math.max(maxDelta, Math.abs(next[a] - beta[a]))
    beta.set(next)
    const gain = cur - prev
    prev = cur
    if (maxDelta < tol || Math.abs(gain) < tol * 1e-3 * (1 + Math.abs(cur))) {
      converged = true
      it++
      break
    }
  }
  // Standart hatalar: son katsayılardaki Hessian'ın tersinden
  const se = new Float64Array(q)
  const z = new Float64Array(q)
  const pv = new Float64Array(q).fill(1)
  gradHess(beta)
  const Lf = H.slice()
  if (cholesky(Lf, q)) {
    const diag = choleskyInverseDiag(Lf, q)
    for (let a = 0; a < q; a++) {
      se[a] = Math.sqrt(Math.max(0, diag[a]))
      z[a] = se[a] > 0 ? beta[a] / se[a] : 0
      pv[a] = se[a] > 0 ? 2 * normSf(Math.abs(z[a])) : 1
    }
  }
  return { coef: beta, se, z, p: pv, logLik: prev, iterations: it, converged }
}

/** Lojistik modelden olasılıklar. */
export function logisticPredict(
  coef: ArrayLike<number>,
  X: Float64Array | Float32Array,
  n: number,
  p: number,
): Float64Array {
  const out = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    let eta = coef[0]
    const off = i * p
    for (let j = 0; j < p; j++) eta += coef[j + 1] * X[off + j]
    out[i] = sigmoid(eta)
  }
  return out
}
