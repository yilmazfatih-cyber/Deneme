import { describe, expect, it } from 'vitest'
import { isId, uuidv7, uuidv7Time } from '../src/index.ts'

describe('uuidv7', () => {
  it('RFC 9562 biçimindedir (sürüm 7, RFC varyantı)', () => {
    const id = uuidv7()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(isId(id)).toBe(true)
  })

  it('zaman damgasını taşır ve zamana göre sıralanır', () => {
    const zero = (bytes: Uint8Array) => bytes.fill(0)
    const early = uuidv7(1_700_000_000_000, zero)
    const late = uuidv7(1_700_000_000_001, zero)
    expect(early < late).toBe(true)
    expect(uuidv7Time(early)).toBe(1_700_000_000_000)
    expect(uuidv7Time(uuidv7(2 ** 44 + 5, zero))).toBe(2 ** 44 + 5)
    expect(uuidv7Time('uuid-degil')).toBeNull()
  })

  it('çakışmaz (10 bin üretimde)', () => {
    const ids = new Set(Array.from({ length: 10_000 }, () => uuidv7()))
    expect(ids.size).toBe(10_000)
  })

  it('kimlik biçimi: harf, rakam, alt çizgi, tire; 1–64 karakter', () => {
    expect(isId('local')).toBe(true)
    expect(isId('a_b-9')).toBe(true)
    expect(isId('')).toBe(false)
    expect(isId('a/b')).toBe(false)
    expect(isId('ş')).toBe(false)
    expect(isId('x'.repeat(65))).toBe(false)
    expect(isId(42)).toBe(false)
  })
})
