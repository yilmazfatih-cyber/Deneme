import { describe, expect, it } from 'vitest'
import { findSensitive, isValidTckn, luhn } from '../src/profile/sensitive.js'

describe('isValidTckn', () => {
  it('accepts a number with correct check digits and rejects near misses', () => {
    expect(isValidTckn('10000000146')).toBe(true)
    expect(isValidTckn('10000000147')).toBe(false)
    expect(isValidTckn('00000000000')).toBe(false)
    expect(isValidTckn('1000000014')).toBe(false)
    expect(isValidTckn('abcdefghijk')).toBe(false)
  })
})

describe('luhn', () => {
  it('validates card numbers', () => {
    expect(luhn('4111111111111111')).toBe(true)
    expect(luhn('4111111111111112')).toBe(false)
  })
})

describe('findSensitive', () => {
  it('finds TC kimlik no inside a sentence', () => {
    expect(findSensitive('TC kimlik numaram 10000000146 olarak geçer')).toBe('tckn')
  })
  it('finds IBAN with or without spaces', () => {
    expect(findSensitive('IBAN: TR33 0006 1005 1978 6457 8413 26')).toBe('iban')
    expect(findSensitive('tr330006100519786457841326')).toBe('iban')
  })
  it('finds card numbers with separators', () => {
    expect(findSensitive('kartım 4111 1111 1111 1111')).toBe('card')
    expect(findSensitive('4111-1111-1111-1111')).toBe('card')
  })
  it('finds passwords and keys through looksSecret', () => {
    expect(findSensitive('şifrem: Kedi1234!')).toBe('secret')
    expect(findSensitive('sk-abcdefghijklmnopqrstuvwxyz123456')).toBe('secret')
  })
  it('leaves ordinary personal facts alone', () => {
    for (const ok of [
      'Annemin adı Fatma, 14 Mart doğumlu',
      'Telefon: +90 532 123 45 67',
      'Telefon: 0532 123 45 67',
      'Randevu 5 Kasım saat 14:30, Kadıköy',
      'Kan grubum A Rh+',
      'Plaka 34 ABC 123',
    ]) {
      expect(findSensitive(ok), ok).toBeUndefined()
    }
  })
})
