import { describe, expect, it } from 'vitest'
import { decide, maxAllowedIndex, type AbrInput } from './controller'
import { Ewma, ThroughputEstimator } from './estimator'

const ladder = [
  { bitrateKbps: 100, height: 144 },
  { bitrateKbps: 300, height: 240 },
  { bitrateKbps: 550, height: 360 },
  { bitrateKbps: 750, height: 480 },
  { bitrateKbps: 1800, height: 720 },
]

function input(p: Partial<AbrInput>): AbrInput {
  return { streams: ladder, currentIndex: 1, estimateKbps: 500, bufferSec: 20, lockedIndex: null, maxHeight: null, ...p }
}

describe('ThroughputEstimator', () => {
  it('yeterli veri gelene kadar varsayılanı döndürür', () => {
    const e = new ThroughputEstimator({ defaultKbps: 400 })
    expect(e.estimateKbps()).toBe(400)
    expect(e.sample(1000, 10)).toBe(false) // küçük örnek sayılmaz
    e.sample(64_000, 512) // 1000 kbps
    expect(e.estimateKbps()).toBe(400) // 128 KB'a ulaşılmadı
    e.sample(64_000, 512)
    expect(e.estimateKbps()).toBeCloseTo(1000, 0)
  })

  it('hızlı ortalama düşüşe hemen tepki verir, tahmin min(hızlı, yavaş)', () => {
    const e = new ThroughputEstimator()
    for (let i = 0; i < 10; i++) e.sample(500_000, 1000) // 4000 kbps
    expect(e.estimateKbps()).toBeCloseTo(4000, 0)
    e.sample(100_000, 4000) // 200 kbps, 4 sn
    const s = e.stats()
    expect(s.fastKbps).toBeLessThan(s.slowKbps)
    expect(Math.round(e.estimateKbps())).toBe(Math.min(s.fastKbps, s.slowKbps))
    expect(e.estimateKbps()).toBeLessThan(2000)
  })

  it('EWMA sıfır yanlılığını düzeltir', () => {
    const w = new Ewma(2)
    w.sample(1, 100)
    expect(w.value()).toBeCloseTo(100)
  })
})

describe('ABR denetleyicisi', () => {
  it('başlangıçta tahminin 0,85 katına sığan en yüksek akışı seçer', () => {
    expect(decide(input({ currentIndex: null, estimateKbps: 700 }))).toEqual({ index: 2, reason: 'başlangıç' }) // 595 → 550
    expect(decide(input({ currentIndex: null, estimateKbps: 50 }))).toEqual({ index: 0, reason: 'başlangıç' })
  })

  it('yukarı geçiş yalnızca tampon ≥ 10 sn iken', () => {
    expect(decide(input({ currentIndex: 1, estimateKbps: 3000, bufferSec: 9.9 })).index).toBe(1)
    expect(decide(input({ currentIndex: 1, estimateKbps: 3000, bufferSec: 10 }))).toEqual({ index: 4, reason: 'bant genişliği arttı' })
  })

  it('tampon < 5 sn ise hemen aşağı iner', () => {
    expect(decide(input({ currentIndex: 3, estimateKbps: 800, bufferSec: 4 }))).toEqual({ index: 2, reason: 'tampon azaldı' })
  })

  it('tampon yeterliyken mevcut hız tahmini aşmıyorsa yerinde kalır, aşıyorsa iner', () => {
    expect(decide(input({ currentIndex: 3, estimateKbps: 800, bufferSec: 20 })).index).toBe(3) // 750 ≤ 800
    expect(decide(input({ currentIndex: 3, estimateKbps: 400, bufferSec: 20 }))).toEqual({ index: 1, reason: 'bant genişliği düştü' })
  })

  it('elle kilit her şeyin önündedir', () => {
    expect(decide(input({ lockedIndex: 4, estimateKbps: 100, bufferSec: 1 }))).toEqual({ index: 4, reason: 'elle' })
    expect(decide(input({ currentIndex: 4, lockedIndex: 4 })).reason).toBe('aynı')
  })

  it('önizleme yükseklik sınırı', () => {
    expect(maxAllowedIndex(ladder, 360)).toBe(2)
    expect(decide(input({ currentIndex: null, estimateKbps: 10_000, maxHeight: 360 })).index).toBe(2)
    expect(decide(input({ currentIndex: 4, estimateKbps: 10_000, maxHeight: 360 }))).toEqual({ index: 2, reason: 'sınır' })
  })
})
