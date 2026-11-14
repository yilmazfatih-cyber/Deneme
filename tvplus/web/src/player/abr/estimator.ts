/**
 * Bant genişliği tahmincisi: iki üstel ağırlıklı ortalama (hızlı ve yavaş yarı ömür), her indirilen bölüm bir örnek.
 * Örneğin ağırlığı indirme süresidir (sn); tahmin = min(hızlı, yavaş) — düşüşlere hızlı, artışlara temkinli tepki.
 */

export class Ewma {
  private readonly alpha: number
  private estimate = 0
  private totalWeight = 0
  constructor(halfLifeSec: number) {
    this.alpha = Math.exp(Math.log(0.5) / halfLifeSec)
  }
  sample(weight: number, value: number): void {
    const adj = Math.pow(this.alpha, weight)
    this.estimate = value * (1 - adj) + adj * this.estimate
    this.totalWeight += weight
  }
  /** Sıfırdan başlama yanlılığı düzeltilmiş ortalama. */
  value(): number {
    const zeroFactor = 1 - Math.pow(this.alpha, this.totalWeight)
    return zeroFactor > 0 ? this.estimate / zeroFactor : 0
  }
}

export interface EstimatorOptions {
  fastHalfLifeSec?: number
  slowHalfLifeSec?: number
  /** Bundan küçük indirmeler (gecikme baskın) örnek sayılmaz */
  minSampleBytes?: number
  /** Tahmin verilmeden önce gereken toplam bayt */
  minTotalBytes?: number
  defaultKbps?: number
}

export class ThroughputEstimator {
  private fast: Ewma
  private slow: Ewma
  private bytesSampled = 0
  private samples = 0
  private readonly minSampleBytes: number
  private readonly minTotalBytes: number
  private defaultKbps: number
  private lastKbps: number | null = null

  constructor(o: EstimatorOptions = {}) {
    this.fast = new Ewma(o.fastHalfLifeSec ?? 2)
    this.slow = new Ewma(o.slowHalfLifeSec ?? 5)
    this.minSampleBytes = o.minSampleBytes ?? 16_000
    this.minTotalBytes = o.minTotalBytes ?? 128_000
    this.defaultKbps = o.defaultKbps ?? 500
  }

  /** Bir bölüm indirmesi: bayt ve süre (ms). */
  sample(bytes: number, durationMs: number): boolean {
    if (bytes < this.minSampleBytes || durationMs <= 0) return false
    const kbps = (bytes * 8) / durationMs
    const weight = durationMs / 1000
    this.fast.sample(weight, kbps)
    this.slow.sample(weight, kbps)
    this.bytesSampled += bytes
    this.samples += 1
    this.lastKbps = kbps
    return true
  }

  hasGoodEstimate(): boolean {
    return this.bytesSampled >= this.minTotalBytes
  }

  estimateKbps(): number {
    if (!this.hasGoodEstimate()) return this.defaultKbps
    return Math.min(this.fast.value(), this.slow.value())
  }

  setDefaultKbps(kbps: number): void {
    this.defaultKbps = kbps
  }

  stats(): {
    estimateKbps: number
    fastKbps: number
    slowKbps: number
    samples: number
    lastKbps: number | null
    good: boolean
  } {
    return {
      estimateKbps: Math.round(this.estimateKbps()),
      fastKbps: Math.round(this.fast.value()),
      slowKbps: Math.round(this.slow.value()),
      samples: this.samples,
      lastKbps: this.lastKbps === null ? null : Math.round(this.lastKbps),
      good: this.hasGoodEstimate(),
    }
  }
}
