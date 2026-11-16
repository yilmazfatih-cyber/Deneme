/**
 * A/B çözümlemesi (lab/src/ab/analyze.ts): her tasarımın istatistiksel ayarı tohumlu simülasyonla sınanır — sıfır etki
 * altında yanlış alarm oranı, gömülü etkide güven aralığı kapsaması, etkiyle artan güç. Ayrıca kapalı biçimlerle
 * birebir karşılaştırma, CUPED ve eşli çözümleme kazancı, örneklem oranı denetimi, güç hesabı, çoklu karşılaştırma ve
 * her an geçerli p (tekrar tekrar bakma altında yanlış alarm denetimi).
 *
 * Tüm rastgelelik lab/src/core/rng.ts üreteçlerinden ve sabit tohumlardan gelir: sonuçlar her koşuda aynıdır.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  achievedPower,
  adjustP,
  alwaysValidP,
  compareCuped,
  compareMeans,
  comparePaired,
  comparePairedRatios,
  compareProportions,
  compareRatios,
  minimumDetectableEffect,
  requiredSampleSize,
  sampleRatioMismatch,
  type Estimate,
} from '../src/ab/analyze'
import { beta, normal, poisson, rngFor, type Rng } from '../src/core/rng'
import { benjaminiHochberg, moments, normSf, tTwoSided, twoProportion, welch } from '../src/core/stats'

const SEED = 20261116

interface Draw {
  e: Estimate
  /** Gerçek mutlak ve göreli fark */
  truth: number
  relTruth: number
}

interface Scenario {
  name: string
  method: Estimate['method']
  /** Gömülü etkiler: küçük (kapsama + güç) ve büyük (güç) */
  small: number
  large: number
  draw: (rng: Rng, effect: number) => Draw
}

/** Kullanıcı başına pay / payda: kullanıcıya özgü olasılık (kullanıcı içi bağımlılık) ve değişken payda. */
function ratioArm(rng: Rng, n: number, a: number, b: number): [Float64Array, Float64Array] {
  const num = new Float64Array(n)
  const den = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const p = beta(rng, a, b)
    const k = 1 + poisson(rng, 4)
    den[i] = k
    let s = 0
    for (let j = 0; j < k; j++) if (rng() < p) s++
    num[i] = s
  }
  return [num, den]
}

const SCENARIOS: Scenario[] = [
  {
    name: 'compareMeans (Welch; eşit olmayan varyans ve kol büyüklüğü)',
    method: 'Welch t',
    small: 0.3,
    large: 0.5,
    draw: (rng, d) => {
      const c = new Float64Array(200)
      const t = new Float64Array(240)
      for (let i = 0; i < c.length; i++) c[i] = 10 + 2 * normal(rng)
      for (let i = 0; i < t.length; i++) t[i] = 10 + 2 * d + 3 * normal(rng)
      return { e: compareMeans(c, t), truth: 2 * d, relTruth: (2 * d) / 10 }
    },
  },
  {
    name: 'compareProportions (iki oran)',
    method: 'iki oran z',
    small: 0.05,
    large: 0.1,
    draw: (rng, d) => {
      const c = new Float64Array(400)
      const t = new Float64Array(450)
      for (let i = 0; i < c.length; i++) c[i] = rng() < 0.3 ? 1 : 0
      for (let i = 0; i < t.length; i++) t[i] = rng() < 0.3 + d ? 1 : 0
      return { e: compareProportions(c, t), truth: d, relTruth: d / 0.3 }
    },
  },
  {
    name: 'compareRatios (toplamların oranı, delta yöntemi)',
    method: 'delta',
    small: 0.04,
    large: 0.08,
    draw: (rng, d) => {
      // E[p] = a / (a + b): kontrol 0.3, varyant 0.3 + d (payda p'den bağımsız → toplamların oranı E[p])
      const [cn, cd] = ratioArm(rng, 300, 3, 7)
      const [tn, td] = ratioArm(rng, 320, 3 + 10 * d, 7 - 10 * d)
      return { e: compareRatios(cn, cd, tn, td), truth: d, relTruth: d / 0.3 }
    },
  },
  {
    name: 'comparePaired (ikiz evren)',
    method: 'eşli t',
    small: 0.2,
    large: 0.35,
    draw: (rng, d) => {
      const n = 200
      const c = new Float64Array(n)
      const t = new Float64Array(n)
      for (let i = 0; i < n; i++) {
        const u = 5 + 2 * normal(rng)
        c[i] = u + normal(rng)
        t[i] = u + d + normal(rng)
      }
      return { e: comparePaired(c, t), truth: d, relTruth: d / 5 }
    },
  },
  {
    name: 'comparePairedRatios (eşli bölüm ölçüsü)',
    method: 'eşli t',
    small: 0.03,
    large: 0.06,
    draw: (rng, d) => {
      const n = 300
      const cn = new Float64Array(n)
      const cd = new Float64Array(n)
      const tn = new Float64Array(n)
      const td = new Float64Array(n)
      for (let i = 0; i < n; i++) {
        // Aynı kullanıcı iki evrende: aynı eğilim (p) ve aynı sıklık (lam), ayrı gürültü
        const p = Math.min(0.9, beta(rng, 3, 7))
        const lam = 2 + 4 * rng()
        cd[i] = 1 + poisson(rng, lam)
        td[i] = 1 + poisson(rng, lam)
        let s = 0
        for (let j = 0; j < cd[i]; j++) if (rng() < p) s++
        cn[i] = s
        s = 0
        for (let j = 0; j < td[i]; j++) if (rng() < p + d) s++
        tn[i] = s
      }
      return { e: comparePairedRatios(cn, cd, tn, td), truth: d, relTruth: d / EP_CAPPED }
    },
  },
  {
    name: 'compareCuped (deney öncesi ölçüyle varyans azaltma)',
    method: 'CUPED',
    small: 0.1,
    large: 0.2,
    draw: (rng, d) => {
      const [c, cPre] = cupedArm(rng, 200, 0, 0.8)
      const [t, tPre] = cupedArm(rng, 230, d, 0.8)
      return { e: compareCuped(c, t, cPre, tPre), truth: d, relTruth: d / 5 }
    },
  },
]

/** min(0.9, Beta(3, 7)) ortalaması: kırpma payı ihmal edilebilir (P(p > 0.9) ≈ 3e-7) */
const EP_CAPPED = 0.3

/** Y = 5 + kayma + ρ (X − 3) + √(1 − ρ²) ε; X deney öncesi ölçü (varyansı 1). */
function cupedArm(rng: Rng, n: number, shift: number, rho: number): [Float64Array, Float64Array] {
  const y = new Float64Array(n)
  const x = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    x[i] = 3 + normal(rng)
    y[i] = 5 + shift + rho * (x[i] - 3) + Math.sqrt(1 - rho * rho) * normal(rng)
  }
  return [y, x]
}

interface Summary {
  reject: number
  cover: number
  relCover: number
  /** Ortalama kestirim hatası ve Monte Carlo standart hatası */
  bias: number
  biasSe: number
  probBetter: number
}

function simulate(sc: Scenario, effect: number, reps: number, label: string): Summary {
  const rng = rngFor(SEED, 'analyze', sc.name, label)
  let reject = 0
  let cover = 0
  let relCover = 0
  let s = 0
  let s2 = 0
  let pb = 0
  for (let r = 0; r < reps; r++) {
    const { e, truth, relTruth } = sc.draw(rng, effect)
    if (e.p < 0.05) reject++
    if (e.lo <= truth && truth <= e.hi) cover++
    if (e.relLo <= relTruth && relTruth <= e.relHi) relCover++
    const err = e.diff - truth
    s += err
    s2 += err * err
    pb += e.probBetter
  }
  const bias = s / reps
  return {
    reject: reject / reps,
    cover: cover / reps,
    relCover: relCover / reps,
    bias,
    biasSe: Math.sqrt(Math.max(0, s2 / reps - bias * bias) / reps),
    probBetter: pb / reps,
  }
}

describe('istatistiksel ayar (simülasyon)', () => {
  const REPS = 2000
  for (const sc of SCENARIOS) {
    describe(sc.name, () => {
      let nul: Summary
      let small: Summary
      let large: Summary
      beforeAll(() => {
        nul = simulate(sc, 0, REPS, 'sifir')
        small = simulate(sc, sc.small, REPS, 'kucuk')
        large = simulate(sc, sc.large, REPS / 2, 'buyuk')
      })

      it(`sıfır etki altında α = 0.05 için yanlış alarm oranı [0.03, 0.075] içinde (${REPS} yineleme)`, () => {
        expect(nul.reject).toBeGreaterThanOrEqual(0.03)
        expect(nul.reject).toBeLessThanOrEqual(0.075)
        // Etki yokken aralık sıfırı %95 kapsar; "daha iyi olma olasılığı" ortalamada yazı-tura
        expect(nul.cover).toBeGreaterThanOrEqual(0.92)
        expect(nul.cover).toBeLessThanOrEqual(0.975)
        expect(Math.abs(nul.probBetter - 0.5)).toBeLessThan(0.03)
      })

      it('gömülü etkide %95 güven aralığı gerçek farkı [0.92, 0.975] oranında kapsar; kestirim yansız', () => {
        expect(small.cover).toBeGreaterThanOrEqual(0.92)
        expect(small.cover).toBeLessThanOrEqual(0.975)
        // Göreli farkın aralığı da (delta yöntemi) aynı ayarda
        expect(small.relCover).toBeGreaterThanOrEqual(0.92)
        expect(small.relCover).toBeLessThanOrEqual(0.975)
        expect(Math.abs(small.bias)).toBeLessThanOrEqual(5 * small.biasSe)
        expect(small.probBetter).toBeGreaterThan(0.75)
      })

      it('güç etkiyle artar', () => {
        expect(small.reject).toBeGreaterThan(nul.reject + 0.1)
        expect(large.reject).toBeGreaterThan(small.reject + 0.1)
        expect(large.reject).toBeGreaterThan(0.85)
      })

      it('çıktı alanları tutarlı', () => {
        const { e } = sc.draw(rngFor(SEED, 'alanlar', sc.name), sc.small)
        expect(e.method).toBe(sc.method)
        expect(e.diff).toBeCloseTo(e.treatment - e.control, 12)
        expect(e.lo).toBeLessThan(e.diff)
        expect(e.hi).toBeGreaterThan(e.diff)
        expect(e.hi - e.diff).toBeCloseTo(e.diff - e.lo, 12)
        expect(e.rel).toBeCloseTo(e.diff / Math.abs(e.control), 12)
        expect(e.relLo).toBeLessThan(e.rel)
        expect(e.relHi).toBeGreaterThan(e.rel)
        expect(e.se).toBeGreaterThan(0)
        expect(e.p).toBeGreaterThanOrEqual(0)
        expect(e.p).toBeLessThanOrEqual(1)
        expect(e.probBetter).toBeGreaterThanOrEqual(0)
        expect(e.probBetter).toBeLessThanOrEqual(1)
        expect(e.nControl).toBeGreaterThan(0)
        expect(e.nTreatment).toBeGreaterThan(0)
      })
    })
  }

  it('compareMeans: istenen güven düzeyi tutuyor (%80 aralık ≈ %80 kapsar)', () => {
    const rng = rngFor(SEED, 'guven-80')
    let cover = 0
    const reps = 2000
    for (let r = 0; r < reps; r++) {
      const c = Float64Array.from({ length: 60 }, () => normal(rng))
      const t = Float64Array.from({ length: 80 }, () => 0.4 + 1.5 * normal(rng))
      const e = compareMeans(c, t, 0.8)
      if (e.lo <= 0.4 && 0.4 <= e.hi) cover++
    }
    expect(cover / reps).toBeGreaterThanOrEqual(0.77)
    expect(cover / reps).toBeLessThanOrEqual(0.83)
  })
})

describe('kapalı biçimlerle karşılaştırma', () => {
  interface WelchRef {
    welch: { a: number[]; b: number[]; stat: number; p: number; df: number; lo: number; hi: number }
    auc: { y: number[] }
  }
  const ref = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'stats-ref.json'), 'utf8')) as WelchRef
  const a = ref.welch.a
  const b = ref.welch.b

  it('compareMeans = Welch t (scipy başvurusu ve stats.welch)', () => {
    const e = compareMeans(a, b)
    expect(e.p).toBeCloseTo(ref.welch.p, 10)
    expect(e.lo).toBeCloseTo(ref.welch.lo, 9)
    expect(e.hi).toBeCloseTo(ref.welch.hi, 9)
    expect(e.diff / e.se).toBeCloseTo(ref.welch.stat, 10)
    const w = welch(moments(a), moments(b))
    expect(e.diff).toBeCloseTo(w.diff, 12)
    expect(e.se).toBeCloseTo(w.se, 12)
    expect(e.nControl).toBe(a.length)
    expect(e.nTreatment).toBe(b.length)
    // Kollar yer değişince işaret döner
    const rev = compareMeans(b, a)
    expect(rev.diff).toBeCloseTo(-e.diff, 12)
    expect(rev.p).toBeCloseTo(e.p, 12)
    expect(rev.probBetter).toBeCloseTo(1 - e.probBetter, 12)
  })

  it('comparePaired = farkların tek örneklem t sınaması (scipy ttest_rel)', () => {
    // scipy.stats.ttest_rel(b[:90], a): istatistik, p, %95 aralık
    const e = comparePaired(a, b.slice(0, 90))
    expect(e.diff).toBeCloseTo(0.296465515203001, 12)
    expect(e.se).toBeCloseTo(0.6817903646228821, 12)
    expect(e.p).toBeCloseTo(0.6647356017893918, 10)
    expect(e.lo).toBeCloseTo(-1.0582374168312865, 9)
    expect(e.hi).toBeCloseTo(1.6511684472372887, 9)
    expect(e.p).toBeCloseTo(tTwoSided(e.diff / e.se, 89), 12)
    expect(e.nControl).toBe(90)
  })

  it('compareProportions = iki oran z sınaması (statsmodels proportions_ztest)', () => {
    const y = ref.auc.y
    const c = y.slice(0, 70)
    const t = y.slice(70)
    const e = compareProportions(c, t)
    expect(e.control).toBeCloseTo(36 / 70, 14)
    expect(e.treatment).toBeCloseTo(49 / 90, 14)
    expect(e.p).toBeCloseTo(0.7045167275494811, 10)
    const tp = twoProportion(36, 70, 49, 90)
    expect(e.p).toBeCloseTo(tp.p, 12)
    expect(e.lo).toBeCloseTo(tp.lo, 12)
    expect(e.hi).toBeCloseTo(tp.hi, 12)
    expect(e.se).toBeCloseTo(tp.se, 12)
  })

  it('compareRatios: standart hata klasik delta yöntemi formülüyle aynı', () => {
    const rng = rngFor(SEED, 'delta-formul')
    const [cn, cd] = ratioArm(rng, 150, 2, 5)
    const [tn, td] = ratioArm(rng, 170, 3, 5)
    const e = compareRatios(cn, cd, tn, td)
    /** Var(R̂) ≈ (s²_pay − 2 R s_pay,payda + R² s²_payda) / (n · ortalama payda²) */
    const armVar = (num: Float64Array, den: Float64Array): { ratio: number; v: number } => {
      const n = num.length
      let sn = 0
      let sd = 0
      for (let i = 0; i < n; i++) {
        sn += num[i]
        sd += den[i]
      }
      const mn = sn / n
      const md = sd / n
      let vnn = 0
      let vdd = 0
      let vnd = 0
      for (let i = 0; i < n; i++) {
        vnn += (num[i] - mn) ** 2
        vdd += (den[i] - md) ** 2
        vnd += (num[i] - mn) * (den[i] - md)
      }
      const ratio = sn / sd
      return { ratio, v: (vnn - 2 * ratio * vnd + ratio * ratio * vdd) / (n - 1) / (n * md * md) }
    }
    const ca = armVar(cn, cd)
    const ta = armVar(tn, td)
    expect(e.control).toBeCloseTo(ca.ratio, 14)
    expect(e.treatment).toBeCloseTo(ta.ratio, 14)
    expect(e.se).toBeCloseTo(Math.sqrt(ca.v + ta.v), 12)
    expect(e.p).toBeCloseTo(2 * normSf(Math.abs(e.diff / e.se)), 12)
    // Toplamların oranı, kullanıcı başına oranların ortalaması DEĞİLDİR
    let perUser = 0
    for (let i = 0; i < cn.length; i++) perUser += cn[i] / cd[i]
    expect(Math.abs(perUser / cn.length - e.control)).toBeGreaterThan(1e-6)
    // Paydası sabit 1 olan bölüm ölçüsü düz ortalamadır (z ile)
    const ones = new Float64Array(cn.length).fill(1)
    const onesT = new Float64Array(tn.length).fill(1)
    const flat = compareRatios(cn, ones, tn, onesT)
    const plain = compareMeans(cn, tn)
    expect(flat.diff).toBeCloseTo(plain.diff, 12)
    expect(flat.se).toBeCloseTo(plain.se, 12)
  })

  it('comparePairedRatios: paydası sabit ölçüde eşli t ile aynı', () => {
    const rng = rngFor(SEED, 'esli-bolum')
    const n = 80
    const c = Float64Array.from({ length: n }, () => 3 + normal(rng))
    const t = Float64Array.from(c, (v) => v + 0.2 + 0.5 * normal(rng))
    const ones = new Float64Array(n).fill(1)
    const r = comparePairedRatios(c, ones, t, ones)
    const p = comparePaired(c, t)
    expect(r.diff).toBeCloseTo(p.diff, 12)
    expect(r.se).toBeCloseTo(p.se, 12)
    expect(r.p).toBeCloseTo(p.p, 12)
    expect(r.lo).toBeCloseTo(p.lo, 12)
  })

  it('compareCuped: düzeltilmiş fark = ham fark − θ × (ön dönem farkı); θ havuzlanmış eğim', () => {
    const rng = rngFor(SEED, 'cuped-ozdeslik')
    const [c, cPre] = cupedArm(rng, 120, 0, 0.6)
    const [t, tPre] = cupedArm(rng, 140, 0.3, 0.6)
    const e = compareCuped(c, t, cPre, tPre)
    const raw = compareMeans(c, t)
    const pre = compareMeans(cPre, tPre)
    expect(e.diff).toBeCloseTo(raw.diff - e.theta * pre.diff, 12)
    // θ: iki kol birlikte, ortak ortalama etrafında cov(Y, X) / var(X)
    const xs = [...cPre, ...tPre]
    const ys = [...c, ...t]
    const mx = xs.reduce((s, v) => s + v, 0) / xs.length
    const my = ys.reduce((s, v) => s + v, 0) / ys.length
    let sxy = 0
    let sxx = 0
    let syy = 0
    xs.forEach((x, i) => {
      sxy += (x - mx) * (ys[i] - my)
      sxx += (x - mx) ** 2
      syy += (ys[i] - my) ** 2
    })
    expect(e.theta).toBeCloseTo(sxy / sxx, 12)
    expect(e.varianceReduction).toBeCloseTo((sxy * sxy) / (sxx * syy), 12)
    expect(e.method).toBe('CUPED')
  })
})

describe('CUPED', () => {
  const REPS = 1500

  it('ilişkili ön dönem ölçüsü aralığı √(1 − ρ²) oranında daraltır ve yansız kalır', () => {
    const rho = 0.8
    const rng = rngFor(SEED, 'cuped-kazanc')
    let ratio = 0
    let narrower = 0
    let s = 0
    let s2 = 0
    let theta = 0
    let vr = 0
    let rejectCuped = 0
    let rejectPlain = 0
    const delta = 0.15
    for (let r = 0; r < REPS; r++) {
      const [c, cPre] = cupedArm(rng, 200, 0, rho)
      const [t, tPre] = cupedArm(rng, 200, delta, rho)
      const e = compareCuped(c, t, cPre, tPre)
      const plain = compareMeans(c, t)
      const w = (e.hi - e.lo) / (plain.hi - plain.lo)
      ratio += w
      if (w < 1) narrower++
      s += e.diff - delta
      s2 += (e.diff - delta) ** 2
      theta += e.theta
      vr += e.varianceReduction
      if (e.p < 0.05) rejectCuped++
      if (plain.p < 0.05) rejectPlain++
    }
    expect(narrower).toBe(REPS)
    expect(ratio / REPS).toBeGreaterThan(Math.sqrt(1 - rho * rho) - 0.03)
    expect(ratio / REPS).toBeLessThan(Math.sqrt(1 - rho * rho) + 0.03)
    const bias = s / REPS
    expect(Math.abs(bias)).toBeLessThanOrEqual(5 * Math.sqrt((s2 / REPS - bias * bias) / REPS))
    // θ ≈ ρ σ_Y / σ_X = ρ; açıklanan varyans ≈ ρ²
    expect(theta / REPS).toBeGreaterThan(rho - 0.02)
    expect(theta / REPS).toBeLessThan(rho + 0.02)
    expect(vr / REPS).toBeGreaterThan(rho * rho - 0.03)
    expect(vr / REPS).toBeLessThan(rho * rho + 0.03)
    // Aynı veriyle güç belirgin biçimde artar
    expect(rejectCuped / REPS).toBeGreaterThan(rejectPlain / REPS + 0.2)
  })

  it('ilişkisiz ön dönem ölçüsü zarar vermez (aralık değişmez, ayar bozulmaz)', () => {
    const rng = rngFor(SEED, 'cuped-iliskisiz')
    let ratio = 0
    let reject = 0
    for (let r = 0; r < REPS; r++) {
      const [c, cPre] = cupedArm(rng, 150, 0, 0)
      const [t, tPre] = cupedArm(rng, 150, 0, 0)
      const e = compareCuped(c, t, cPre, tPre)
      const plain = compareMeans(c, t)
      ratio += (e.hi - e.lo) / (plain.hi - plain.lo)
      if (e.p < 0.05) reject++
    }
    expect(Math.abs(ratio / REPS - 1)).toBeLessThan(0.01)
    expect(reject / REPS).toBeGreaterThanOrEqual(0.03)
    expect(reject / REPS).toBeLessThanOrEqual(0.075)
  })

  it('kollar arası ön dönem dengesizliğini düzeltir (belirlenimci örnek)', () => {
    // Y = X: ham fark tümüyle ön dönem farkından gelir; CUPED onu siler
    const cPre = [1, 2, 3, 4, 5]
    const tPre = [3, 4, 5, 6, 7]
    const e = compareCuped(cPre, tPre, cPre, tPre)
    expect(compareMeans(cPre, tPre).diff).toBe(2)
    expect(e.theta).toBeCloseTo(1, 12)
    expect(e.diff).toBeCloseTo(0, 12)
    // Sabit ön dönem ölçüsü: düzeltme yok
    const flat = compareCuped([1, 2, 3, 4], [2, 3, 4, 6], [5, 5, 5, 5], [5, 5, 5, 5])
    expect(flat.theta).toBe(0)
    expect(flat.varianceReduction).toBe(0)
    expect(flat.diff).toBe(compareMeans([1, 2, 3, 4], [2, 3, 4, 6]).diff)
  })
})

describe('eşli çözümleme', () => {
  it('pozitif ilişkili çiftlerde eşsiz çözümlemeden dar aralık ve yüksek güç verir', () => {
    const rng = rngFor(SEED, 'esli-kazanc')
    const reps = 1500
    const n = 150
    let ratio = 0
    let narrower = 0
    let rejectPaired = 0
    let rejectUnpaired = 0
    for (let r = 0; r < reps; r++) {
      const c = new Float64Array(n)
      const t = new Float64Array(n)
      for (let i = 0; i < n; i++) {
        // Kullanıcı etkisi (sd 2) iki kolda ortak → korelasyon 0.8
        const u = 2 * normal(rng)
        c[i] = u + normal(rng)
        t[i] = u + 0.3 + normal(rng)
      }
      const p = comparePaired(c, t)
      const u = compareMeans(c, t)
      // Nokta kestirimi aynıdır; yalnız belirsizlik değişir
      expect(p.diff).toBeCloseTo(u.diff, 10)
      const w = (p.hi - p.lo) / (u.hi - u.lo)
      ratio += w
      if (w < 1) narrower++
      if (p.p < 0.05) rejectPaired++
      if (u.p < 0.05) rejectUnpaired++
    }
    expect(narrower).toBe(reps)
    // Kuramsal oran √(1 − ρ) = √0.2 ≈ 0.447
    expect(ratio / reps).toBeGreaterThan(0.4)
    expect(ratio / reps).toBeLessThan(0.5)
    expect(rejectPaired / reps).toBeGreaterThan(rejectUnpaired / reps + 0.3)
  })

  it('özdeş kollar tam sıfır fark verir (A/A ikiz evren)', () => {
    const x = [3, 1, 4, 1, 5, 9, 2, 6]
    const e = comparePaired(x, x)
    expect(e).toMatchObject({ diff: 0, se: 0, p: 1, lo: 0, hi: 0, probBetter: 0.5 })
    const r = comparePairedRatios(x, [1, 2, 1, 2, 1, 2, 1, 2], x, [1, 2, 1, 2, 1, 2, 1, 2])
    expect(r).toMatchObject({ diff: 0, se: 0, p: 1 })
  })
})

describe('örneklem oranı uyuşmazlığı (SRM)', () => {
  it('1000 / 1200 eşit paya göre bozuk, 1000 / 1010 uyumlu (scipy chisquare)', () => {
    const bad = sampleRatioMismatch([1000, 1200], [1, 1])
    expect(bad.ok).toBe(false)
    expect(bad.p).toBeCloseTo(2.007865612426481e-5, 14)
    const fine = sampleRatioMismatch([1000, 1010], [1, 1])
    expect(fine.ok).toBe(true)
    expect(fine.p).toBeCloseTo(0.8234966946547395, 12)
  })

  it('paylar ölçekten bağımsız; eşit olmayan paylar ve üç kol', () => {
    expect(sampleRatioMismatch([1000, 1010], [0.5, 0.5]).p).toBeCloseTo(sampleRatioMismatch([1000, 1010], [7, 7]).p, 14)
    // scipy.stats.chisquare([500, 1000, 1600], f_exp = 3100 × [1/6, 2/6, 3/6])
    const three = sampleRatioMismatch([500, 1000, 1600], [1, 2, 3])
    expect(three.p).toBeCloseTo(0.19930813677931292, 12)
    expect(three.ok).toBe(true)
    // 90 / 10 tasarımda 900 / 100 uyumlu, 800 / 200 bozuk
    expect(sampleRatioMismatch([900, 100], [9, 1])).toMatchObject({ p: 1, ok: true })
    expect(sampleRatioMismatch([800, 200], [9, 1]).ok).toBe(false)
  })

  it('doğru atamada yanlış alarm nadir, %45 / %55 kaymada hep yakalanır', () => {
    const rng = rngFor(SEED, 'srm')
    const reps = 1500
    let falseAlarm = 0
    let caught = 0
    for (let r = 0; r < reps; r++) {
      let a = 0
      for (let i = 0; i < 2000; i++) if (rng() < 0.5) a++
      if (!sampleRatioMismatch([a, 2000 - a], [1, 1]).ok) falseAlarm++
      let b = 0
      for (let i = 0; i < 4000; i++) if (rng() < 0.45) b++
      if (!sampleRatioMismatch([b, 4000 - b], [1, 1]).ok) caught++
    }
    // Eşik p < 0.001 → beklenen yanlış alarm ≈ %0.1
    expect(falseAlarm / reps).toBeLessThanOrEqual(0.005)
    expect(caught / reps).toBeGreaterThan(0.95)
  })
})

describe('güç ve örneklem', () => {
  it('requiredSampleSize(sd, MDE(sd, n)) ≈ n ve MDE noktasında güç ≈ 0.8', () => {
    for (const sd of [0.4, 1, 37.5]) {
      for (const n of [50, 333, 1000, 25_000, 1_000_000]) {
        const mde = minimumDetectableEffect(sd, n)
        const back = requiredSampleSize(sd, mde)
        // Yukarı yuvarlama ve kayan nokta: n ya da n + 1
        expect(back).toBeGreaterThanOrEqual(n)
        expect(back).toBeLessThanOrEqual(n + 1)
        expect(achievedPower(sd, mde, n)).toBeCloseTo(0.8, 10)
        expect(achievedPower(sd, -mde, n)).toBeCloseTo(0.8, 10)
        expect(achievedPower(sd, minimumDetectableEffect(sd, n, 0.01, 0.9), n, 0.01)).toBeCloseTo(0.9, 10)
      }
    }
  })

  it('statsmodels NormalIndPower ile uyumlu (tek kuyruk yaklaşıklığı payıyla)', () => {
    // solve_power(nobs1=1000, alpha=0.05, power=0.8) → d = 0.12529034…
    expect(minimumDetectableEffect(1, 1000) / 0.1252903452971738 - 1).toBeLessThan(1e-5)
    expect(Math.abs(minimumDetectableEffect(1, 250, 0.01, 0.9) / 0.34501644249885693 - 1)).toBeLessThan(1e-5)
    // solve_power(effect_size=0.2) → 392.44 → 393; (0.05, güç 0.9) → 8405.94 → 8406
    expect(requiredSampleSize(1, 0.2)).toBe(393)
    expect(requiredSampleSize(1, 0.05, 0.05, 0.9)).toBe(8406)
    // Ölçek değişmezliği: sd ve fark aynı oranda büyürse örneklem değişmez
    expect(requiredSampleSize(10, 2)).toBe(393)
    expect(Math.abs(achievedPower(1, 0.1, 1500) - 0.7819079987319799)).toBeLessThan(1e-5)
    expect(Math.abs(achievedPower(1, 0.3, 100, 0.01) - 0.324732591308873)).toBeLessThan(1e-5)
  })

  it('tekdüzelik ve sınır değerleri', () => {
    // MDE ∝ 1 / √n; güç n ve fark ile artar
    expect(minimumDetectableEffect(1, 400) / minimumDetectableEffect(1, 100)).toBeCloseTo(0.5, 12)
    let prev = 0
    for (const n of [10, 50, 200, 1000, 5000]) {
      const p = achievedPower(1, 0.1, n)
      expect(p).toBeGreaterThan(prev)
      prev = p
    }
    prev = 0
    for (const d of [0.01, 0.05, 0.1, 0.2, 0.5]) {
      const p = achievedPower(1, d, 300)
      expect(p).toBeGreaterThan(prev)
      prev = p
    }
    expect(requiredSampleSize(1, 0)).toBe(Infinity)
    expect(requiredSampleSize(1, 0.1)).toBeGreaterThan(requiredSampleSize(1, 0.2))
    expect(requiredSampleSize(1, 0.1, 0.05, 0.9)).toBeGreaterThan(requiredSampleSize(1, 0.1, 0.05, 0.8))
    expect(requiredSampleSize(1, 0.1, 0.01)).toBeGreaterThan(requiredSampleSize(1, 0.1, 0.05))
    // Fark yoksa "güç" yanlış alarmın tek kuyruğudur
    expect(achievedPower(1, 0, 100)).toBeCloseTo(0.025, 10)
  })

  it('hesaplanan güç simülasyonla doğrulanır (MDE noktasında ≈ %80 ret)', () => {
    const rng = rngFor(SEED, 'guc-simulasyon')
    const n = 150
    const sd = 2
    const mde = minimumDetectableEffect(sd, n)
    const reps = 2000
    let reject = 0
    for (let r = 0; r < reps; r++) {
      const c = Float64Array.from({ length: n }, () => sd * normal(rng))
      const t = Float64Array.from({ length: n }, () => mde + sd * normal(rng))
      if (compareMeans(c, t).p < 0.05) reject++
    }
    expect(reject / reps).toBeGreaterThan(0.76)
    expect(reject / reps).toBeLessThan(0.84)
  })
})

describe('çoklu karşılaştırma (adjustP)', () => {
  it('ham p değerinden küçük olmaz, sırayı korur ve Benjamini–Hochberg ile aynıdır', () => {
    const rng = rngFor(SEED, 'adjust')
    for (let rep = 0; rep < 200; rep++) {
      const ps = Array.from({ length: 1 + Math.floor(rng() * 15) }, () => (rng() < 0.3 ? rng() * 0.01 : rng()))
      const adj = adjustP(ps)
      expect(adj).toEqual(benjaminiHochberg(ps))
      expect(adj).toHaveLength(ps.length)
      const order = ps.map((_, i) => i).sort((x, y) => ps[x] - ps[y])
      order.forEach((i, k) => {
        // p · m / m yuvarlaması için son basamakta pay
        expect(adj[i]).toBeGreaterThanOrEqual(ps[i] - 1e-15)
        expect(adj[i]).toBeLessThanOrEqual(1)
        if (k > 0) expect(adj[i]).toBeGreaterThanOrEqual(adj[order[k - 1]])
      })
      // En büyük p değişmez; tek sınamada düzeltme yok
      const last = order[order.length - 1]
      expect(adj[last]).toBeCloseTo(ps[last], 14)
    }
    expect(adjustP([0.03])).toEqual([0.03])
    expect(adjustP([])).toEqual([])
    // Girdi sırası korunur
    expect(adjustP([0.04, 0.001, 0.03])).toEqual([0.04, 0.003, 0.04])
  })

  it('yanlış keşif oranını denetler (20 ölçü, 15 gerçek sıfır)', () => {
    const rng = rngFor(SEED, 'fdr')
    const reps = 2000
    let fdp = 0
    let anyFalse = 0
    let truePositives = 0
    for (let r = 0; r < reps; r++) {
      const ps: number[] = []
      // Sıfır doğru: p düzgün dağılır; etki var: z ~ N(3.5, 1)
      for (let i = 0; i < 15; i++) ps.push(rng())
      for (let i = 0; i < 5; i++) ps.push(2 * normSf(Math.abs(3.5 + normal(rng))))
      const adj = adjustP(ps)
      let falsePos = 0
      let hits = 0
      adj.forEach((p, i) => {
        if (p < 0.05) {
          hits++
          if (i < 15) falsePos++
        }
      })
      if (hits > 0) fdp += falsePos / hits
      if (falsePos > 0) anyFalse++
      truePositives += hits - falsePos
    }
    // Beklenen FDR ≤ 0.05 × 15 / 20 = 0.0375
    expect(fdp / reps).toBeLessThanOrEqual(0.05)
    expect(fdp / reps).toBeGreaterThan(0.02)
    // Düzeltmesiz olsaydı en az bir yanlış keşif olasılığı 1 − 0.95¹⁵ ≈ %54 olurdu
    expect(anyFalse / reps).toBeLessThan(0.3)
    expect(truePositives / reps / 5).toBeGreaterThan(0.75)
  })

  it('bir ölçünün p değeri tanımsızsa (NaN) diğerlerinin düzeltilmiş p değeri bozulmaz', () => {
    // Paydası sıfır olan bir bölüm ölçüsü NaN p döndürebilir (bkz. compareRatios); bu, öbür ölçüleri gizlememeli
    for (const ps of [
      [0.001, NaN, 0.04],
      [NaN, 0.001, 0.04],
      [0.001, 0.04, NaN],
    ]) {
      const adj = adjustP(ps)
      ps.forEach((p, i) => {
        if (Number.isNaN(p)) return
        expect(Number.isFinite(adj[i]), `girdi ${JSON.stringify(ps)} → ${JSON.stringify(adj)}`).toBe(true)
        expect(adj[i]).toBeGreaterThanOrEqual(p - 1e-15)
        expect(adj[i]).toBeLessThanOrEqual(1)
      })
    }
  })
})

describe('her an geçerli p (alwaysValidP)', () => {
  it('kapalı biçim: 1 / Λ, Λ = √(V / (V + τ²)) · exp(τ² Δ² / (2 V (V + τ²)))', () => {
    const cases: [number, number, number][] = [
      [0.5, 0.2, 0.1],
      [3, 1, 1],
      [-0.08, 0.02, 0.05],
      [0.3, 0.05, 2],
    ]
    for (const [diff, se, tau] of cases) {
      const v = se * se
      const t2 = tau * tau
      const expected = Math.min(1, Math.sqrt((v + t2) / v) * Math.exp((-t2 * diff * diff) / (2 * v * (v + t2))))
      expect(alwaysValidP(diff, se, tau)).toBeCloseTo(expected, 14)
      expect(alwaysValidP(-diff, se, tau)).toBe(alwaysValidP(diff, se, tau))
    }
    expect(alwaysValidP(3, 1, 1)).toBeCloseTo(0.14905701283899597, 14)
    // Fark yoksa ya da belirsizlik / etki ölçeği tanımsızsa 1
    expect(alwaysValidP(0, 1, 1)).toBe(1)
    expect(alwaysValidP(3, 0, 1)).toBe(1)
    expect(alwaysValidP(3, 1, 0)).toBe(1)
  })

  it('aynı veride sabit ufuklu p değerinden hiçbir zaman küçük değildir; farkla azalır', () => {
    const rng = rngFor(SEED, 'her-an-izgara')
    for (let i = 0; i < 20_000; i++) {
      const se = Math.exp(6 * (rng() - 0.5))
      const z = 8 * (rng() - 0.5)
      const tau = se * Math.exp(8 * (rng() - 0.5))
      const always = alwaysValidP(z * se, se, tau)
      const fixed = 2 * normSf(Math.abs(z))
      expect(always).toBeGreaterThanOrEqual(fixed)
      expect(always).toBeLessThanOrEqual(1)
      expect(always).toBeGreaterThan(0)
    }
    // Küçük farklarda 1'e kırpılır; sonra farkla kesin azalır
    expect(alwaysValidP(0.5, 1, 1)).toBe(1)
    let prev = 1
    for (const diff of [2, 3, 4, 6, 9]) {
      const p = alwaysValidP(diff, 1, 1)
      expect(p).toBeLessThan(prev)
      prev = p
    }
  })

  describe('tekrar tekrar bakma (simülasyon)', () => {
    const RUNS = 1500
    const STEP = 100
    const LOOKS = 30
    const TAU = 0.1

    /** Her bakışta düz p ve her an geçerli p: şimdiye dek görülen en küçükleri. */
    function peek(rng: Rng, effect: number): { naive: number; always: number; final: number; firstAlways: number } {
      const total = STEP * LOOKS
      const c = new Float64Array(total)
      const t = new Float64Array(total)
      for (let i = 0; i < total; i++) {
        c[i] = normal(rng)
        t[i] = effect + normal(rng)
      }
      let naive = 1
      let always = 1
      let final = 1
      let firstAlways = -1
      for (let look = 1; look <= LOOKS; look++) {
        const n = look * STEP
        const e = compareMeans(c.subarray(0, n), t.subarray(0, n))
        naive = Math.min(naive, e.p)
        const av = alwaysValidP(e.diff, e.se, TAU)
        // Aynı bakışta her an geçerli p düz p'den küçük olamaz
        if (av < e.p) throw new Error(`her an geçerli p (${av}) düz p'den (${e.p}) küçük`)
        if (av < 0.05 && firstAlways < 0) firstAlways = n
        always = Math.min(always, av)
        final = e.p
      }
      return { naive, always, final, firstAlways }
    }

    it(`sıfır etki altında ${LOOKS} bakışta yanlış alarm ≤ %5 kalır; düz p ile bakmak onu katlar`, () => {
      const rng = rngFor(SEED, 'her-an-sifir')
      let naive = 0
      let always = 0
      let final = 0
      for (let r = 0; r < RUNS; r++) {
        const x = peek(rng, 0)
        if (x.naive < 0.05) naive++
        if (x.always < 0.05) always++
        if (x.final < 0.05) final++
      }
      expect(always / RUNS).toBeLessThanOrEqual(0.05)
      // Tek bakış (planlanan son) ayarlıdır; her bakışta düz p'ye göre durmak yanlış alarmı birkaç katına çıkarır
      expect(final / RUNS).toBeGreaterThanOrEqual(0.03)
      expect(final / RUNS).toBeLessThanOrEqual(0.075)
      expect(naive / RUNS).toBeGreaterThan(0.2)
      expect(naive / RUNS).toBeGreaterThan(4 * Math.max(always / RUNS, 0.01))
    }, 60_000)

    it('gerçek etkide çoğu koşuda planlanan sondan önce karar verdirir', () => {
      const rng = rngFor(SEED, 'her-an-etki')
      const runs = 400
      let detected = 0
      let stopSum = 0
      for (let r = 0; r < runs; r++) {
        const x = peek(rng, 0.12)
        if (x.firstAlways > 0) {
          detected++
          stopSum += x.firstAlways
        }
      }
      expect(detected / runs).toBeGreaterThan(0.9)
      expect(stopSum / detected).toBeLessThan(0.75 * STEP * LOOKS)
    }, 60_000)
  })
})

describe('bilgi içermeyen girdiler', () => {
  it('sabit girdiler: fark yoksa p = 1, sıfır varyanslı gerçek fark kesin sayılır', () => {
    expect(compareMeans([2, 2, 2], [2, 2])).toMatchObject({ diff: 0, se: 0, p: 1, probBetter: 0.5 })
    expect(compareMeans([1, 1, 1], [2, 2, 2])).toMatchObject({ diff: 1, se: 0, p: 0, lo: 1, hi: 1, probBetter: 1 })
    expect(compareProportions([0, 0, 0], [0, 0])).toMatchObject({ diff: 0, se: 0, p: 1 })
    expect(compareProportions([1, 1, 1], [1, 1])).toMatchObject({ diff: 0, se: 0, p: 1 })
    expect(comparePaired([1, 2, 3], [1, 2, 3])).toMatchObject({ diff: 0, se: 0, p: 1 })
    // Kontrol ortalaması 0 ise göreli fark tanımsızdır
    expect(compareMeans([-1, 0, 1], [1, 2, 3]).rel).toBeNaN()
  })

  it('boş kol, tek gözlem ya da sıfır payda anlamlı sonuç (p < 0.05) üretmez', () => {
    // Boş kolun ortalaması NaN'dır; tek gözlemin varyansı, paydası sıfır olan oranın değeri bilinemez.
    // Böyle girdilerde p ya tanımsız (NaN) ya da 1 olmalı; "p = 0" kararı yanıltır (bkz. run.ts evaluate → verdict).
    const cases: [string, Estimate][] = [
      ['compareMeans: boş kontrol', compareMeans([], [1, 2, 3])],
      ['compareMeans: iki kol da boş', compareMeans([], [])],
      ['compareMeans: kol başına tek gözlem', compareMeans([1], [2])],
      ['compareProportions: boş kontrol', compareProportions([], [1, 0, 1])],
      ['compareRatios: bir kolda payda sıfır', compareRatios([0, 0, 0], [0, 0, 0], [1, 2, 3], [4, 5, 6])],
      ['compareRatios: iki kolda payda sıfır', compareRatios([0, 0, 0], [0, 0, 0], [0, 0], [0, 0])],
      ['compareRatios: boş kontrol', compareRatios([], [], [1, 2, 3], [4, 5, 6])],
      ['comparePaired: boş', comparePaired([], [])],
      ['comparePaired: tek çift', comparePaired([1], [2])],
      ['comparePairedRatios: kontrolde payda sıfır', comparePairedRatios([0, 0], [0, 0], [1, 2], [3, 4])],
      ['compareCuped: boş', compareCuped([], [], [], [])],
    ]
    const significant = cases.filter(([, e]) => e.p < 0.05).map(([name, e]) => `${name} → p = ${e.p}`)
    expect(significant, 'bilgi içermeyen girdide p < 0.05').toEqual([])
  })
})
