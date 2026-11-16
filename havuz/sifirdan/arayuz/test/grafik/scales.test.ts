import { describe, expect, it } from 'vitest'
import {
  bandScale,
  formatAxis,
  formatNumber,
  formatPercent,
  linearScale,
  niceDomain,
  niceLinear,
  stepDecimals,
  tickStep,
  ticks,
  timeScale,
  timeTicks,
} from '../../src/grafik/index.ts'

describe('güzel eksen adımları', () => {
  it('adım 1, 2, 5 × 10ⁿ olur', () => {
    expect(tickStep(0, 1, 5)).toBe(0.2)
    expect(tickStep(0, 97, 5)).toBe(20)
    expect(tickStep(0, 1000, 10)).toBe(100)
    expect(tickStep(0, 0.07, 5)).toBe(0.01)
    expect(tickStep(-3.2, 7.8, 5)).toBe(2)
    expect(tickStep(5, 5, 5)).toBe(1)
  })

  it('çizgiler adımın katlarıdır; kayan nokta hatası sızmaz; ters aralık ters sıralı döner', () => {
    expect(ticks(0, 1, 5)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1])
    expect(ticks(0, 0.3, 3)).toEqual([0, 0.1, 0.2, 0.3])
    expect(ticks(-3.2, 7.8, 5)).toEqual([-2, 0, 2, 4, 6])
    expect(ticks(1e6, 5e6, 4)).toEqual([1e6, 2e6, 3e6, 4e6, 5e6])
    expect(ticks(10, 0, 5)).toEqual([10, 8, 6, 4, 2, 0])
    expect(ticks(3, 3)).toEqual([3])
    expect(stepDecimals(0.25)).toBe(2)
  })

  it('tanım aralığı güzel sınırlara genişler; tek değer aralığa açılır', () => {
    expect(niceDomain(3, 97)).toEqual([0, 100])
    expect(niceDomain(-0.37, 0.82)).toEqual([-0.4, 1])
    expect(niceDomain(0, 0)).toEqual([0, 1])
    expect(niceDomain(50, 50)).toEqual([44, 56])
  })
})

describe('ölçekler', () => {
  it('doğrusal: eşleme, ters eşleme, kırpma; niceLinear sıfırı içerir', () => {
    const s = linearScale([0, 100], [300, 0])
    expect(s(25)).toBe(225)
    expect(s.invert(225)).toBe(25)
    expect(linearScale([0, 10], [0, 100], true)(20)).toBe(100)
    expect(niceLinear([12, 87], [0, 1]).domain).toEqual([0, 100])
    expect(niceLinear([-5, 12], [0, 1], 5, true).domain).toEqual([-5, 15])
  })

  it('bant: eşit bantlar, iç ve dış boşluk', () => {
    const band = bandScale(4, [0, 100], 0.2, 0.1)
    expect(band.step).toBeCloseTo(100 / 4, 10)
    expect(band.bandwidth).toBeCloseTo(20, 10)
    expect(band(0)).toBeCloseTo(2.5, 10)
    expect(band(3) + band.bandwidth + band.step * 0.1).toBeCloseTo(100, 10)
  })

  it('zaman: aralığa uygun takvim adımı ve Türkçe etiket', () => {
    const day = (d: number, m = 10, y = 2026) => Date.UTC(y, m, d)
    expect(timeTicks(day(1), day(8), 6).map((t) => t.label)).toEqual(['1 Kas', '3 Kas', '5 Kas', '7 Kas'])
    expect(timeTicks(day(15, 0), day(15, 11), 6).map((t) => t.label)).toEqual(['Nis 2026', 'Tem 2026', 'Eki 2026'])
    const quarters = timeTicks(Date.UTC(2025, 1, 10), Date.UTC(2026, 10, 1), 8)
    expect(quarters.map((t) => new Date(t.value).getUTCMonth() % 3)).toEqual(quarters.map(() => 0))
    expect(timeTicks(Date.UTC(2000, 0, 1), Date.UTC(2030, 0, 1), 6).map((t) => t.label)).toEqual([
      '2000',
      '2005',
      '2010',
      '2015',
      '2020',
      '2025',
      '2030',
    ])
    expect(timeTicks(Date.UTC(2026, 0, 1, 9), Date.UTC(2026, 0, 1, 17), 5).map((t) => t.label)).toEqual([
      '09:00',
      '12:00',
      '15:00',
    ])
    const s = timeScale([new Date(day(1)), new Date(day(11))], [0, 100])
    expect(s(new Date(day(6)))).toBe(50)
  })
})

describe('Türkçe biçim', () => {
  it('binlik nokta, ondalık virgül, kısaltma ve yüzde', () => {
    expect(formatNumber(1234567.891)).toBe('1.234.567,89')
    // Intl, sayı ile kısaltma arasına bölünmez boşluk (U+00A0) koyar: satır sonunda ayrılmasınlar diye.
    expect(formatAxis(15300)).toBe('15,3\u00a0B')
    expect(formatAxis(1_200_000)).toBe('1,2\u00a0Mn')
    expect(formatAxis(950)).toBe('950')
    expect(formatPercent(0.256)).toBe('%25,6')
  })
})
