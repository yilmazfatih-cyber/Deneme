/**
 * Tohumlu rastgelelik (lab/src/core/rng.ts): aynı tohum → aynı akış, etiketle türetilen akışların bağımsızlığı,
 * dağılımların momentleri (Monte Carlo hoşgörüsüyle; tohum sabit olduğundan sonuç her koşuda aynıdır), karıştırma ve
 * yinelemesiz örnekleme.
 */
import { describe, expect, it } from 'vitest'
import {
  bernoulli,
  beta,
  cumulative,
  exponential,
  gamma,
  hash32,
  lognormal,
  mix32,
  mulberry32,
  normal,
  pickCumulative,
  pickIndex,
  poisson,
  rngFor,
  sampleIndices,
  shuffle,
  zipfWeights,
  type Rng,
} from '../src/core/rng'
import { chi2Sf, lgamma, pearson, quantile } from '../src/core/stats'

const SEED = 20261116
const N = 120_000
/** Monte Carlo hoşgörüsü: beklenen değerden en çok bu kadar standart hata sapma */
const Z = 4.5

interface SampleStats {
  xs: Float64Array
  mean: number
  var: number
  skew: number
  kurt: number
  min: number
  max: number
}

function sample(draw: () => number, n = N): SampleStats {
  const xs = new Float64Array(n)
  let s = 0
  for (let i = 0; i < n; i++) {
    xs[i] = draw()
    s += xs[i]
  }
  const mean = s / n
  let v = 0
  let s3 = 0
  let s4 = 0
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < n; i++) {
    const d = xs[i] - mean
    v += d * d
    s3 += d * d * d
    s4 += d * d * d * d
    if (xs[i] < min) min = xs[i]
    if (xs[i] > max) max = xs[i]
  }
  v /= n
  return { xs, mean, var: v, skew: s3 / n / v ** 1.5, kurt: s4 / n / (v * v), min, max }
}

/** |bulunan − beklenen| ≤ Z × standart hata */
function within(got: number, expected: number, se: number, label: string): void {
  const z = (got - expected) / se
  expect(Math.abs(z), `${label}: bulunan ${got}, beklenen ${expected} (z = ${z.toFixed(2)})`).toBeLessThanOrEqual(Z)
}

const take = (rng: Rng, n: number): number[] => Array.from({ length: n }, () => rng())

describe('mulberry32', () => {
  it('aynı tohum aynı akışı verir; bilinen ilk değerler değişmez', () => {
    // Akışın sabit kalması tüm lab sonuçlarının yeniden üretilebilirliğidir
    expect(take(mulberry32(42), 3)).toEqual([0.6011037519201636, 0.44829055899754167, 0.8524657934904099])
    expect(take(mulberry32(7), 500)).toEqual(take(mulberry32(7), 500))
    expect(take(mulberry32(7), 5)).not.toEqual(take(mulberry32(8), 5))
  })

  it('değerler [0, 1) aralığında ve tohum 32 bit işaretsiz sayıya indirgenir', () => {
    const rng = mulberry32(123)
    for (let i = 0; i < 50_000; i++) {
      const u = rng()
      expect(u >= 0 && u < 1).toBe(true)
    }
    expect(take(mulberry32(-1), 4)).toEqual(take(mulberry32(4294967295), 4))
    expect(take(mulberry32(2 ** 32 + 5), 4)).toEqual(take(mulberry32(5), 4))
    expect(take(mulberry32(1.9), 4)).toEqual(take(mulberry32(1), 4))
  })

  it('düzgün dağılım: momentler ve eşit dilim sayımları', () => {
    const rng = rngFor(SEED, 'duzgun')
    const s = sample(rng)
    within(s.mean, 0.5, Math.sqrt(1 / 12 / N), 'ortalama')
    within(s.var, 1 / 12, Math.sqrt(1 / 180 / N), 'varyans')
    const bins = new Array<number>(20).fill(0)
    for (const u of s.xs) bins[Math.floor(u * 20)]++
    let stat = 0
    for (const c of bins) stat += (c - N / 20) ** 2 / (N / 20)
    expect(chi2Sf(stat, 19)).toBeGreaterThan(1e-4)
    // Ardışık değerler ilişkisiz
    expect(Math.abs(pearson(s.xs.subarray(0, N - 1), s.xs.subarray(1)))).toBeLessThan(Z / Math.sqrt(N))
  })
})

describe('akış türetme (rngFor, hash32, mix32)', () => {
  it('aynı tohum + etiketler → aynı akış', () => {
    expect(take(rngFor(5, 'oturum', 17), 200)).toEqual(take(rngFor(5, 'oturum', 17), 200))
    expect(take(rngFor(5), 10)).toEqual(take(mulberry32(5), 10))
  })

  it('farklı tohum, etiket, etiket sırası ya da türü → farklı akış', () => {
    const base = take(rngFor(5, 'oturum', 17), 8)
    const others: Rng[] = [
      rngFor(6, 'oturum', 17),
      rngFor(5, 'secim', 17),
      rngFor(5, 'oturum', 18),
      rngFor(5, 17, 'oturum'),
      rngFor(5, 'oturum'),
      rngFor(5, 'oturum', 17, 0),
      rngFor(5, 'oturum', '17'),
    ]
    const seen = new Set([JSON.stringify(base)])
    for (const r of others) {
      const v = JSON.stringify(take(r, 8))
      expect(seen.has(v)).toBe(false)
      seen.add(v)
    }
  })

  it('komşu etiketlerin akışları ilişkisizdir (ikiz evrenlerde bir akış ötekini kaydırmaz)', () => {
    const n = 20_000
    const a = Float64Array.from(take(rngFor(SEED, 'kullanici', 1), n))
    const b = Float64Array.from(take(rngFor(SEED, 'kullanici', 2), n))
    const c = Float64Array.from(take(rngFor(SEED + 1, 'kullanici', 1), n))
    for (const [x, y] of [
      [a, b],
      [a, c],
      [b, c],
    ])
      expect(Math.abs(pearson(x, y))).toBeLessThan(Z / Math.sqrt(n))
    // Bir akıştan çekmek ötekini etkilemez
    const r1 = rngFor(SEED, 'karar', 'a')
    const r2 = rngFor(SEED, 'karar', 'b')
    const first = r2()
    for (let i = 0; i < 100; i++) r1()
    expect(rngFor(SEED, 'karar', 'b')()).toBe(first)
  })

  it('hash32 ve mix32 belirlenimci, 32 bit işaretsiz ve sıraya duyarlı', () => {
    expect(hash32('')).toBe(2872998923)
    expect(hash32('a')).toBe(444641715)
    expect(hash32('kullanici')).toBe(2648452046)
    expect(mix32(1, 2)).toBe(1097893004)
    expect(mix32(2, 1)).toBe(431709512)
    const seen = new Set<number>()
    for (let i = 0; i < 5000; i++) {
      const h = hash32(`etiket-${i}`)
      expect(Number.isInteger(h) && h >= 0 && h <= 0xffffffff).toBe(true)
      seen.add(h)
    }
    expect(seen.size).toBe(5000)
    // Türkçe karakterler ayrı özet verir
    expect(hash32('şehir')).not.toBe(hash32('sehir'))
  })
})

describe('dağılımlar', () => {
  it('normal: ortalama 0, varyans 1, çarpıklık 0, basıklık 3 ve kuyruk payları', () => {
    const rng = rngFor(SEED, 'normal')
    const s = sample(() => normal(rng))
    within(s.mean, 0, 1 / Math.sqrt(N), 'ortalama')
    within(s.var, 1, Math.sqrt(2 / N), 'varyans')
    within(s.skew, 0, Math.sqrt(6 / N), 'çarpıklık')
    within(s.kurt, 3, Math.sqrt(24 / N), 'basıklık')
    let out196 = 0
    let above3 = 0
    for (const x of s.xs) {
      if (Math.abs(x) > 1.959963984540054) out196++
      if (x > 3) above3++
    }
    within(out196 / N, 0.05, Math.sqrt((0.05 * 0.95) / N), 'P(|z| > 1.96)')
    within(above3 / N, 0.0013498980316301, Math.sqrt(0.00135 / N), 'P(z > 3)')
    expect(Number.isFinite(s.min) && Number.isFinite(s.max)).toBe(true)
    within(quantile(s.xs, 0.5), 0, 1.2533 / Math.sqrt(N), 'ortanca')
  })

  it('lognormal: ortalama exp(μ + σ²/2), ortanca exp(μ); logaritması normal', () => {
    for (const [mu, sigma] of [
      [0, 0.5],
      [1, 0.25],
      [-0.87, 0.7],
    ]) {
      const rng = rngFor(SEED, 'lognormal', mu, sigma)
      const s = sample(() => lognormal(rng, mu, sigma))
      const mean = Math.exp(mu + (sigma * sigma) / 2)
      const variance = (Math.exp(sigma * sigma) - 1) * Math.exp(2 * mu + sigma * sigma)
      within(s.mean, mean, Math.sqrt(variance / N), `ortalama (${mu}, ${sigma})`)
      expect(s.min).toBeGreaterThan(0)
      let ls = 0
      let ls2 = 0
      for (const x of s.xs) {
        const l = Math.log(x)
        ls += l
        ls2 += l * l
      }
      within(ls / N, mu, sigma / Math.sqrt(N), `log ortalama (${mu}, ${sigma})`)
      within(ls2 / N - (ls / N) ** 2, sigma * sigma, sigma * sigma * Math.sqrt(2 / N), `log varyans (${mu}, ${sigma})`)
      within(Math.log(quantile(s.xs, 0.5)), mu, (1.2533 * sigma) / Math.sqrt(N), `ortanca (${mu}, ${sigma})`)
    }
  })

  it('üstel: ortalama 1 / oran, varyans 1 / oran², sağkalım e^{−oran·t}', () => {
    for (const rate of [0.5, 3]) {
      const rng = rngFor(SEED, 'ustel', rate)
      const s = sample(() => exponential(rng, rate))
      within(s.mean, 1 / rate, 1 / rate / Math.sqrt(N), `ortalama (${rate})`)
      within(s.var, 1 / rate ** 2, Math.sqrt(8 / N) / rate ** 2, `varyans (${rate})`)
      expect(s.min).toBeGreaterThanOrEqual(0)
      let above = 0
      for (const x of s.xs) if (x > 1) above++
      const p = Math.exp(-rate)
      within(above / N, p, Math.sqrt((p * (1 - p)) / N), `P(X > 1) (${rate})`)
    }
  })

  it('Poisson: küçük ve büyük ortalamada ortalama = varyans = λ, tam sayı ve negatif değil', () => {
    // λ < 30 Knuth, λ ≥ 30 dönüştürülmüş reddetme: sınırın iki yanı ve büyük değerler
    for (const lambda of [0.3, 4, 29.9, 30, 31, 100, 1000, 1e5]) {
      const rng = rngFor(SEED, 'poisson', lambda)
      const s = sample(() => poisson(rng, lambda))
      within(s.mean, lambda, Math.sqrt(lambda / N), `ortalama (λ = ${lambda})`)
      within(s.var, lambda, Math.sqrt((lambda + 2 * lambda * lambda) / N), `varyans (λ = ${lambda})`)
      within(s.skew, 1 / Math.sqrt(lambda), Math.sqrt((6 + 10 / lambda) / N) * 1.5, `çarpıklık (λ = ${lambda})`)
      expect(s.min).toBeGreaterThanOrEqual(0)
      expect(s.xs.every((x) => Number.isInteger(x))).toBe(true)
    }
  })

  it('Poisson: olasılık kütle işlevine uyum (ki-kare)', () => {
    for (const lambda of [4, 30, 50]) {
      const rng = rngFor(SEED, 'poisson-uyum', lambda)
      const counts = new Map<number, number>()
      for (let i = 0; i < N; i++) {
        const k = poisson(rng, lambda)
        counts.set(k, (counts.get(k) ?? 0) + 1)
      }
      let stat = 0
      let df = -1
      let tailObs = 0
      let tailExp = 0
      let cum = 0
      for (let k = 0; k < lambda * 4 + 30; k++) {
        const p = Math.exp(-lambda + k * Math.log(lambda) - lgamma(k + 1))
        cum += p
        const e = p * N
        const o = counts.get(k) ?? 0
        if (e < 20) {
          tailObs += o
          tailExp += e
        } else {
          stat += (o - e) ** 2 / e
          df++
        }
      }
      tailExp += (1 - cum) * N
      if (tailExp > 5) {
        stat += (tailObs - tailExp) ** 2 / tailExp
        df++
      }
      expect(chi2Sf(stat, df), `λ = ${lambda}: ki-kare ${stat.toFixed(1)}, sd ${df}`).toBeGreaterThan(1e-4)
    }
  })

  it('Poisson: geçersiz ortalama 0 döner', () => {
    const rng = mulberry32(1)
    expect(poisson(rng, 0)).toBe(0)
    expect(poisson(rng, -3)).toBe(0)
    expect(poisson(rng, NaN)).toBe(0)
  })

  it('gama: ortalama kθ, varyans kθ² (şekil < 1 dahil)', () => {
    for (const [shape, scale] of [
      [0.5, 1],
      [1, 1],
      [2.5, 2],
      [9, 0.5],
      [40, 0.1],
    ]) {
      const rng = rngFor(SEED, 'gama', shape, scale)
      const s = sample(() => gamma(rng, shape, scale))
      within(s.mean, shape * scale, Math.sqrt((shape * scale * scale) / N), `ortalama (${shape}, ${scale})`)
      within(
        s.var,
        shape * scale * scale,
        Math.sqrt(((6 * shape + 2 * shape * shape) * scale ** 4) / N),
        `varyans (${shape}, ${scale})`,
      )
      expect(s.min).toBeGreaterThan(0)
    }
    // Ölçek verilmezse 1; şekil 1 üsteldir
    const rng = rngFor(SEED, 'gama-ustel')
    const s = sample(() => gamma(rng, 1))
    let above = 0
    for (const x of s.xs) if (x > 2) above++
    within(above / N, Math.exp(-2), Math.sqrt((Math.exp(-2) * (1 - Math.exp(-2))) / N), 'P(X > 2)')
  })

  it('beta: ortalama a / (a + b), varyans ab / ((a + b)² (a + b + 1)), (0, 1) içinde', () => {
    for (const [a, b] of [
      [2, 5],
      [0.5, 0.5],
      [3, 7],
      [1, 1],
      [20, 4],
    ]) {
      const rng = rngFor(SEED, 'beta', a, b)
      const s = sample(() => beta(rng, a, b))
      const mean = a / (a + b)
      const variance = (a * b) / ((a + b) ** 2 * (a + b + 1))
      within(s.mean, mean, Math.sqrt(variance / N), `ortalama (${a}, ${b})`)
      // Varyansın standart hatası için kaba üst sınır: değerler [0, 1] içinde
      within(s.var, variance, Math.sqrt(variance / N), `varyans (${a}, ${b})`)
      expect(s.min).toBeGreaterThanOrEqual(0)
      expect(s.max).toBeLessThanOrEqual(1)
    }
  })

  it('bernoulli: istenen sıklık', () => {
    for (const p of [0.03, 0.3, 0.9]) {
      const rng = rngFor(SEED, 'bernoulli', p)
      let hits = 0
      for (let i = 0; i < N; i++) if (bernoulli(rng, p)) hits++
      within(hits / N, p, Math.sqrt((p * (1 - p)) / N), `p = ${p}`)
    }
    const rng = mulberry32(3)
    expect(bernoulli(rng, 0)).toBe(false)
    expect(bernoulli(rng, 1)).toBe(true)
  })
})

describe('ağırlıklı seçim', () => {
  const weights = [1, 0, 3, 6, 0, 2.5]
  const total = weights.reduce((a, b) => a + b, 0)

  it('cumulative: artan birikimli toplam; negatif ağırlık 0 sayılır', () => {
    expect([...cumulative(weights)]).toEqual([1, 1, 4, 10, 10, 12.5])
    expect([...cumulative([1, -5, 2])]).toEqual([1, 1, 3])
    expect([...cumulative([])]).toEqual([])
  })

  it('pickCumulative sıklıkları ağırlıklarla orantılı; sıfır ağırlık hiç seçilmez', () => {
    const rng = rngFor(SEED, 'birikimli')
    const cum = cumulative(weights)
    const counts = new Array<number>(weights.length).fill(0)
    for (let i = 0; i < N; i++) counts[pickCumulative(rng, cum)]++
    weights.forEach((w, i) => {
      const p = w / total
      if (w === 0) expect(counts[i]).toBe(0)
      else within(counts[i] / N, p, Math.sqrt((p * (1 - p)) / N), `dizin ${i}`)
    })
    expect(counts.reduce((a, b) => a + b, 0)).toBe(N)
    // Tek öğe her zaman seçilir
    expect(pickCumulative(rng, cumulative([7]))).toBe(0)
  })

  it('pickIndex aynı dağılımı verir (toplam verilse de verilmese de)', () => {
    const rng = rngFor(SEED, 'dogrusal')
    const counts = new Array<number>(weights.length).fill(0)
    const counts2 = new Array<number>(weights.length).fill(0)
    for (let i = 0; i < N; i++) {
      counts[pickIndex(rng, weights)]++
      counts2[pickIndex(rng, weights, total)]++
    }
    weights.forEach((w, i) => {
      const p = w / total
      if (w === 0) {
        expect(counts[i]).toBe(0)
        expect(counts2[i]).toBe(0)
      } else {
        within(counts[i] / N, p, Math.sqrt((p * (1 - p)) / N), `dizin ${i}`)
        within(counts2[i] / N, p, Math.sqrt((p * (1 - p)) / N), `dizin ${i} (toplamla)`)
      }
    })
  })

  it('zipfWeights: w_i ∝ 1 / (i + q)^s', () => {
    expect([...zipfWeights(4)]).toEqual([1, 1 / 2, 1 / 3, 1 / 4])
    expect([...zipfWeights(3, 2, 1)]).toEqual([1 / 4, 1 / 9, 1 / 16])
    expect([...zipfWeights(0)]).toEqual([])
    const w = zipfWeights(50, 1.3)
    for (let i = 1; i < w.length; i++) expect(w[i]).toBeLessThan(w[i - 1])
  })
})

describe('karıştırma ve yinelemesiz örnekleme', () => {
  it('shuffle bir permütasyondur, yerinde çalışır ve tohumla belirlenir', () => {
    const original = Array.from({ length: 200 }, (_, i) => `öğe-${i}`)
    const arr = [...original]
    const out = shuffle(rngFor(SEED, 'karistir'), arr)
    expect(out).toBe(arr)
    expect([...out].sort()).toEqual([...original].sort())
    expect(out).not.toEqual(original)
    expect(shuffle(rngFor(SEED, 'karistir'), [...original])).toEqual(out)
    expect(shuffle(rngFor(SEED, 'karistir-2'), [...original])).not.toEqual(out)
    // Yinelenen değerler korunur
    expect(shuffle(mulberry32(1), [1, 1, 2, 2, 2]).sort()).toEqual([1, 1, 2, 2, 2])
    expect(shuffle(mulberry32(1), [])).toEqual([])
    expect(shuffle(mulberry32(1), ['tek'])).toEqual(['tek'])
  })

  it('shuffle yansızdır: her öğe her konuma eşit sıklıkta düşer', () => {
    const rng = rngFor(SEED, 'karistir-yansiz')
    const reps = 40_000
    const k = 5
    const pos = Array.from({ length: k }, () => new Array<number>(k).fill(0))
    const perms = new Map<string, number>()
    for (let r = 0; r < reps; r++) {
      const a = shuffle(rng, [0, 1, 2, 3, 4])
      a.forEach((v, p) => pos[v][p]++)
      const key = a.join('')
      perms.set(key, (perms.get(key) ?? 0) + 1)
    }
    for (const row of pos) for (const c of row) within(c / reps, 1 / k, Math.sqrt(0.16 / reps), 'konum sıklığı')
    // 120 permütasyonun hepsi görülür ve düzgün dağılır
    expect(perms.size).toBe(120)
    let stat = 0
    for (const c of perms.values()) stat += (c - reps / 120) ** 2 / (reps / 120)
    expect(chi2Sf(stat, 119)).toBeGreaterThan(1e-4)
  })

  it('sampleIndices: k tekil dizin, aralık içinde, tohumla belirlenir', () => {
    const rng = rngFor(SEED, 'ornek')
    for (const [n, k] of [
      [10, 3],
      [10, 9],
      [1000, 1],
      [1000, 999],
      [50_000, 2000],
    ]) {
      const s = sampleIndices(rng, n, k)
      expect(s).toHaveLength(k)
      expect(new Set(s).size).toBe(k)
      for (const v of s) expect(v >= 0 && v < n && Number.isInteger(v)).toBe(true)
    }
    expect([...sampleIndices(rngFor(SEED, 'ornek-a'), 500, 40)]).toEqual([
      ...sampleIndices(rngFor(SEED, 'ornek-a'), 500, 40),
    ])
    expect([...sampleIndices(rngFor(SEED, 'ornek-a'), 500, 40)]).not.toEqual([
      ...sampleIndices(rngFor(SEED, 'ornek-b'), 500, 40),
    ])
  })

  it('sampleIndices: k ≥ n ise hepsi; k = 0 ya da n = 0 ise boş; çok büyük n bellek istemez', () => {
    const rng = mulberry32(9)
    expect([...sampleIndices(rng, 4, 4)]).toEqual([0, 1, 2, 3])
    expect([...sampleIndices(rng, 4, 9)]).toEqual([0, 1, 2, 3])
    expect([...sampleIndices(rng, 4, 0)]).toEqual([])
    expect([...sampleIndices(rng, 0, 3)]).toEqual([])
    const big = sampleIndices(rng, 2_000_000_000, 100)
    expect(new Set(big).size).toBe(100)
    expect(Math.max(...big)).toBeGreaterThan(1_000_000)
  })

  it('sampleIndices yansızdır: her dizin k / n olasılıkla seçilir, sıra da rastgeledir', () => {
    const rng = rngFor(SEED, 'ornek-yansiz')
    const reps = 40_000
    const n = 20
    const k = 5
    const inc = new Array<number>(n).fill(0)
    const first = new Array<number>(n).fill(0)
    for (let r = 0; r < reps; r++) {
      const s = sampleIndices(rng, n, k)
      for (const v of s) inc[v]++
      first[s[0]]++
    }
    for (const c of inc) within(c / reps, k / n, Math.sqrt((0.25 * 0.75) / reps), 'seçilme sıklığı')
    for (const c of first) within(c / reps, 1 / n, Math.sqrt((0.05 * 0.95) / reps), 'ilk sıra sıklığı')
  })
})
