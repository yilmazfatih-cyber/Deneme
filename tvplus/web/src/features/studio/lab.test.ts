import { describe, expect, it } from 'vitest'
import {
  fin,
  fmtDay,
  fmtInterval,
  fmtP,
  fmtPlain,
  fmtPoints,
  fmtSignedPct,
  fmtTimes,
  fmtTimesTick,
  fmtUnit,
  fmtUnitDiff,
  ivStrength,
  linearAxis,
  logAxis,
  pctTickDigits,
  quantile,
  significant,
} from './labScales'

describe('laboratuvar biçimleri', () => {
  it('sonlu olmayan sayılar (JSON null) çizgiye döner', () => {
    expect(fin(0)).toBe(0)
    expect(fin(null)).toBeNull()
    expect(fin(undefined)).toBeNull()
    expect(fin(Number.NaN)).toBeNull()
    expect(fin(Number.POSITIVE_INFINITY)).toBeNull()
    expect(fmtP(null)).toBe('—')
    expect(fmtPlain(null)).toBe('—')
    expect(fmtTimes(Number.NaN)).toBe('—')
    expect(fmtSignedPct(null)).toBe('—')
    expect(fmtUnit(undefined, 'oran')).toBe('—')
    expect(fmtUnitDiff(null, 'dk')).toBe('—')
    expect(fmtInterval(null, 0.2, String)).toBe('')
  })
  it('p değeri ve anlamlılık', () => {
    expect(fmtP(0.34)).toBe('0,34')
    expect(fmtP(0.0123)).toBe('0,012')
    expect(fmtP(1)).toBe('1,00')
    expect(fmtP(6.4e-72)).toBe('< 0,001')
    expect(significant(0.049)).toBe(true)
    expect(significant(0.05)).toBe(false)
    expect(significant(null)).toBe(false)
  })
  it('kat, işaretli yüzde, puan', () => {
    expect(fmtTimes(4.153)).toBe('4,15×')
    expect(fmtTimes(13.513)).toBe('13,5×')
    expect(fmtTimesTick(0.5)).toBe('0,5×')
    expect(fmtTimesTick(1)).toBe('1×')
    expect(fmtTimesTick(20)).toBe('20×')
    expect(fmtSignedPct(0.008549)).toBe('+%0,85')
    expect(fmtSignedPct(-0.4673)).toBe('−%46,7')
    expect(fmtSignedPct(0)).toBe('%0')
    expect(fmtSignedPct(-0.00001)).toBe('%0')
    expect(fmtSignedPct(-0.075, 1)).toBe('−%7,5')
    expect(fmtPoints(0.0122)).toBe('+1,22 puan')
    expect(fmtPoints(-0.0079)).toBe('−0,79 puan')
    expect(fmtPoints(0)).toBe('0,00 puan')
    expect(fmtPlain(0.1749, 3)).toBe('0,175')
    expect(fmtPlain(-0.0016, 3)).toBe('−0,002')
    expect(fmtPlain(-0.0004, 3)).toBe('0,000')
  })
  it('birimli değer ve fark', () => {
    expect(fmtUnit(0.1912, 'oran')).toBe('%19,1')
    expect(fmtUnit(0.0149, 'oran')).toBe('%1,49')
    expect(fmtUnit(262.428, 'dk')).toBe('262,4 dk')
    expect(fmtUnit(4.1883, 'sayı')).toBe('4,19')
    expect(fmtUnit(0.0402, 'sayı')).toBe('0,040')
    expect(fmtUnit(0, 'sayı')).toBe('0,00')
    expect(fmtUnit(1500.4, 'sayı')).toBe('1.500')
    expect(fmtUnitDiff(4.2276, 'dk')).toBe('+4,2 dk')
    expect(fmtUnitDiff(-0.00787, 'oran')).toBe('−0,79 puan')
    expect(fmtUnitDiff(0.0487, 'sayı')).toBe('+0,049')
    expect(fmtUnitDiff(0, 'sayı')).toBe('0,00')
    // Satırın en büyük değerine göre basamak: fark ve aralık uçları aynı biçimde
    expect(fmtUnitDiff(0.017, 'sayı', 0.27)).toBe('+0,02')
    expect(fmtUnitDiff(-0.24, 'sayı', 0.27)).toBe('−0,24')
  })
  it('aralık, gün ve bilgi değeri', () => {
    expect(fmtInterval(3.5549, 4.8528, (v) => v.toFixed(2).replace('.', ','))).toBe('[3,55; 4,85]')
    expect(fmtDay('2026-07-14')).toBe('14 Tem 2026')
    expect(fmtDay('2026-11-01')).toBe('1 Kas 2026')
    expect(fmtDay('bozuk')).toBe('bozuk')
    expect(fmtDay(null)).toBe('—')
    expect(ivStrength(0.01)).toBe('zayıf')
    expect(ivStrength(0.05)).toBe('orta')
    expect(ivStrength(2.19)).toBe('güçlü')
    expect(ivStrength(null)).toBeNull()
  })
})

describe('aralık grafiği eksenleri', () => {
  it('dilim', () => {
    expect(quantile([], 0.8)).toBe(0)
    expect(quantile([3, 1, 2], 0.5)).toBe(2)
    expect(quantile([0, 10], 0.8)).toBe(8)
  })

  it('logaritmik eksen: aralıkları ve 1 çizgisini kapsar, değerler 1–2–5 dizisinden', () => {
    const axis = logAxis([
      { value: 4.15, lo: 3.55, hi: 4.85 },
      { value: 13.5, lo: 8.2, hi: 22.3 },
      { value: 0.54, lo: 0.46, hi: 0.63 },
    ])
    expect(axis.kind).toBe('log')
    expect(axis.min).toBeLessThan(0.46)
    expect(axis.max).toBeGreaterThan(22.3)
    expect(axis.ticks).toEqual([0.5, 1, 2, 5, 10, 20])
    expect(axis.pos(axis.min)).toBeCloseTo(0)
    expect(axis.pos(axis.max)).toBeCloseTo(1)
    // Logaritmik: 1'den 2'ye ve 2'den 4'e aynı uzaklık
    expect(axis.pos(2) - axis.pos(1)).toBeCloseTo(axis.pos(4) - axis.pos(2))
    expect(axis.pos(1)).toBeGreaterThan(axis.pos(0.54))
    expect(axis.clipped).toBe(false)
  })

  it('logaritmik eksen: boş, tek değerli ve sıfır uçlu satırlar', () => {
    const empty = logAxis([])
    expect(empty.min).toBeLessThan(1)
    expect(empty.max).toBeGreaterThan(1)
    expect(empty.ticks.length).toBeGreaterThanOrEqual(3)
    const zero = logAxis([{ value: 2, lo: 0, hi: 5 }])
    expect(zero.pos(0)).toBe(Number.NEGATIVE_INFINITY)
    expect(zero.min).toBeGreaterThan(0)
    const nulls = logAxis([{ value: null, lo: null, hi: null }])
    expect(Number.isFinite(nulls.min) && Number.isFinite(nulls.max)).toBe(true)
    // Dar aralıkta ince adımlar devreye girer
    expect(logAxis([{ value: 1.1, lo: 1.05, hi: 1.2 }]).ticks.length).toBeGreaterThanOrEqual(1)
  })

  it('doğrusal eksen: sıfır çizgisi içeride, kenarlarda pay', () => {
    const axis = linearAxis([
      { value: 0.026, lo: -0.06, hi: 0.11 },
      { value: -0.19, lo: -0.3, hi: -0.08 },
      { value: 0.17, lo: -0.21, hi: 0.56 },
    ])
    expect(axis.kind).toBe('linear')
    expect(axis.clipped).toBe(false)
    expect(axis.min).toBeLessThan(-0.3)
    expect(axis.max).toBeGreaterThan(0.56)
    expect(axis.pos(0)).toBeGreaterThan(0)
    expect(axis.pos(0)).toBeLessThan(1)
    expect(axis.ticks).toContain(0)
    expect(axis.pos(axis.max)).toBeCloseTo(1)
  })

  it('doğrusal eksen: tek aykırı satır ekseni ele geçirmez (daraltılır ve bildirilir)', () => {
    // deney-kalite: hata oranı −%47, ötekiler ±%7 içinde
    const rows = [
      { value: 0.0085, lo: 0.005, hi: 0.0121 },
      { value: -0.0192, lo: -0.0262, hi: -0.0122 },
      { value: -0.4673, lo: -0.5394, hi: -0.3952 },
      { value: -0.0357, lo: -0.0701, hi: -0.0013 },
      { value: 0.0061, lo: 0.0031, hi: 0.0091 },
      { value: 0.0015, lo: -0.0004, hi: 0.0034 },
      { value: 0.0107, lo: 0.0063, hi: 0.0151 },
      { value: 0.0025, lo: 0.0002, hi: 0.0049 },
      { value: -0.0165, lo: -0.026, hi: -0.007 },
      { value: 0.003, lo: -0.0004, hi: 0.0065 },
    ]
    const axis = linearAxis(rows)
    expect(axis.clipped).toBe(true)
    expect(axis.min).toBeGreaterThan(-0.2)
    expect(axis.min).toBeLessThan(-0.0701)
    expect(axis.pos(-0.4673)).toBeLessThan(0)
    // Aykırı olmayan satırların tamamı eksenin içinde
    for (const r of rows.filter((x) => x.value > -0.4)) {
      expect(axis.pos(r.lo)).toBeGreaterThanOrEqual(0)
      expect(axis.pos(r.hi)).toBeLessThanOrEqual(1)
    }
    // Az satırda kesme yapılmaz
    expect(linearAxis(rows.slice(0, 3)).clipped).toBe(false)
  })

  it('doğrusal eksen: hiç fark yokken (A/A) ve boşken küçük simetrik aralık', () => {
    const flat = linearAxis(Array.from({ length: 10 }, () => ({ value: 0, lo: 0, hi: 0 })))
    expect(flat.min).toBeLessThan(0)
    expect(flat.max).toBeGreaterThan(0)
    expect(flat.pos(0)).toBeCloseTo(0.5)
    expect(flat.clipped).toBe(false)
    const empty = linearAxis([{ value: null, lo: null, hi: null }])
    expect(empty.pos(0)).toBeCloseTo(0.5)
    expect(empty.ticks.length).toBeGreaterThan(0)
  })

  it('yüzde eksen değerleri için basamak', () => {
    expect(pctTickDigits([-0.1, 0, 0.1])).toBe(0)
    expect(pctTickDigits([-0.075, -0.05, -0.025, 0])).toBe(1)
    expect(pctTickDigits([-0.005, 0, 0.0025])).toBe(2)
  })
})
