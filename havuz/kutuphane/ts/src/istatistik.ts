/**
 * istatistik — betimleyici istatistik: hassas toplam, ortalama, ortanca, çeyreklikler (R7 / Excel YÜZDEBİRLİK),
 * varyans ve standart sapma (Welford), tepe değer, histogram, doğrusal regresyon, Pearson korelasyonu, hareketli
 * ortalama, üstel hareketli ortalama, z-puanı, IQR ile aykırı değer.
 *
 * Kullanım:
 *   mean([2, 4, 9])                       // 5
 *   quantile([1, 2, 3, 4], 0.25)          // 1.75  (Excel YÜZDEBİRLİK.DAHİL ve NumPy varsayılanıyla aynı)
 *   standardDeviation(veri)               // örneklem (n−1); { sample: false } → anakütle (n)
 *   linearRegression(aylar, satislar)     // { slope, intercept, r2 }
 *   histogram(yaslar, { bins: 5 })        // { edges: [...6 sınır], counts: [...5 sayı] }
 *   movingAverage(gunluk, 7)              // 7 günlük hareketli ortalama (n − 6 değer)
 *
 * Sınırlar: Boş girdi ve NaN/sonsuz değer StatsError verir (sessizce NaN döndürmez). Toplam Neumaier düzeltmeli
 * toplamadır (Python eşi math.fsum kullanır; son basamakta fark olabilir). Ağırlıklı istatistik, güven aralığı,
 * hipotez testi yoktur. Histogramda son kutu üst sınırı da içerir; min = max ise tek kutu döner.
 *
 * Genişletme: Yeni ölçü saf bir işlev olarak eklenir, girdiyi `checked` ile denetler; Python eşine
 * (kutuphane/istatistik.py) eklenir ve `vektorler/istatistik.json`'a örnek yazılır.
 */

export class StatsError extends Error {
  override name = 'StatsError'
}

function checked(values: readonly number[], minimum = 1, label = 'değer'): readonly number[] {
  if (values.length < minimum) throw new StatsError(`En az ${minimum} ${label} gerekir; ${values.length} verildi.`)
  for (const value of values) {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new StatsError(`Sonlu sayı olmayan değer var: ${String(value)}.`)
  }
  return values
}

function sorted(values: readonly number[]): number[] {
  return [...values].sort((a, b) => a - b)
}

/** Kayan nokta hatasını azaltan (Neumaier) toplam: [0.1, 0.2, 0.3] → 0.6 (düz toplam 0.6000000000000001). */
export function preciseSum(values: readonly number[]): number {
  checked(values, 0)
  let sum = 0
  let compensation = 0
  for (const value of values) {
    const t = sum + value
    compensation += Math.abs(sum) >= Math.abs(value) ? sum - t + value : value - t + sum
    sum = t
  }
  return sum + compensation
}

export function mean(values: readonly number[]): number {
  return preciseSum(checked(values)) / values.length
}

/** Doğrusal aradeğerlemeli yüzdebirlik (R7; Excel YÜZDEBİRLİK.DAHİL, NumPy varsayılanı). 0 ≤ q ≤ 1. */
export function quantile(values: readonly number[], q: number): number {
  if (!(q >= 0 && q <= 1)) throw new StatsError(`q 0 ile 1 arasında olmalı: ${q}.`)
  const xs = sorted(checked(values))
  const h = (xs.length - 1) * q
  const lo = Math.floor(h)
  const low = xs[lo] ?? 0
  const high = xs[Math.min(lo + 1, xs.length - 1)] ?? low
  return low + (h - lo) * (high - low)
}

export function median(values: readonly number[]): number {
  return quantile(values, 0.5)
}

/** [Q1, Q2 (ortanca), Q3]. */
export function quartiles(values: readonly number[]): [number, number, number] {
  return [quantile(values, 0.25), quantile(values, 0.5), quantile(values, 0.75)]
}

/** Çeyrekler açıklığı: Q3 − Q1. */
export function iqr(values: readonly number[]): number {
  const [q1, , q3] = quartiles(values)
  return q3 - q1
}

/** Varyans (Welford; sayısal olarak kararlı). Varsayılan örneklem (n − 1); `sample: false` → anakütle (n). */
export function variance(values: readonly number[], options: { sample?: boolean } = {}): number {
  const sample = options.sample ?? true
  checked(values, sample ? 2 : 1)
  let average = 0
  let m2 = 0
  values.forEach((value, i) => {
    const delta = value - average
    average += delta / (i + 1)
    m2 += delta * (value - average)
  })
  return m2 / (sample ? values.length - 1 : values.length)
}

export function standardDeviation(values: readonly number[], options: { sample?: boolean } = {}): number {
  return Math.sqrt(variance(values, options))
}

/** En sık görülen değer(ler), küçükten büyüğe. */
export function mode(values: readonly number[]): number[] {
  const counts = new Map<number, number>()
  for (const value of checked(values)) counts.set(value, (counts.get(value) ?? 0) + 1)
  const best = Math.max(...counts.values())
  return sorted([...counts].filter(([, count]) => count === best).map(([value]) => value))
}

/** Eşit genişlikli histogram. `min`/`max` verilirse aralık dışındakiler sayılmaz. */
export function histogram(
  values: readonly number[],
  options: { bins?: number; min?: number; max?: number } = {},
): { edges: number[]; counts: number[] } {
  checked(values)
  const min = options.min ?? Math.min(...values)
  const max = options.max ?? Math.max(...values)
  let bins = options.bins ?? 10
  if (!Number.isInteger(bins) || bins < 1) throw new StatsError('bins 1 veya daha büyük tam sayı olmalı.')
  if (!(max >= min)) throw new StatsError('max, min değerinden küçük olamaz.')
  if (max === min) bins = 1
  const edges = Array.from({ length: bins + 1 }, (_, i) => (i === bins ? max : min + ((max - min) * i) / bins))
  const counts = new Array<number>(bins).fill(0)
  for (const value of values) {
    if (value < min || value > max) continue
    const index = max === min ? 0 : Math.min(bins - 1, Math.floor(((value - min) / (max - min)) * bins))
    counts[index] = (counts[index] ?? 0) + 1
  }
  return { edges, counts }
}

function pairs(xs: readonly number[], ys: readonly number[]): void {
  if (xs.length !== ys.length) throw new StatsError(`x (${xs.length}) ve y (${ys.length}) aynı uzunlukta olmalı.`)
  checked(xs, 2, 'nokta')
  checked(ys, 2, 'nokta')
}

/** En küçük kareler doğrusu: y ≈ slope · x + intercept; r2 belirleme katsayısı. */
export function linearRegression(xs: readonly number[], ys: readonly number[]): { slope: number; intercept: number; r2: number } {
  pairs(xs, ys)
  const mx = mean(xs)
  const my = mean(ys)
  let sxy = 0
  let sxx = 0
  let syy = 0
  xs.forEach((x, i) => {
    const dx = x - mx
    const dy = (ys[i] ?? 0) - my
    sxy += dx * dy
    sxx += dx * dx
    syy += dy * dy
  })
  if (sxx === 0) throw new StatsError('Bütün x değerleri aynı; doğru çizilemez.')
  const slope = sxy / sxx
  const intercept = my - slope * mx
  let ssRes = 0
  xs.forEach((x, i) => {
    const residual = (ys[i] ?? 0) - (slope * x + intercept)
    ssRes += residual * residual
  })
  return { slope, intercept, r2: syy === 0 ? 1 : 1 - ssRes / syy }
}

/** Pearson korelasyon katsayısı (−1…1). */
export function pearson(xs: readonly number[], ys: readonly number[]): number {
  pairs(xs, ys)
  const mx = mean(xs)
  const my = mean(ys)
  let sxy = 0
  let sxx = 0
  let syy = 0
  xs.forEach((x, i) => {
    const dx = x - mx
    const dy = (ys[i] ?? 0) - my
    sxy += dx * dy
    sxx += dx * dx
    syy += dy * dy
  })
  if (sxx === 0 || syy === 0) throw new StatsError('Değerlerden biri sabit; korelasyon tanımsız.')
  return sxy / Math.sqrt(sxx * syy)
}

/** Basit hareketli ortalama: sonuç uzunluğu n − window + 1. */
export function movingAverage(values: readonly number[], window: number): number[] {
  if (!Number.isInteger(window) || window < 1) throw new StatsError('window 1 veya daha büyük tam sayı olmalı.')
  checked(values, window)
  return Array.from({ length: values.length - window + 1 }, (_, i) => mean(values.slice(i, i + window)))
}

/** Üstel hareketli ortalama: e₀ = x₀, eᵢ = α·xᵢ + (1 − α)·eᵢ₋₁; 0 < α ≤ 1. */
export function exponentialMovingAverage(values: readonly number[], alpha: number): number[] {
  if (!(alpha > 0 && alpha <= 1)) throw new StatsError(`alpha 0'dan büyük ve en çok 1 olmalı: ${alpha}.`)
  const out: number[] = []
  for (const value of checked(values)) out.push(out.length === 0 ? value : alpha * value + (1 - alpha) * (out[out.length - 1] ?? 0))
  return out
}

/** Her değerin z-puanı: (x − ortalama) / standart sapma. */
export function zScores(values: readonly number[], options: { sample?: boolean } = {}): number[] {
  const average = mean(values)
  const sd = standardDeviation(values, options)
  if (sd === 0) throw new StatsError('Standart sapma sıfır; z-puanı tanımsız.')
  return values.map((value) => (value - average) / sd)
}

/** Tukey çitleri dışındaki değerler: [Q1 − k·IQR, Q3 + k·IQR] aralığı dışı (varsayılan k = 1,5). */
export function outliersIqr(values: readonly number[], k = 1.5): number[] {
  const [q1, , q3] = quartiles(values)
  const spread = q3 - q1
  return values.filter((value) => value < q1 - k * spread || value > q3 + k * spread)
}
