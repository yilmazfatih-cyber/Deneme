import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMonths,
  addMonthsToDate,
  dateInMonth,
  diffDays,
  isDate,
  isoToLocal,
  localToIso,
  monthLabel,
  today,
} from '../../server/domain/dates.ts'
import { formatTL, parseAmount, roundTo, splitByWeights } from '../../server/domain/money.ts'

describe('parseAmount', () => {
  it.each([
    ['1.234,56', 123456],
    ['1234,5', 123450],
    ['1234.56', 123456],
    ['1.234', 123400],
    ['1.234.567', 123456700],
    ['1,234', 123400],
    ['₺1.250,00', 125000],
    ['-1.234,56 TL', -123456],
    ['2.500', 250000],
    ['0,99', 99],
    ['12.5', 1250],
    [1250.5, 125050],
  ])('%s → %i kuruş', (input, expected) => {
    expect(parseAmount(input)).toBe(expected)
  })

  it('geçersiz girdide null döner', () => {
    expect(parseAmount('abc')).toBeNull()
    expect(parseAmount('')).toBeNull()
  })
})

describe('splitByWeights', () => {
  it('toplamı kuruşu kuruşuna korur', () => {
    const parts = splitByWeights(100_000, [1, 1, 1])
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100_000)
    expect(parts).toEqual([33_334, 33_333, 33_333])
  })

  it('arsa payı oranında böler', () => {
    expect(splitByWeights(1_200_000, [24, 36, 60])).toEqual([240_000, 360_000, 600_000])
  })

  it('ondalıklı ağırlık (m²) ve büyük tutarlarda taşma olmaz', () => {
    const parts = splitByWeights(9_999_999_999, [95.5, 120.25, 80, 143.7])
    expect(parts.reduce((a, b) => a + b, 0)).toBe(9_999_999_999)
  })

  it('tüm ağırlıklar sıfırsa eşit böler', () => {
    expect(splitByWeights(10, [0, 0])).toEqual([5, 5])
  })
})

describe('para biçimi', () => {
  it('Türk lirası biçimi', () => {
    expect(formatTL(123456)).toBe('₺1.234,56')
    expect(roundTo(123_456, 100)).toBe(123_500)
  })
})

describe('tarihler', () => {
  it('İstanbul günü', () => {
    expect(today(new Date('2026-11-09T22:30:00Z'))).toBe('2026-11-10')
    expect(today(new Date('2026-11-09T20:59:00Z'))).toBe('2026-11-09')
  })

  it('gün ve ay aritmetiği', () => {
    expect(addDays('2026-02-27', 2)).toBe('2026-03-01')
    expect(diffDays('2026-01-15', '2026-02-14')).toBe(30)
    expect(addMonths('2026-11', 3)).toBe('2027-02')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(dateInMonth('2027-02', 31)).toBe('2027-02-28')
    expect(addMonthsToDate('2026-01-31', 1)).toBe('2026-02-28')
    expect(monthLabel('2026-11')).toBe('Kasım 2026')
    expect(isDate('2026-02-30')).toBe(false)
  })

  it('yerel saat ↔ ISO', () => {
    expect(localToIso('2026-12-01T19:30')).toBe('2026-12-01T16:30:00Z')
    expect(isoToLocal('2026-12-01T16:30:00Z')).toBe('2026-12-01T19:30')
  })
})
