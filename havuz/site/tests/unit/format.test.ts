import { describe, expect, it } from 'vitest'
import { formatDate, formatPrice, intlLocale, isoDate } from '../../src/lib/format.ts'

describe('biçimleme', () => {
  it('tarihi UTC olarak ve dile göre yazar', () => {
    const date = new Date('2026-11-16')
    expect(formatDate(date, 'tr')).toBe('16 Kasım 2026')
    expect(formatDate(date, 'en')).toBe('November 16, 2026')
    expect(isoDate(date)).toBe('2026-11-16')
  })

  it('Türk lirasını "TL" ile, diğerlerini simgeyle yazar', () => {
    expect(formatPrice(349, 'TRY', 'tr')).toBe('349 TL')
    expect(formatPrice(1299, 'TRY', 'tr')).toBe('1.299 TL')
    expect(formatPrice(19, 'USD', 'en')).toBe('$19')
  })

  it('bilinmeyen dil kodunu olduğu gibi kullanır', () => {
    expect(intlLocale('de')).toBe('de')
  })
})
