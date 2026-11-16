/**
 * A/B çözümlemesi: iki kolun kullanıcı düzeyi ölçümlerinden fark, güven aralığı ve p değeri.
 *
 * Üç tasarım desteklenir:
 *   eşsiz    klasik A/B — kollar farklı kullanıcılardır (Welch t; oranlarda z; bölüm ölçülerinde delta yöntemi)
 *   CUPED    eşsiz + deney öncesi dönem ölçüsüyle varyans azaltma (aynı güce daha az kullanıcıyla ulaşılır)
 *   eşli     ikiz evren — aynı simüle kullanıcılar iki kolda da yaşar; kullanıcı başına fark alınır
 *
 * Bölüm ölçüleri (ör. boş oturum / oturum) kullanıcı başına oran DEĞİL, toplamların oranıdır: çözümleme birimi
 * kullanıcı kalsın diye doğrusallaştırılır (delta yöntemi). Aksi hâlde çok oturumlu kullanıcılar az sayılır.
 */
import { benjaminiHochberg, chi2Gof, normCdf, normInv, normSf, tInv, tTwoSided } from '../core/stats'

export interface Estimate {
  /** Kol değerleri (ortalama ya da toplamların oranı) */
  control: number
  treatment: number
  diff: number
  se: number
  lo: number
  hi: number
  /** Göreli fark ve aralığı (kontrol 0 ise NaN) */
  rel: number
  relLo: number
  relHi: number
  p: number
  /** P(varyant > kontrol) — düz önsel, normal yaklaşım */
  probBetter: number
  nControl: number
  nTreatment: number
  method: 'eşli t' | 'Welch t' | 'iki oran z' | 'delta' | 'CUPED'
}

interface Sums {
  n: number
  mean: number
  var: number
}
function sums(x: ArrayLike<number>): Sums {
  const n = x.length
  let s = 0
  for (let i = 0; i < n; i++) s += x[i]
  const mean = n ? s / n : NaN
  let v = 0
  for (let i = 0; i < n; i++) v += (x[i] - mean) * (x[i] - mean)
  return { n, mean, var: n > 1 ? v / (n - 1) : 0 }
}
function covariance(x: ArrayLike<number>, y: ArrayLike<number>, mx: number, my: number): number {
  const n = Math.min(x.length, y.length)
  if (n < 2) return 0
  let s = 0
  for (let i = 0; i < n; i++) s += (x[i] - mx) * (y[i] - my)
  return s / (n - 1)
}

function finish(
  control: number,
  treatment: number,
  diff: number,
  se: number,
  df: number | null,
  /** Göreli farkın standart hatası (delta yöntemi) */
  relSe: number,
  nC: number,
  nT: number,
  method: Estimate['method'],
  conf: number,
): Estimate {
  // Bilgi yok (boş kol, tek gözlem, sıfır payda): fark ya da belirsizliği bilinemez → anlamlı sonuç üretilmez
  if (nC < 2 || nT < 2 || !Number.isFinite(diff) || !Number.isFinite(se)) {
    return {
      control,
      treatment,
      diff,
      se: NaN,
      lo: NaN,
      hi: NaN,
      rel: NaN,
      relLo: NaN,
      relHi: NaN,
      p: 1,
      probBetter: 0.5,
      nControl: nC,
      nTreatment: nT,
      method,
    }
  }
  const q = df === null ? normInv(1 - (1 - conf) / 2) : tInv(1 - (1 - conf) / 2, Math.max(1, df))
  const stat = se > 0 ? diff / se : 0
  const p = se > 0 ? (df === null ? 2 * normSf(Math.abs(stat)) : tTwoSided(stat, Math.max(1, df))) : diff === 0 ? 1 : 0
  const rel = control !== 0 ? diff / Math.abs(control) : NaN
  return {
    control,
    treatment,
    diff,
    se,
    lo: diff - q * se,
    hi: diff + q * se,
    rel,
    relLo: rel - q * relSe,
    relHi: rel + q * relSe,
    p,
    probBetter: se > 0 ? normCdf(stat) : diff > 0 ? 1 : diff < 0 ? 0 : 0.5,
    nControl: nC,
    nTreatment: nT,
    method,
  }
}

/** Göreli farkın (T − C) / C standart hatası; cov: kol ortalamalarının kovaryansı (eşsizde 0). */
function relativeSe(mc: number, mt: number, vc: number, vt: number, cov: number): number {
  if (mc === 0) return NaN
  const r = mt / mc
  return Math.sqrt(Math.max(0, vt + r * r * vc - 2 * r * cov)) / Math.abs(mc)
}

/** Eşsiz: ortalama farkı (Welch). */
export function compareMeans(c: ArrayLike<number>, t: ArrayLike<number>, conf = 0.95): Estimate {
  const a = sums(c)
  const b = sums(t)
  const va = a.var / a.n
  const vb = b.var / b.n
  const se = Math.sqrt(va + vb)
  const df =
    se > 0 ? ((va + vb) * (va + vb)) / ((va * va) / Math.max(1, a.n - 1) + (vb * vb) / Math.max(1, b.n - 1)) : 1
  return finish(
    a.mean,
    b.mean,
    b.mean - a.mean,
    se,
    df,
    relativeSe(a.mean, b.mean, va, vb, 0),
    a.n,
    b.n,
    'Welch t',
    conf,
  )
}

/** Eşsiz: iki oran (0/1 ölçü). Sınama havuzlanmış varyansla, aralık havuzlanmamışla. */
export function compareProportions(c: ArrayLike<number>, t: ArrayLike<number>, conf = 0.95): Estimate {
  const a = sums(c)
  const b = sums(t)
  const va = (a.mean * (1 - a.mean)) / a.n
  const vb = (b.mean * (1 - b.mean)) / b.n
  const pool = (a.mean * a.n + b.mean * b.n) / (a.n + b.n)
  const sePool = Math.sqrt(pool * (1 - pool) * (1 / a.n + 1 / b.n))
  const out = finish(
    a.mean,
    b.mean,
    b.mean - a.mean,
    Math.sqrt(va + vb),
    null,
    relativeSe(a.mean, b.mean, va, vb, 0),
    a.n,
    b.n,
    'iki oran z',
    conf,
  )
  out.p = sePool > 0 ? 2 * normSf(Math.abs((b.mean - a.mean) / sePool)) : 1
  return out
}

/** Toplamların oranının doğrusallaştırılmış kullanıcı değerleri: (pay − R·payda) / ortalama payda. */
function linearize(num: ArrayLike<number>, den: ArrayLike<number>): { ratio: number; lin: Float64Array } {
  const n = num.length
  let sn = 0
  let sd = 0
  for (let i = 0; i < n; i++) {
    sn += num[i]
    sd += den[i]
  }
  const ratio = sd > 0 ? sn / sd : NaN
  const md = sd / n
  const lin = new Float64Array(n)
  if (md > 0) for (let i = 0; i < n; i++) lin[i] = (num[i] - ratio * den[i]) / md
  return { ratio, lin }
}

/** Eşsiz: bölüm ölçüsü (delta yöntemi). */
export function compareRatios(
  cNum: ArrayLike<number>,
  cDen: ArrayLike<number>,
  tNum: ArrayLike<number>,
  tDen: ArrayLike<number>,
  conf = 0.95,
): Estimate {
  const a = linearize(cNum, cDen)
  const b = linearize(tNum, tDen)
  const va = sums(a.lin).var / cNum.length
  const vb = sums(b.lin).var / tNum.length
  return finish(
    a.ratio,
    b.ratio,
    b.ratio - a.ratio,
    Math.sqrt(va + vb),
    null,
    relativeSe(a.ratio, b.ratio, va, vb, 0),
    cNum.length,
    tNum.length,
    'delta',
    conf,
  )
}

/** Eşli: aynı birimlerin iki koldaki değerleri (ikiz evren). */
export function comparePaired(c: ArrayLike<number>, t: ArrayLike<number>, conf = 0.95): Estimate {
  const n = Math.min(c.length, t.length)
  const d = new Float64Array(n)
  for (let i = 0; i < n; i++) d[i] = t[i] - c[i]
  const sd = sums(d)
  const a = sums(c)
  const b = sums(t)
  const se = Math.sqrt(sd.var / n)
  const cov = covariance(c, t, a.mean, b.mean) / n
  return finish(
    a.mean,
    b.mean,
    sd.mean,
    se,
    n - 1,
    relativeSe(a.mean, b.mean, a.var / n, b.var / n, cov),
    n,
    n,
    'eşli t',
    conf,
  )
}

/** Eşli bölüm ölçüsü: iki kolun doğrusallaştırılmış değerlerinin kullanıcı başına farkı. */
export function comparePairedRatios(
  cNum: ArrayLike<number>,
  cDen: ArrayLike<number>,
  tNum: ArrayLike<number>,
  tDen: ArrayLike<number>,
  conf = 0.95,
): Estimate {
  const n = cNum.length
  const a = linearize(cNum, cDen)
  const b = linearize(tNum, tDen)
  const d = new Float64Array(n)
  for (let i = 0; i < n; i++) d[i] = b.lin[i] - a.lin[i]
  const sd = sums(d)
  const se = Math.sqrt(sd.var / n)
  const sa = sums(a.lin)
  const sb = sums(b.lin)
  const cov = covariance(a.lin, b.lin, sa.mean, sb.mean) / n
  return finish(
    a.ratio,
    b.ratio,
    b.ratio - a.ratio,
    se,
    n - 1,
    relativeSe(a.ratio, b.ratio, sa.var / n, sb.var / n, cov),
    n,
    n,
    'eşli t',
    conf,
  )
}

/**
 * CUPED: Y' = Y − θ (X − X̄), θ = cov(Y, X) / var(X) (iki kol birlikte). X deney ÖNCESİ dönemin aynı ölçüsüdür;
 * atamadan etkilenmediği için yansızlığı bozmaz, yalnız varyansı (1 − ρ²) oranında küçültür.
 */
export function compareCuped(
  c: ArrayLike<number>,
  t: ArrayLike<number>,
  cPre: ArrayLike<number>,
  tPre: ArrayLike<number>,
  conf = 0.95,
): Estimate & { theta: number; varianceReduction: number } {
  const nC = c.length
  const nT = t.length
  let sx = 0
  let sy = 0
  for (let i = 0; i < nC; i++) {
    sx += cPre[i]
    sy += c[i]
  }
  for (let i = 0; i < nT; i++) {
    sx += tPre[i]
    sy += t[i]
  }
  const mx = sx / (nC + nT)
  const my = sy / (nC + nT)
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < nC; i++) {
    sxy += (cPre[i] - mx) * (c[i] - my)
    sxx += (cPre[i] - mx) * (cPre[i] - mx)
    syy += (c[i] - my) * (c[i] - my)
  }
  for (let i = 0; i < nT; i++) {
    sxy += (tPre[i] - mx) * (t[i] - my)
    sxx += (tPre[i] - mx) * (tPre[i] - mx)
    syy += (t[i] - my) * (t[i] - my)
  }
  const theta = sxx > 0 ? sxy / sxx : 0
  const rho2 = sxx > 0 && syy > 0 ? (sxy * sxy) / (sxx * syy) : 0
  const ca = new Float64Array(nC)
  const ta = new Float64Array(nT)
  for (let i = 0; i < nC; i++) ca[i] = c[i] - theta * (cPre[i] - mx)
  for (let i = 0; i < nT; i++) ta[i] = t[i] - theta * (tPre[i] - mx)
  const e = compareMeans(ca, ta, conf)
  return { ...e, method: 'CUPED', theta, varianceReduction: rho2 }
}

/** Örneklem oranı uyuşmazlığı (SRM): gözlenen kol büyüklükleri beklenen paylarla uyumlu mu. p < 0.001 → atama bozuk. */
export function sampleRatioMismatch(counts: readonly number[], weights: readonly number[]): { p: number; ok: boolean } {
  const total = counts.reduce((a, b) => a + b, 0)
  const wsum = weights.reduce((a, b) => a + b, 0)
  const r = chi2Gof(
    counts,
    weights.map((w) => (total * w) / wsum),
  )
  return { p: r.p, ok: r.p >= 0.001 }
}

/** Çoklu karşılaştırma: ikincil ölçülerin p değerleri yanlış keşif oranına göre düzeltilir. */
export const adjustP = (ps: readonly number[]): number[] => benjaminiHochberg(ps)

/* ───────────── Güç ───────────── */

/** İki kollu eşsiz deneyde algılanabilir en küçük mutlak fark (iki yönlü α, verilen güç). */
export function minimumDetectableEffect(sd: number, nPerArm: number, alpha = 0.05, power = 0.8): number {
  return (normInv(1 - alpha / 2) + normInv(power)) * sd * Math.sqrt(2 / Math.max(1, nPerArm))
}
/** Verilen mutlak farkı algılamak için kol başına gereken birim sayısı. */
export function requiredSampleSize(sd: number, delta: number, alpha = 0.05, power = 0.8): number {
  if (!(Math.abs(delta) > 0)) return Infinity
  const z = normInv(1 - alpha / 2) + normInv(power)
  return Math.ceil((2 * z * z * sd * sd) / (delta * delta))
}
/** Verilen fark ve örneklemle gerçekleşen güç. */
export function achievedPower(sd: number, delta: number, nPerArm: number, alpha = 0.05): number {
  const se = sd * Math.sqrt(2 / Math.max(1, nPerArm))
  if (!(se > 0)) return delta !== 0 ? 1 : alpha
  return normCdf(Math.abs(delta) / se - normInv(1 - alpha / 2))
}

/* ───────────── Ardışık sınama ───────────── */

/**
 * Her an geçerli p değeri (karışım ardışık olasılık oranı sınaması, mSPRT; normal ortalama farkı).
 * Deney sürerken sonuçlara istenildiği kadar bakılabilir; p bu değerin o ana kadarki en küçüğüdür ve yanlış pozitif
 * oranı yine α'yı aşmaz. `tau`: beklenen etki büyüklüğünün ölçeği (ör. ölçünün standart sapmasının %10'u).
 */
export function alwaysValidP(diff: number, se: number, tau: number): number {
  const v = se * se
  if (!(v > 0) || !(tau > 0)) return 1
  const t2 = tau * tau
  const lambda = Math.sqrt(v / (v + t2)) * Math.exp((t2 * diff * diff) / (2 * v * (v + t2)))
  return Math.min(1, 1 / lambda)
}
