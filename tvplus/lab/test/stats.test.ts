/**
 * İstatistik çekirdeği (lab/src/core/stats.ts): özel işlevler, dağılımlar, özetler, güven aralıkları, sınamalar,
 * sağkalım ve lojistik regresyon. Değerler scipy / statsmodels / lifelines / scikit-learn ile üretilmiş başvurularla
 * (fixtures/stats-ref.json ve bu dosyadaki EK sabitleri) karşılaştırılır; ayrıca özdeşlikler ve kenar durumları.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { normal, rngFor } from '../src/core/rng'
import {
  auc,
  benjaminiHochberg,
  betaInc,
  calibration,
  chi2Gof,
  chi2Sf,
  cholesky,
  choleskyInverseDiag,
  choleskySolve,
  erf,
  erfc,
  gammaP,
  gammaQ,
  holm,
  kaplanMeier,
  kmAt,
  kmMedian,
  lgamma,
  liftAt,
  logistic,
  logisticPredict,
  logLoss,
  logRank,
  mantelHaenszelRR,
  mean,
  median,
  moments,
  normCdf,
  normInv,
  normPdf,
  normSf,
  pearson,
  quantile,
  quantiles,
  quantileSorted,
  sd,
  sigmoid,
  softplus,
  solveSymmetric,
  sortedCopy,
  tCdf,
  tInv,
  tTwoSided,
  twoProportion,
  variance,
  welch,
  wilson,
  type Stratum,
} from '../src/core/stats'

interface StatsRef {
  lgamma: [number, number][]
  gammaP: [number, number, number, number][]
  betaInc: [number, number, number, number][]
  erf: [number, number, number][]
  norm: [number, number, number][]
  normInv: [number, number][]
  t: [number, number, number, number][]
  tInv: [number, number, number][]
  chi2: [number, number, number][]
  welch: { a: number[]; b: number[]; stat: number; p: number; df: number; lo: number; hi: number }
  prop: {
    ka: number
    na: number
    kb: number
    nb: number
    z: number
    p: number
    wilson: [number, number, number, number]
  }
  gof: { obs: number[]; exp: number[]; stat: number; p: number }
  mt: { p: number[]; bh: number[]; holm: number[] }
  auc: { s: number[]; y: number[]; auc: number }
  km: { t: number[]; e: number[]; g: number[]; times: number[]; s: number[]; median: number }
  logrank: { stat2: number; p2: number; stat3: number; p3: number }
  logit: { X: number[]; y: number[]; n: number; p: number; coef: number[]; se: number[]; ll: number }
  mh: { strata: [number, number, number, number][]; rr: number; lo: number; hi: number }
}

const ref = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'stats-ref.json'), 'utf8')) as StatsRef

/**
 * Ek başvuru değerleri: fixtures/stats-ref.json'daki aynı verilerle scipy 1.18, statsmodels 0.15 ve scikit-learn 1.9
 * kullanılarak hesaplandı (Python depoya eklenmedi; değerler buraya elle taşındı).
 */
const EK = {
  // numpy.quantile (doğrusal ara değer), numpy.var(ddof=1), numpy.corrcoef
  x: [3.5, -1.25, 0.0, 7.75, 2.0, 2.0, 9.5, -4.0, 1.5, 6.25, 0.5],
  y: [2.0, 0.5, -1.0, 6.5, 2.5, 1.0, 12.0, -2.5, 0.0, 5.0, 1.5],
  q: [0, 0.1, 0.25, 0.5, 0.9, 0.975, 1],
  qv: [-4.0, -1.25, 0.25, 2.0, 7.75, 9.0625, 9.5],
  mean: 2.522727272727273,
  var: 15.968181818181819,
  sd: 3.9960207479668846,
  pearson: 0.9306556694535228,
  // scipy.stats.ttest_ind(b, a, equal_var=False).confidence_interval(…)
  welch: {
    diff: 0.4105769271128512,
    se: 0.6238697539461681,
    lo90: -0.6204288107509195,
    hi90: 1.4415826649766215,
    lo99: -1.2120622339616813,
    hi99: 2.033216088187384,
  },
  // statsmodels confint_proportions_2indep(method='wald')
  prop: { lo: 0.004264788441368031, hi: 0.07496598078940124, lo90: 0.00994822910110954, hi90: 0.06928254012965973 },
  // statsmodels proportion_confint(method='wilson'): [k, n, güven, alt, üst]
  wilson: [
    [0, 25, 0.95, 0, 0.13319225093904846],
    [25, 25, 0.95, 0.8668077490609515, 1],
    [3, 1000, 0.99, 0.0007581012310614674, 0.01179351668292492],
    [37, 210, 0.9, 0.1371445354971027, 0.2234739148191649],
    [1, 1, 0.95, 0.20654931437723745, 1],
    [500, 1000, 0.999, 0.4482516044524614, 0.5517483955475386],
  ],
  // statsmodels SurvfuncRight (Greenwood): [olay dizini, t, risk altında, olay, S, se]
  kmPoints: 86,
  km: [
    [0, 2.0, 177, 2, 0.9887005649717514, 0.007944638172079315],
    [5, 7.0, 160, 2, 0.9138826027136361, 0.021261802468859173],
    [20, 17.0, 119, 2, 0.7313578298015552, 0.034366044558039925],
    [47, 43.2, 69, 2, 0.49718165606511056, 0.040694807919332936],
    [70, 78.0, 29, 1, 0.26999852465743224, 0.03914367307371953],
    [85, 184.79999999999998, 3, 1, 0.04255528605103029, 0.02648072051398636],
  ],
  // statsmodels Logit: Wald z, p ve ilk 8 gözlemin olasılığı
  logitZ: [
    -4.965795557410342, 4.6801726920758036, -4.458479313416007, -0.22478030440438407, 2.120583614528632,
    3.325411666241493,
  ],
  logitP: [
    6.842000377702823e-7, 2.866333756656474e-6, 8.254316135916798e-6, 0.8221501888233232, 0.03395685822772042,
    0.000882880713455534,
  ],
  logitPred: [
    0.1851537171906736, 0.5843358350044263, 0.15156474945907195, 0.23016304326757034, 0.16946909117030387,
    0.10635370463117041, 0.4516276680649096, 0.6220891894448475,
  ],
  // statsmodels GLM(Binomial, freq_weights = 1 + (i mod 3))
  weighted: {
    coef: [
      -0.8612275704498407, 0.7699151551330711, -0.7773025541725864, 0.1336102068265994, 0.31502753806185896,
      1.3027604775105948,
    ],
    se: [
      0.12494124246887649, 0.12230867669069315, 0.11707906440746016, 0.10294267176722134, 0.11192241453225954,
      0.2414413667923053,
    ],
    ll: -285.0080988944167,
  },
  // scikit-learn LogisticRegression(C = 1 / l2, solver='newton-cholesky'): [kesişim, β…]
  l2: {
    1: [
      -0.8262390290799422, 0.7702629593292334, -0.6942480868761892, -0.03422875398373365, 0.310015631067052,
      0.9938250486470258,
    ],
    0.5: [
      -0.8456323487234507, 0.7856468173594878, -0.7092406728911358, -0.033326820300866394, 0.3168015626080457,
      1.051227293690881,
    ],
  },
  // sklearn.metrics.log_loss / roc_auc_score (lojistik modelin olasılıklarıyla)
  logLoss: 0.5589568244501066,
  aucPred: 0.773236039824377,
  // Mantel–Haenszel: iki yönlü p ve %90 aralık (Greenland–Robins varyansından)
  mh: { p: 1.297440485573581e-6, lo90: 1.574915253232651, hi90: 2.5138709770107948 },
  // scipy.stats: büyük parametrelerde (yineleme sınırına yakın) değerler
  tBuyuk: [
    // [t, sd, iki yönlü p]
    [2, 2e6, 0.04550039887380676],
    [2, 1e8, 0.04550026659590669],
    [3.3, 5e5, 0.0009669158746198923],
    [0.5, 3e6, 0.6170751141254435],
    [0.01, 3e6, 0.9920212880356737],
    [6, 2e7, 1.973209011473397e-9],
  ],
  gammaBuyuk: [
    // [a, x, P, Q]
    [20000, 20000, 0.5009403162337493, 0.49905968376625065],
    [1e5, 1e5 + 300, 0.8286363112512075, 0.17136368874879243],
    [5000, 5100, 0.9206711189223811, 0.07932888107761896],
  ],
  betaBuyuk: [
    // [a, b, x, I]
    [5e5, 0.5, 0.999996, 0.04550010192315519],
    [3000, 4000, 0.43, 0.5958415156690128],
    [1e5, 2e5, 0.3334, 0.5310411685846465],
  ],
  lgammaEk: [
    [1e-5, 11.512919692895826],
    [0.3, 1.0957979948180756],
    [171.5, 709.1431630309283],
    [1e6, 12815504.569147611],
  ],
  normInvEk: [
    [1e-300, -37.0470962993612],
    [1 - 1e-12, 7.0344869100478356],
    [0.02425, -1.972961051311885],
  ],
  tInvEk: [
    // [p, sd, değer]
    [1e-9, 3, -1033.1096745038078],
    [0.999, 0.5, 102849.11563017538],
    [0.975, 1e6, 1.959966356814107],
  ],
} as const

const relErr = (got: number, exp: number): number =>
  got === exp ? 0 : Math.abs(got - exp) / Math.max(Math.abs(exp), 1e-300)

/** Göreli yakınlık (beklenen 0 ise mutlak). */
function near(got: number, exp: number, tol: number, label = ''): void {
  const err = exp === 0 ? Math.abs(got) : relErr(got, exp)
  expect(err, `${label} beklenen ${exp}, bulunan ${got} (hata ${err.toExponential(2)})`).toBeLessThanOrEqual(tol)
}

/** Özel işlevler ve dağılımlar için hoşgörü (göreli) */
const TOL = 1e-10
/** Sınama istatistikleri, p değerleri ve aralıklar için hoşgörü (göreli) */
const TOL_TEST = 1e-8

const strataOf = (rows: readonly (readonly [number, number, number, number])[]): Stratum[] =>
  rows.map(([a, n1, c, n0]) => ({ a, n1, c, n0 }))

describe('özel işlevler', () => {
  it('lgamma başvuru değerleriyle uyuşur', () => {
    for (const [x, v] of ref.lgamma) near(lgamma(x), v, TOL, `lgamma(${x})`)
    for (const [x, v] of EK.lgammaEk) near(lgamma(x), v, TOL, `lgamma(${x})`)
  })

  it('lgamma: faktöriyel ve bilinen kapalı biçimler', () => {
    let logFact = 0
    for (let n = 1; n <= 25; n++) {
      logFact += Math.log(n)
      near(lgamma(n + 1), logFact, 1e-12, `ln(${n}!)`)
    }
    near(lgamma(0.5), 0.5 * Math.log(Math.PI), 1e-13, 'ln Γ(½)')
    near(lgamma(1.5), Math.log(Math.sqrt(Math.PI) / 2), 1e-13, 'ln Γ(3/2)')
    // Γ(x + 1) = x Γ(x)
    for (const x of [0.2, 0.7, 3.3, 12.5, 80.25]) near(lgamma(x + 1) - lgamma(x), Math.log(x), 1e-11, `yineleme x=${x}`)
  })

  it('gammaP ve gammaQ başvuru değerleriyle uyuşur (kuyruk duyarlılığı dahil)', () => {
    for (const [a, x, p, q] of ref.gammaP) {
      near(gammaP(a, x), p, TOL, `P(${a}, ${x})`)
      near(gammaQ(a, x), q, TOL, `Q(${a}, ${x})`)
    }
  })

  it('gammaP + gammaQ = 1, sınırlar ve tekdüzelik', () => {
    for (const a of [0.3, 1, 2.5, 17, 120]) {
      let prev = 0
      for (const x of [0.001, 0.2, 1, 3, 9, 30, 150, 600]) {
        const p = gammaP(a, x)
        expect(p).toBeGreaterThanOrEqual(prev)
        expect(p).toBeLessThanOrEqual(1)
        expect(Math.abs(p + gammaQ(a, x) - 1)).toBeLessThanOrEqual(1e-14)
        prev = p
      }
    }
    expect(gammaP(2, 0)).toBe(0)
    expect(gammaQ(2, 0)).toBe(1)
    expect(gammaP(2, -1)).toBe(0)
    // P(1, x) = 1 − e^{−x}
    for (const x of [0.01, 0.5, 2, 10]) near(gammaP(1, x), -Math.expm1(-x), 1e-13, `P(1, ${x})`)
  })

  it('gammaP büyük a değerlerinde de doğru (seri / sürekli kesir sınırına yakın)', () => {
    for (const [a, x, p, q] of EK.gammaBuyuk) {
      near(gammaP(a, x), p, 1e-8, `P(${a}, ${x})`)
      near(gammaQ(a, x), q, 1e-8, `Q(${a}, ${x})`)
    }
  })

  it('betaInc başvuru değerleriyle uyuşur', () => {
    for (const [a, b, x, v] of ref.betaInc) near(betaInc(a, b, x), v, TOL, `I_${x}(${a}, ${b})`)
    for (const [a, b, x, v] of EK.betaBuyuk) near(betaInc(a, b, x), v, 1e-8, `I_${x}(${a}, ${b})`)
  })

  it('betaInc: simetri, sınırlar ve kapalı biçimler', () => {
    for (const [a, b] of [
      [0.5, 0.5],
      [2, 3],
      [9.5, 0.7],
      [40, 12],
    ]) {
      let prev = 0
      for (const x of [0.001, 0.05, 0.3, 0.5, 0.77, 0.95, 0.999]) {
        const v = betaInc(a, b, x)
        expect(v).toBeGreaterThanOrEqual(prev)
        expect(Math.abs(v + betaInc(b, a, 1 - x) - 1)).toBeLessThanOrEqual(1e-13)
        prev = v
      }
    }
    expect(betaInc(2, 3, 0)).toBe(0)
    expect(betaInc(2, 3, 1)).toBe(1)
    expect(betaInc(2, 3, -0.5)).toBe(0)
    expect(betaInc(2, 3, 1.5)).toBe(1)
    for (const x of [0.1, 0.4, 0.9]) {
      near(betaInc(1, 1, x), x, 1e-13, 'I_x(1, 1) = x')
      near(betaInc(3, 1, x), x ** 3, 1e-13, 'I_x(a, 1) = x^a')
      near(betaInc(1, 4, x), 1 - (1 - x) ** 4, 1e-13, 'I_x(1, b) = 1 − (1 − x)^b')
    }
  })

  it('erf ve erfc başvuru değerleriyle uyuşur; tek işlev ve tümleyen', () => {
    for (const [x, e, c] of ref.erf) {
      near(erf(x), e, TOL, `erf(${x})`)
      near(erfc(x), c, TOL, `erfc(${x})`)
    }
    for (const x of [0.01, 0.3, 1, 2.2, 5]) {
      expect(erf(-x)).toBe(-erf(x))
      expect(Math.abs(erf(x) + erfc(x) - 1)).toBeLessThanOrEqual(1e-15)
      expect(Math.abs(erfc(-x) - (2 - erfc(x)))).toBeLessThanOrEqual(1e-15)
    }
    expect(erf(0)).toBe(0)
    expect(erfc(0)).toBe(1)
  })
})

describe('dağılımlar', () => {
  it('normal: birikimli dağılım ve üst kuyruk', () => {
    for (const [z, c, s] of ref.norm) {
      near(normCdf(z), c, TOL, `Φ(${z})`)
      near(normSf(z), s, TOL, `1 − Φ(${z})`)
    }
    near(normSf(10), 7.61985302416047e-24, TOL, '1 − Φ(10)')
    expect(normCdf(0)).toBe(0.5)
    near(normPdf(0), 1 / Math.sqrt(2 * Math.PI), 1e-15, 'φ(0)')
    near(normPdf(1.5), Math.exp(-1.125) / Math.sqrt(2 * Math.PI), 1e-15, 'φ(1.5)')
    for (const z of [0.1, 1, 2.5, 6]) {
      expect(normCdf(-z)).toBe(normSf(z))
      expect(Math.abs(normCdf(z) + normSf(z) - 1)).toBeLessThanOrEqual(1e-15)
    }
  })

  it('normInv başvuru değerleriyle uyuşur', () => {
    for (const [p, z] of ref.normInv) near(normInv(p), z, TOL, `Φ⁻¹(${p})`)
    for (const [p, z] of EK.normInvEk) near(normInv(p), z, TOL, `Φ⁻¹(${p})`)
    expect(normInv(0.5)).toBe(0)
    expect(normInv(0)).toBe(-Infinity)
    expect(normInv(1)).toBe(Infinity)
  })

  it('normInv(normCdf(x)) ≈ x ve tek işlev simetrisi', () => {
    for (let x = -8; x <= 5; x += 0.25) near(normInv(normCdf(x)), x, 1e-9, `gidiş-dönüş x=${x}`)
    // Üst kuyrukta 1 − Φ(x) üzerinden (p 1'e yaklaşınca çözünürlük yetmez)
    for (let x = 0.25; x <= 8; x += 0.25) near(-normInv(normSf(x)), x, 1e-9, `üst kuyruk x=${x}`)
    for (const p of [1e-12, 1e-6, 0.003, 0.1, 0.31, 0.49]) near(normInv(1 - p), -normInv(p), 1e-6, `simetri p=${p}`)
    // Üç bölgenin sınırlarında süreklilik (Acklam kırılma noktaları)
    for (const p of [0.02425, 1 - 0.02425]) {
      const eps = 1e-9
      expect(Math.abs(normInv(p + eps) - normInv(p - eps))).toBeLessThan(1e-6)
    }
  })

  it('Student t: birikimli dağılım ve iki yönlü p', () => {
    for (const [t, df, c, two] of ref.t) {
      near(tCdf(t, df), c, TOL, `tCdf(${t}, ${df})`)
      near(tTwoSided(t, df), two, TOL, `tTwoSided(${t}, ${df})`)
    }
    // sd = 1 → Cauchy
    for (const t of [-7, -0.4, 0, 0.9, 25]) near(tCdf(t, 1), 0.5 + Math.atan(t) / Math.PI, 1e-12, `Cauchy t=${t}`)
    for (const df of [1, 3.5, 12, 80]) {
      expect(tCdf(0, df)).toBe(0.5)
      expect(tTwoSided(0, df)).toBe(1)
      for (const t of [0.2, 1.3, 4]) {
        expect(Math.abs(tCdf(-t, df) + tCdf(t, df) - 1)).toBeLessThanOrEqual(1e-15)
        near(tTwoSided(t, df), 2 * tCdf(-t, df), 1e-13, 'iki yönlü = 2 × alt kuyruk')
        expect(tTwoSided(-t, df)).toBe(tTwoSided(t, df))
      }
    }
    expect(tCdf(Infinity, 5)).toBe(1)
    expect(tCdf(-Infinity, 5)).toBe(0)
    expect(tTwoSided(Infinity, 5)).toBe(0)
  })

  it('Student t büyük serbestlik derecesinde normale yaklaşır (yineleme sınırında duyarlılık ≥ 1e-6)', () => {
    for (const [t, df, p] of EK.tBuyuk) near(tTwoSided(t, df), p, 1e-6, `tTwoSided(${t}, ${df})`)
    near(tCdf(1.5, 1e7), 0.9331927829461852, 1e-6, 'tCdf(1.5, 1e7)')
    for (const z of [0.3, 1.96, 3.2]) near(tTwoSided(z, 1e9), 2 * normSf(z), 1e-5, `sd → ∞, z=${z}`)
  })

  it('tInv başvuru değerleriyle uyuşur ve tCdf ile gidiş-dönüş tutar', () => {
    for (const [p, df, v] of ref.tInv) near(tInv(p, df), v, TOL, `tInv(${p}, ${df})`)
    for (const [p, df, v] of EK.tInvEk) near(tInv(p, df), v, TOL, `tInv(${p}, ${df})`)
    for (const df of [1, 2.7, 9, 44, 900]) {
      expect(tInv(0.5, df)).toBe(0)
      for (const t of [-12, -2.1, -0.3, 0.8, 3.4]) near(tInv(tCdf(t, df), df), t, 1e-8, `gidiş-dönüş t=${t}, sd=${df}`)
      near(tInv(0.025, df), -tInv(0.975, df), 1e-9, `simetri sd=${df}`)
    }
    // sd > 1e6 normal yaklaşıklığına geçer: eşikte sıçrama 1e-5'in altında kalmalı
    near(tInv(0.975, 1e6 + 1), tInv(0.975, 1e6), 1e-5, 'eşikte süreklilik')
    expect(tInv(0.975, 1e7)).toBe(normInv(0.975))
  })

  it('ki-kare üst kuyruk', () => {
    for (const [x, k, v] of ref.chi2) near(chi2Sf(x, k), v, TOL, `chi2Sf(${x}, ${k})`)
    near(chi2Sf(60500, 60000), 0.07474872501932471, 1e-8, 'büyük sd')
    expect(chi2Sf(0, 3)).toBe(1)
    expect(chi2Sf(-2, 3)).toBe(1)
    for (const x of [0.05, 1.7, 9, 40]) {
      near(chi2Sf(x, 2), Math.exp(-x / 2), 1e-13, 'sd = 2 → üstel')
      near(chi2Sf(x, 1), 2 * normSf(Math.sqrt(x)), 1e-12, 'sd = 1 → normalin karesi')
    }
  })
})

describe('özetler', () => {
  it('ortalama, varyans (n − 1), standart sapma', () => {
    near(mean(EK.x), EK.mean, 1e-14)
    near(variance(EK.x), EK.var, 1e-14)
    near(sd(EK.x), EK.sd, 1e-14)
    const m = moments(Float64Array.from(EK.x))
    expect(m.n).toBe(EK.x.length)
    near(m.mean, EK.mean, 1e-14)
    near(m.var, EK.var, 1e-14)
  })

  it('yüzdelikler numpy ile aynı (doğrusal ara değer, tip 7)', () => {
    EK.q.forEach((q, i) => near(quantile(EK.x, q), EK.qv[i], 1e-14, `q=${q}`))
    expect(quantiles(EK.x, EK.q)).toEqual([...EK.qv])
    expect(median(EK.x)).toBe(2)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    // Aralık dışı q kırpılır
    expect(quantile(EK.x, -3)).toBe(-4)
    expect(quantile(EK.x, 7)).toBe(9.5)
  })

  it('sortedCopy sayısal sıralar, NaN atar ve girdiyi değiştirmez', () => {
    const xs = [10, 9, NaN, 100, -2, 1e-3, NaN]
    const s = sortedCopy(xs)
    expect([...s]).toEqual([-2, 1e-3, 9, 10, 100])
    expect(xs[0]).toBe(10)
    expect(quantile(xs, 0.5)).toBe(9)
    expect(quantileSorted(s, 0.25)).toBe(1e-3)
  })

  it('pearson numpy ile aynı; sabit sütunda 0', () => {
    near(pearson(EK.x, EK.y), EK.pearson, 1e-13)
    near(pearson(EK.y, EK.x), EK.pearson, 1e-13)
    near(pearson([1, 2, 3, 4], [8, 6, 4, 2]), -1, 1e-15)
    expect(pearson([1, 2, 3], [5, 5, 5])).toBe(0)
    expect(pearson([1], [2])).toBeNaN()
  })

  it('boş ve tek öğeli girdiler', () => {
    expect(mean([])).toBeNaN()
    expect(variance([])).toBe(0)
    expect(variance([3])).toBe(0)
    expect(sd([])).toBe(0)
    expect(median([])).toBeNaN()
    expect(quantile([5], 0.3)).toBe(5)
    expect(quantile([NaN, NaN], 0.5)).toBeNaN()
    expect(moments([])).toMatchObject({ n: 0, mean: NaN, var: 0 })
  })
})

describe('güven aralıkları ve sınamalar', () => {
  it('Welch t: istatistik, serbestlik derecesi, p ve aralık (scipy)', () => {
    const w = ref.welch
    const r = welch(moments(w.a), moments(w.b))
    near(r.stat, w.stat, TOL_TEST, 'stat')
    near(r.df ?? NaN, w.df, TOL_TEST, 'df')
    near(r.p, w.p, TOL_TEST, 'p')
    near(r.lo, w.lo, TOL_TEST, 'lo')
    near(r.hi, w.hi, TOL_TEST, 'hi')
    near(r.diff, EK.welch.diff, 1e-12, 'diff')
    near(r.se, EK.welch.se, 1e-12, 'se')
    const r90 = welch(moments(w.a), moments(w.b), 0.9)
    near(r90.lo, EK.welch.lo90, TOL_TEST, 'lo90')
    near(r90.hi, EK.welch.hi90, TOL_TEST, 'hi90')
    const r99 = welch(moments(w.a), moments(w.b), 0.99)
    near(r99.lo, EK.welch.lo99, TOL_TEST, 'lo99')
    near(r99.hi, EK.welch.hi99, TOL_TEST, 'hi99')
    // Yön: fark = b − a; kollar yer değişince işaret döner, p aynı kalır
    const rev = welch(moments(w.b), moments(w.a))
    near(rev.diff, -r.diff, 1e-13)
    near(rev.p, r.p, 1e-13)
    near(rev.lo, -r.hi, 1e-12)
  })

  it('Welch t: sabit girdiler', () => {
    const same = welch(moments([2, 2, 2]), moments([2, 2]))
    expect(same).toMatchObject({ diff: 0, se: 0, p: 1, lo: 0, hi: 0 })
    // Varyans sıfır, fark var: belirlenimci fark
    const diff = welch(moments([1, 1, 1]), moments([2, 2, 2]))
    expect(diff).toMatchObject({ diff: 1, se: 0, p: 0, lo: 1, hi: 1 })
  })

  it('Welch t: bilgi yokken (boş ya da tek gözlemli kol) anlamlı sonuç üretmez', () => {
    // Boş kolun ortalaması NaN'dır; tek gözlemin varyansı bilinemez. İkisinde de p < 0.05 çıkmamalı.
    const cases: [string, number[], number[]][] = [
      ['boş kontrol', [], [1, 2, 3]],
      ['boş varyant', [1, 2, 3], []],
      ['kol başına tek gözlem', [1], [2]],
    ]
    const significant = cases.filter(([, a, b]) => welch(moments(a), moments(b)).p < 0.05).map(([name]) => name)
    expect(significant, 'p < 0.05 dönen bilgi içermeyen girdiler').toEqual([])
  })

  it('iki oran: z, p (havuzlanmış) ve Wald aralığı (statsmodels)', () => {
    const p = ref.prop
    const r = twoProportion(p.ka, p.na, p.kb, p.nb)
    near(r.stat, p.z, TOL_TEST, 'z')
    near(r.p, p.p, TOL_TEST, 'p')
    near(r.diff, p.kb / p.nb - p.ka / p.na, 1e-14, 'diff')
    near(r.lo, EK.prop.lo, TOL_TEST, 'lo')
    near(r.hi, EK.prop.hi, TOL_TEST, 'hi')
    expect(r.df).toBeNull()
    const r90 = twoProportion(p.ka, p.na, p.kb, p.nb, 0.9)
    near(r90.lo, EK.prop.lo90, TOL_TEST, 'lo90')
    near(r90.hi, EK.prop.hi90, TOL_TEST, 'hi90')
    // Hiç olay yok / hep olay: fark 0, p = 1
    expect(twoProportion(0, 100, 0, 100)).toMatchObject({ diff: 0, p: 1, stat: 0 })
    expect(twoProportion(100, 100, 100, 100)).toMatchObject({ diff: 0, p: 1, stat: 0 })
  })

  it('Wilson aralığı (statsmodels)', () => {
    const [k, n, lo, hi] = ref.prop.wilson
    const w = wilson(k, n)
    near(w.lo, lo, TOL_TEST)
    near(w.hi, hi, TOL_TEST)
    near(w.p, k / n, 1e-15)
    for (const [kk, nn, conf, l, h] of EK.wilson) {
      const r = wilson(kk, nn, conf)
      expect(Math.abs(r.lo - l), `alt ${kk}/${nn}`).toBeLessThanOrEqual(1e-12)
      expect(Math.abs(r.hi - h), `üst ${kk}/${nn}`).toBeLessThanOrEqual(1e-12)
      expect(r.lo).toBeGreaterThanOrEqual(0)
      expect(r.hi).toBeLessThanOrEqual(1)
      expect(r.lo).toBeLessThanOrEqual(r.p)
      expect(r.hi).toBeGreaterThanOrEqual(r.p)
    }
    expect(wilson(0, 0)).toMatchObject({ p: NaN, lo: 0, hi: 1 })
    // Daha çok veri → daha dar aralık; daha yüksek güven → daha geniş
    expect(wilson(30, 100).hi - wilson(30, 100).lo).toBeGreaterThan(wilson(300, 1000).hi - wilson(300, 1000).lo)
    expect(wilson(30, 100, 0.99).hi - wilson(30, 100, 0.99).lo).toBeGreaterThan(wilson(30, 100).hi - wilson(30, 100).lo)
  })

  it('uyum iyiliği ki-kare (scipy)', () => {
    const g = ref.gof
    const r = chi2Gof(g.obs, g.exp)
    near(r.stat, g.stat, TOL_TEST, 'stat')
    near(r.p, g.p, TOL_TEST, 'p')
    expect(r.df).toBe(2)
    expect(chi2Gof([10, 20, 30], [10, 20, 30])).toMatchObject({ stat: 0, df: 2, p: 1 })
  })

  it('Mantel–Haenszel risk oranı ve Greenland–Robins aralığı', () => {
    const r = mantelHaenszelRR(strataOf(ref.mh.strata))
    near(r.rr, ref.mh.rr, TOL_TEST, 'rr')
    near(r.lo, ref.mh.lo, TOL_TEST, 'lo')
    near(r.hi, ref.mh.hi, TOL_TEST, 'hi')
    near(r.p, EK.mh.p, TOL_TEST, 'p')
    expect(r.exposed).toBe(200 + 80 + 150)
    expect(r.events).toBe(30 + 12 + 50)
    const r90 = mantelHaenszelRR(strataOf(ref.mh.strata), 0.9)
    near(r90.lo, EK.mh.lo90, TOL_TEST, 'lo90')
    near(r90.hi, EK.mh.hi90, TOL_TEST, 'hi90')
    // Tek katman: ham risk oranı
    const one = mantelHaenszelRR([{ a: 30, n1: 200, c: 40, n0: 600 }])
    near(one.rr, 30 / 200 / (40 / 600), 1e-14)
    // Katmanların sırası sonucu değiştirmez; maruz ↔ maruz değil yer değişince oran tersine döner
    const shuffled = mantelHaenszelRR(strataOf([ref.mh.strata[2], ref.mh.strata[0], ref.mh.strata[1]]))
    near(shuffled.rr, r.rr, 1e-13)
    const inv = mantelHaenszelRR(ref.mh.strata.map(([a, n1, c, n0]) => ({ a: c, n1: n0, c: a, n0: n1 })))
    near(inv.rr, 1 / r.rr, 1e-13)
    near(inv.lo, 1 / r.hi, 1e-12)
    near(inv.p, r.p, 1e-12)
  })

  it('Mantel–Haenszel: boş ya da olaysız katmanlar', () => {
    expect(mantelHaenszelRR([])).toMatchObject({ rr: NaN, p: 1, exposed: 0, events: 0 })
    expect(mantelHaenszelRR([{ a: 0, n1: 10, c: 0, n0: 10 }])).toMatchObject({ rr: NaN, p: 1 })
    // Bir yanı boş katman atlanır
    const r = mantelHaenszelRR([
      { a: 5, n1: 50, c: 0, n0: 0 },
      { a: 10, n1: 100, c: 5, n0: 100 },
    ])
    near(r.rr, 2, 1e-14)
    expect(r.exposed).toBe(100)
  })

  it('Benjamini–Hochberg ve Holm düzeltmeleri (statsmodels)', () => {
    const { p, bh, holm: h } = ref.mt
    benjaminiHochberg(p).forEach((v, i) => near(v, bh[i], 1e-12, `BH[${i}]`))
    holm(p).forEach((v, i) => near(v, h[i], 1e-12, `Holm[${i}]`))
    expect(benjaminiHochberg([])).toEqual([])
    expect(holm([])).toEqual([])
    expect(benjaminiHochberg([0.3])).toEqual([0.3])
    expect(holm([0.3])).toEqual([0.3])
    // Holm, BH'den hiçbir zaman daha gevşek değildir; ikisi de ham p'den küçük olamaz ve 1'i aşmaz
    // (p · m / m yuvarlaması için son basamakta pay bırakılır)
    const ulp = 1e-15
    const rng = rngFor(7, 'coklu')
    for (let rep = 0; rep < 50; rep++) {
      const ps = Array.from({ length: 1 + Math.floor(rng() * 12) }, () => rng() ** 3)
      const b = benjaminiHochberg(ps)
      const ho = holm(ps)
      const order = ps.map((_, i) => i).sort((x, y) => ps[x] - ps[y])
      for (let k = 0; k < ps.length; k++) {
        const i = order[k]
        expect(b[i]).toBeGreaterThanOrEqual(ps[i] - ulp)
        expect(ho[i]).toBeGreaterThanOrEqual(b[i] - ulp)
        expect(ho[i]).toBeLessThanOrEqual(1)
        // Sıra korunur
        if (k > 0) {
          expect(b[i]).toBeGreaterThanOrEqual(b[order[k - 1]])
          expect(ho[i]).toBeGreaterThanOrEqual(ho[order[k - 1]])
        }
      }
    }
  })
})

describe('sınıflandırma ölçüleri', () => {
  it('AUC (scikit-learn; eşit puanlarda ortalama sıra)', () => {
    near(auc(ref.auc.s, ref.auc.y), ref.auc.auc, 1e-13)
    // Etiketler tersine dönünce 1 − AUC; puanların tekdüze dönüşümü sonucu değiştirmez
    near(
      auc(
        ref.auc.s,
        ref.auc.y.map((v) => 1 - v),
      ),
      1 - ref.auc.auc,
      1e-13,
    )
    near(
      auc(
        ref.auc.s.map((s) => Math.exp(s)),
        ref.auc.y,
      ),
      ref.auc.auc,
      1e-13,
    )
    expect(auc([1, 2, 3], [0, 0, 1])).toBe(1)
    expect(auc([3, 2, 1], [0, 0, 1])).toBe(0)
    expect(auc([1, 1, 1], [0, 1, 1])).toBe(0.5)
    expect(auc([1, 2], [1, 1])).toBeNaN()
    expect(auc([], [])).toBeNaN()
  })

  it('log kaybı (scikit-learn), kaldıraç ve ayar eğrisi', () => {
    const { X, y, n, p } = ref.logit
    const fit = logistic(Float64Array.from(X), y, n, p, { l2: 0, tol: 1e-12 })
    const pred = logisticPredict(fit.coef, Float64Array.from(X), n, p)
    near(logLoss(pred, y), EK.logLoss, 1e-10, 'log kaybı')
    near(auc(pred, y), EK.aucPred, 1e-10, 'AUC')
    expect(logLoss([], [])).toBeNaN()
    expect(logLoss([0, 1], [0, 1])).toBeLessThan(1e-9)
    // Kesin ama yanlış tahmin sonsuza gitmez (kırpma)
    expect(Number.isFinite(logLoss([1, 0], [0, 1]))).toBe(true)

    expect(liftAt([0.9, 0.1, 0.5, 0.3], [1, 0, 0, 0], 0.25)).toMatchObject({ rate: 1, lift: 4, n: 1 })
    const lift = liftAt(pred, y, 0.1)
    expect(lift.n).toBe(26)
    expect(lift.lift).toBeGreaterThan(1)

    const cal = calibration(pred, y, 10)
    expect(cal.reduce((s, b) => s + b.n, 0)).toBe(n)
    expect(cal).toHaveLength(10)
    for (let i = 1; i < cal.length; i++) expect(cal[i].predicted).toBeGreaterThanOrEqual(cal[i - 1].predicted)
    // Ağırlıklı ortalamalar genel ortalamaya eşittir
    near(cal.reduce((s, b) => s + b.predicted * b.n, 0) / n, mean(pred), 1e-12)
    near(cal.reduce((s, b) => s + b.observed * b.n, 0) / n, mean(y), 1e-12)
    expect(calibration([], [], 3)).toEqual([])
  })
})

describe('sağkalım', () => {
  it('Kaplan–Meier: S(t) ve ortanca (lifelines), Greenwood standart hatası (statsmodels)', () => {
    const { t, e, times, s, median: med } = ref.km
    const km = kaplanMeier(t, e)
    times.forEach((time, i) => near(kmAt(km, time), s[i], TOL_TEST, `S(${time})`))
    expect(kmMedian(km)).toBe(med)
    expect(km).toHaveLength(EK.kmPoints)
    for (const [i, time, atRisk, events, surv, se] of EK.km) {
      expect(km[i].t).toBe(time)
      expect(km[i].atRisk).toBe(atRisk)
      expect(km[i].events).toBe(events)
      near(km[i].s, surv, TOL_TEST, `s[${i}]`)
      near(km[i].se, se, TOL_TEST, `se[${i}]`)
    }
    // Azalmayan olamaz; ilk olaydan önce 1
    for (let i = 1; i < km.length; i++) {
      expect(km[i].s).toBeLessThanOrEqual(km[i - 1].s)
      expect(km[i].t).toBeGreaterThan(km[i - 1].t)
    }
    expect(kmAt(km, 0)).toBe(1)
    expect(kmAt(km, km[0].t - 1e-9)).toBe(1)
    expect(kmAt(km, 1e9)).toBe(km[km.length - 1].s)
  })

  it('Kaplan–Meier: sansürsüz veride ampirik sağkalım; kenar durumları', () => {
    // Sansür yoksa S(t) = (t'den uzun yaşayanların payı)
    const km = kaplanMeier([5, 1, 3, 3, 8], [1, 1, 1, 1, 1])
    expect(km.map((p) => [p.t, p.atRisk, p.events])).toEqual([
      [1, 5, 1],
      [3, 4, 2],
      [5, 2, 1],
      [8, 1, 1],
    ])
    km.forEach((p, i) => near(p.s, [0.8, 0.4, 0.2, 0][i], 1e-15))
    expect(kmMedian(km)).toBe(3)
    // Aynı anda olay ve sansür: sansürlenen o anda hâlâ risk altındadır
    const tie = kaplanMeier([2, 2, 4], [1, 0, 1])
    expect(tie[0]).toMatchObject({ t: 2, atRisk: 3, events: 1 })
    near(tie[0].s, 2 / 3, 1e-15)
    expect(tie[1]).toMatchObject({ t: 4, atRisk: 1, events: 1, s: 0 })
    expect(kaplanMeier([], [])).toEqual([])
    expect(kaplanMeier([1, 2, 3], [0, 0, 0])).toEqual([])
    expect(kmMedian([])).toBeNull()
    expect(kmMedian(kaplanMeier([1, 2, 3, 4], [1, 0, 0, 0]))).toBeNull()
    expect(kmAt([], 5)).toBe(1)
  })

  it('log-rank sınaması: iki ve üç grup (lifelines)', () => {
    const { t, e, g } = ref.km
    const three = logRank(t, e, g, 3)
    near(three.stat, ref.logrank.stat3, TOL_TEST, 'stat3')
    near(three.p, ref.logrank.p3, TOL_TEST, 'p3')
    expect(three.df).toBe(2)
    // Gözlenen ve beklenen olay toplamları eşittir
    near(
      three.expected.reduce((a, b) => a + b, 0),
      three.observed.reduce((a, b) => a + b, 0),
      1e-12,
    )
    expect(three.observed.reduce((a, b) => a + b, 0)).toBe(e.reduce((a, b) => a + b, 0))
    // İki grup: 0 ve 1 kodlu gözlemler
    const idx = g.map((v, i) => (v < 2 ? i : -1)).filter((i) => i >= 0)
    const two = logRank(
      idx.map((i) => t[i]),
      idx.map((i) => e[i]),
      idx.map((i) => g[i]),
      2,
    )
    near(two.stat, ref.logrank.stat2, TOL_TEST, 'stat2')
    near(two.p, ref.logrank.p2, TOL_TEST, 'p2')
    expect(two.df).toBe(1)
    // Grup kodları yer değişince istatistik değişmez
    const swapped = logRank(
      idx.map((i) => t[i]),
      idx.map((i) => e[i]),
      idx.map((i) => 1 - g[i]),
      2,
    )
    near(swapped.stat, two.stat, 1e-12)
    // Üç grupta kodların döndürülmesi (hangi grubun atıldığı) sonucu değiştirmez
    const rotated = logRank(
      t,
      e,
      g.map((v) => (v + 1) % 3),
      3,
    )
    near(rotated.stat, three.stat, 1e-9)
  })

  it('log-rank: ayrışmayan ve boş girdiler', () => {
    expect(logRank([], [], [], 2)).toMatchObject({ stat: 0, df: 1, p: 1 })
    // Olay yok
    expect(logRank([1, 2, 3, 4], [0, 0, 0, 0], [0, 1, 0, 1], 2)).toMatchObject({ stat: 0, p: 1 })
    // Herkes aynı grupta
    expect(logRank([1, 2, 3, 4], [1, 1, 1, 1], [0, 0, 0, 0], 2)).toMatchObject({ stat: 0, p: 1 })
    // Özdeş iki grup: fark yok
    const same = logRank([1, 2, 3, 1, 2, 3], [1, 1, 1, 1, 1, 1], [0, 0, 0, 1, 1, 1], 2)
    near(same.stat, 0, 1e-12)
    near(same.p, 1, 1e-9)
  })
})

describe('doğrusal cebir', () => {
  const A = [4, 2, 0.6, 2, 5, 1, 0.6, 1, 3]

  it('Cholesky ayrıştırması ve çözümü', () => {
    const L = Float64Array.from(A)
    expect(cholesky(L, 3)).toBe(true)
    // L Lᵀ = A (alt üçgen)
    for (let i = 0; i < 3; i++)
      for (let j = 0; j <= i; j++) {
        let s = 0
        for (let k = 0; k <= j; k++) s += L[i * 3 + k] * L[j * 3 + k]
        near(s, A[i * 3 + j], 1e-14, `A[${i}][${j}]`)
      }
    const b = [1, 2, 3]
    const x = choleskySolve(L, b, 3)
    for (let i = 0; i < 3; i++)
      near(A[i * 3] * x[0] + A[i * 3 + 1] * x[1] + A[i * 3 + 2] * x[2], b[i], 1e-13, `satır ${i}`)
    // Ters matrisin köşegeni: A x = e_j çözümünün j. öğesi
    const inv = choleskyInverseDiag(L, 3)
    for (let j = 0; j < 3; j++) {
      const e = [0, 0, 0]
      e[j] = 1
      near(inv[j], solveSymmetric(Float64Array.from(A), e, 3)?.[j] ?? NaN, 1e-13, `ters[${j}]`)
    }
  })

  it('solveSymmetric girdiyi değiştirmez; pozitif tanımlı olmayanı reddeder', () => {
    const M = Float64Array.from(A)
    const x = solveSymmetric(M, [1, 2, 3], 3)
    expect(x).not.toBeNull()
    expect([...M]).toEqual(A)
    expect(solveSymmetric(Float64Array.from([-1, 0, 0, -1]), [1, 1], 2)).toBeNull()
    expect(cholesky(Float64Array.from([-1, 0, 0, -1]), 2)).toBe(false)
  })
})

describe('lojistik regresyon', () => {
  const { X, y, n, p, coef, se, ll } = ref.logit
  const X64 = Float64Array.from(X)

  it('cezasız uyum statsmodels ile aynı: katsayı, standart hata, olabilirlik, z ve p', () => {
    const fit = logistic(X64, y, n, p, { l2: 0, tol: 1e-12 })
    expect(fit.converged).toBe(true)
    expect(fit.coef).toHaveLength(p + 1)
    for (let j = 0; j <= p; j++) {
      near(fit.coef[j], coef[j], 1e-7, `coef[${j}]`)
      near(fit.se[j], se[j], 1e-7, `se[${j}]`)
      near(fit.z[j], EK.logitZ[j], 1e-7, `z[${j}]`)
      near(fit.p[j], EK.logitP[j], 1e-6, `p[${j}]`)
    }
    near(fit.logLik, ll, 1e-10, 'logLik')
    const pred = logisticPredict(fit.coef, X64, n, p)
    EK.logitPred.forEach((v, i) => near(pred[i], v, 1e-8, `olasılık[${i}]`))
    // En çok olabilirlikte artıkların toplamı sıfırdır (kesişim denklemi)
    let resid = 0
    for (let i = 0; i < n; i++) resid += y[i] - pred[i]
    expect(Math.abs(resid)).toBeLessThan(1e-8)
  })

  it('varsayılan küçük ceza (l2 = 1e-4) sonucu anlamlı ölçüde değiştirmez', () => {
    const fit = logistic(X64, y, n, p)
    expect(fit.converged).toBe(true)
    for (let j = 0; j <= p; j++) {
      // Sıfıra yakın katsayıda göreli fark büyür: mutlak ölçüt
      expect(Math.abs(fit.coef[j] - coef[j]), `coef[${j}]`).toBeLessThan(1e-4)
      near(fit.se[j], se[j], 1e-4, `se[${j}]`)
    }
  })

  it('L2 cezası scikit-learn ile aynı (kesişim cezalandırılmaz)', () => {
    for (const l2 of [1, 0.5] as const) {
      const fit = logistic(X64, y, n, p, { l2, tol: 1e-12 })
      expect(fit.converged).toBe(true)
      EK.l2[l2].forEach((v, j) => near(fit.coef[j], v, 1e-6, `l2=${l2} coef[${j}]`))
    }
    // Ceza büyüdükçe eğimler küçülür
    const norm = (l2: number): number => {
      const f = logistic(X64, y, n, p, { l2 })
      let s = 0
      for (let j = 1; j <= p; j++) s += f.coef[j] * f.coef[j]
      return s
    }
    expect(norm(100)).toBeLessThan(norm(1))
    expect(norm(1)).toBeLessThan(norm(0))
  })

  it('gözlem ağırlıkları statsmodels GLM ile aynı; tam sayı ağırlık = satırı yinelemek', () => {
    const w = Float64Array.from({ length: n }, (_, i) => 1 + (i % 3))
    const fit = logistic(X64, y, n, p, { l2: 0, weights: w, tol: 1e-12 })
    for (let j = 0; j <= p; j++) {
      near(fit.coef[j], EK.weighted.coef[j], 1e-7, `coef[${j}]`)
      near(fit.se[j], EK.weighted.se[j], 1e-7, `se[${j}]`)
    }
    near(fit.logLik, EK.weighted.ll, 1e-10, 'logLik')
    const rows: number[] = []
    const labels: number[] = []
    for (let i = 0; i < n; i++)
      for (let k = 0; k < w[i]; k++) {
        rows.push(...X.slice(i * p, (i + 1) * p))
        labels.push(y[i])
      }
    const dup = logistic(Float64Array.from(rows), labels, labels.length, p, { l2: 0, tol: 1e-12 })
    for (let j = 0; j <= p; j++) {
      near(dup.coef[j], fit.coef[j], 1e-8, `yinelenmiş coef[${j}]`)
      near(dup.se[j], fit.se[j], 1e-7, `yinelenmiş se[${j}]`)
    }
  })

  it('Float32 tasarım matrisiyle de yakınsar', () => {
    const fit = logistic(Float32Array.from(X), y, n, p, { l2: 0 })
    expect(fit.converged).toBe(true)
    for (let j = 0; j <= p; j++) expect(Math.abs(fit.coef[j] - coef[j])).toBeLessThan(1e-6)
  })

  it('kenar durumları: açıklayıcısız model, tek sınıf, tam ayrışma', () => {
    // p = 0: yalnız kesişim → logit(ortalama)
    const only = logistic(new Float64Array(0), [1, 0, 0, 1, 1, 0, 1, 1], 8, 0, { l2: 0 })
    near(only.coef[0], Math.log(5 / 3), 1e-9)
    near(only.se[0], Math.sqrt(1 / 5 + 1 / 3), 1e-6)
    // Tek sınıf: sonlu katsayılar, olasılıklar etikete yakın
    const allOne = logistic(Float64Array.from([0.1, 0.5, -0.3, 0.9]), [1, 1, 1, 1], 4, 1)
    expect([...allOne.coef].every((v) => Number.isFinite(v))).toBe(true)
    expect(Math.min(...logisticPredict(allOne.coef, Float64Array.from([0.1, 0.5, -0.3, 0.9]), 4, 1))).toBeGreaterThan(
      0.99,
    )
    // Tam ayrışma: ceza sayesinde sonlu kalır ve doğru yönü bulur
    const sepX = Float64Array.from([-2, -1.5, -1, -0.5, 0.5, 1, 1.5, 2])
    const sep = logistic(sepX, [0, 0, 0, 0, 1, 1, 1, 1], 8, 1)
    expect(Number.isFinite(sep.coef[1])).toBe(true)
    expect(sep.coef[1]).toBeGreaterThan(1)
    const ps = logisticPredict(sep.coef, sepX, 8, 1)
    expect(Math.max(...ps.slice(0, 4))).toBeLessThan(0.5)
    expect(Math.min(...ps.slice(4))).toBeGreaterThan(0.5)
    for (const v of [...sep.p, ...allOne.p]) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('sigmoid ve softplus taşmaz', () => {
    expect(sigmoid(0)).toBe(0.5)
    expect(sigmoid(800)).toBe(1)
    expect(sigmoid(-800)).toBe(0)
    for (const x of [-30, -2, 0.4, 7]) near(sigmoid(x) + sigmoid(-x), 1, 1e-15)
    expect(softplus(800)).toBe(800)
    expect(softplus(-800)).toBe(0)
    near(softplus(0), Math.LN2, 1e-15)
    for (const x of [-20, -1, 0.5, 12, 34.9, 35.1]) near(softplus(x) - softplus(-x), x, 1e-12, `softplus x=${x}`)
  })
})

describe('p değerleri ve aralıklar her zaman tutarlı', () => {
  it('rastgele girdilerde p ∈ [0, 1], alt ≤ kestirim ≤ üst', () => {
    const rng = rngFor(20261116, 'stats', 'tutarlilik')
    for (let rep = 0; rep < 300; rep++) {
      const na = 2 + Math.floor(rng() * 40)
      const nb = 2 + Math.floor(rng() * 40)
      const shift = 3 * (rng() - 0.5)
      const scale = 0.05 + 4 * rng()
      const a = Array.from({ length: na }, () => normal(rng))
      const b = Array.from({ length: nb }, () => shift + scale * normal(rng))
      const w = welch(moments(a), moments(b))
      for (const v of [w.p, tTwoSided(w.stat, w.df ?? 1), tCdf(w.stat, w.df ?? 1)]) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
      }
      expect(w.lo).toBeLessThanOrEqual(w.diff)
      expect(w.hi).toBeGreaterThanOrEqual(w.diff)
      expect(w.df ?? 0).toBeGreaterThanOrEqual(Math.min(na, nb) - 1 - 1e-9)
      expect(w.df ?? 0).toBeLessThanOrEqual(na + nb - 2 + 1e-9)

      const ka = Math.floor(rng() * (na + 1))
      const kb = Math.floor(rng() * (nb + 1))
      const tp = twoProportion(ka, na, kb, nb)
      expect(tp.p).toBeGreaterThanOrEqual(0)
      expect(tp.p).toBeLessThanOrEqual(1)
      expect(tp.lo).toBeLessThanOrEqual(tp.diff)
      expect(tp.hi).toBeGreaterThanOrEqual(tp.diff)

      const g = chi2Gof([ka + 1, kb + 1, na], [na, nb, ka + kb + 1])
      expect(g.p).toBeGreaterThanOrEqual(0)
      expect(g.p).toBeLessThanOrEqual(1)

      const mh = mantelHaenszelRR([
        { a: ka, n1: na, c: kb, n0: nb },
        { a: kb, n1: nb + 3, c: ka, n0: na + 5 },
      ])
      expect(mh.p).toBeGreaterThanOrEqual(0)
      expect(mh.p).toBeLessThanOrEqual(1)
      if (Number.isFinite(mh.rr)) {
        expect(mh.lo).toBeLessThanOrEqual(mh.rr)
        expect(mh.hi).toBeGreaterThanOrEqual(mh.rr)
      }
    }
  })
})
