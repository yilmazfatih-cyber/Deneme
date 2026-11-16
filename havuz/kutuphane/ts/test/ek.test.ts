// ek modülünün testi: ortak vektörler (vektorler/ek.json) + sayı okunuşu özellik testleri.
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as ek from '../src/ek.ts'
import { addSuffix, readingForSuffix, suffixOf, SuffixError } from '../src/ek.ts'

interface VectorCase {
  girdi: unknown[]
  secenek?: Record<string, unknown>
  cikti?: unknown
  hata?: boolean
}

function loadVectors(name: string): Record<string, VectorCase[]> {
  for (const relative of [`./vektorler/${name}.json`, `../../vektorler/${name}.json`]) {
    const url = new URL(relative, import.meta.url)
    if (existsSync(url)) return JSON.parse(readFileSync(url, 'utf8')).islevler
  }
  throw new Error(`vektorler/${name}.json bulunamadı (testin yanında ya da kutuphane/vektorler altında olmalı)`)
}

describe('ortak vektörler', () => {
  for (const [name, cases] of Object.entries(loadVectors('ek'))) {
    const fn = (ek as Record<string, unknown>)[name] as (...args: unknown[]) => unknown
    cases.forEach((testCase, index) => {
      it(`${name} #${index + 1}: ${JSON.stringify(testCase.girdi)}`, () => {
        const args = testCase.secenek ? [...testCase.girdi, testCase.secenek] : testCase.girdi
        if (testCase.hata) expect(() => fn(...args)).toThrow(SuffixError)
        else expect(fn(...args)).toEqual(testCase.cikti)
      })
    })
  }
})

describe('sayı okunuşu', () => {
  const ones = ['sıfır', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz']
  const tens = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan']

  it('son basamak sıfır değilse okunuş birler basamağının adıdır', () => {
    for (let n = 1; n < 5000; n++) {
      if (n % 10 === 0) continue
      expect(readingForSuffix(String(n))).toBe(ones[n % 10])
    }
  })

  it('onlar, yüzler ve binler doğru sözcükle biter', () => {
    for (let n = 10; n < 5000; n += 10) {
      const expected = n % 100 !== 0 ? tens[(n / 10) % 10] : n % 1000 !== 0 ? 'yüz' : 'bin'
      expect(readingForSuffix(String(n))).toBe(expected)
    }
  })

  it('her sayıya her ek getirilebilir ve sonuç sayıyla başlar', () => {
    const kinds = ['dative', 'locative', 'ablative', 'accusative', 'genitive', 'instrumental', 'ordinal'] as const
    for (let n = 0; n < 300; n++) {
      for (const kind of kinds) {
        const result = addSuffix(String(n), kind)
        expect(result.startsWith(`${n}'`)).toBe(true)
        expect(result.length).toBeGreaterThan(String(n).length + 1)
      }
    }
  })

  it('bulunma ekinde sert ünsüzden sonra t gelir', () => {
    for (const [n, suffix] of [
      ['3', 'te'],
      ['4', 'te'],
      ['5', 'te'],
      ['60', 'ta'],
      ['70', 'te'],
      ['40', 'ta'],
    ] as const) {
      expect(suffixOf(n, 'locative')).toBe(suffix)
    }
  })
})
