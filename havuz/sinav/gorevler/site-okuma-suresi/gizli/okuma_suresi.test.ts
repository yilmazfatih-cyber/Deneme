/**
 * Gizli sınav testi (site-okuma-suresi): okuma süresi en az 1 dakika; uzun yazıda değişmez.
 */
import { describe, expect, it } from 'vitest'
import { readingMinutes } from '../../src/lib/collections.ts'

const words = (count: number) => Array.from({ length: count }, (_, i) => `kelime${i}`).join(' ')

describe('gizli: okuma süresi', () => {
  it('kısa ya da boş yazı 1 dakika', () => {
    expect(readingMinutes('kısa')).toBe(1)
    expect(readingMinutes('')).toBe(1)
    expect(readingMinutes(words(99))).toBe(1)
    expect(readingMinutes('# Başlık\n\nBir iki üç.')).toBe(1)
  })

  it('uzun yazıda süre kelime sayısıyla (200 kelime/dk, yuvarlanarak)', () => {
    expect(readingMinutes(words(300))).toBe(2)
    expect(readingMinutes(words(1000))).toBe(5)
    expect(readingMinutes(words(2100))).toBe(11)
  })
})
