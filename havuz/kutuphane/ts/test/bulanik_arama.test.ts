// bulanik_arama modülünün testi: ortak vektörler (kesirli puan hoşgörülü) + uzaklıkların metrik özellikleri.
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as bulanik from '../src/bulanik_arama.ts'
import { damerauLevenshtein, fuzzySearch, levenshtein } from '../src/bulanik_arama.ts'

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

/** Sayılarda 1e-9 hoşgörüyle derin karşılaştırma. */
function expectClose(actual: unknown, expected: unknown, path = '$'): void {
  if (typeof expected === 'number') {
    expect(typeof actual, path).toBe('number')
    expect(Math.abs((actual as number) - expected), path).toBeLessThan(1e-9)
  } else if (Array.isArray(expected)) {
    expect(Array.isArray(actual), path).toBe(true)
    expect((actual as unknown[]).length, path).toBe(expected.length)
    expected.forEach((item, i) => expectClose((actual as unknown[])[i], item, `${path}[${i}]`))
  } else if (expected !== null && typeof expected === 'object') {
    expect(Object.keys(actual as object).sort(), path).toEqual(Object.keys(expected).sort())
    for (const [key, value] of Object.entries(expected)) expectClose((actual as Record<string, unknown>)[key], value, `${path}.${key}`)
  } else expect(actual, path).toEqual(expected)
}

describe('ortak vektörler', () => {
  for (const [name, cases] of Object.entries(loadVectors('bulanik_arama'))) {
    const fn = (bulanik as Record<string, unknown>)[name] as (...args: unknown[]) => unknown
    cases.forEach((testCase, index) => {
      it(`${name} #${index + 1}: ${JSON.stringify(testCase.girdi)}`, () => {
        const args = testCase.secenek ? [...testCase.girdi, testCase.secenek] : testCase.girdi
        expectClose(fn(...args), testCase.cikti)
      })
    })
  }
})

describe('uzaklık özellikleri', () => {
  const words = ['', 'a', 'ab', 'ba', 'abc', 'acb', 'ankara', 'ankra', 'çay', 'cay', 'kitap', 'kitaplık', 'İzmir']

  it('simetrik, üçgen eşitsizliği, Damerau ≤ Levenshtein, sınırlı sürüm tutarlı', () => {
    for (const a of words) {
      for (const b of words) {
        const lev = levenshtein(a, b)
        expect(levenshtein(b, a)).toBe(lev)
        expect(damerauLevenshtein(a, b)).toBe(damerauLevenshtein(b, a))
        expect(damerauLevenshtein(a, b)).toBeLessThanOrEqual(lev)
        expect(lev === 0).toBe(a === b)
        for (const max of [0, 1, 2]) expect(levenshtein(a, b, max)).toBe(lev <= max ? lev : max + 1)
        for (const c of words) expect(lev).toBeLessThanOrEqual(levenshtein(a, c) + levenshtein(c, b))
      }
    }
  })

  it('nesne listesinde alanla arar; büyük/küçük ve Türkçe harf farkı önemsizdir', () => {
    const people = [{ ilce: 'Kadıköy' }, { ilce: 'Üsküdar' }, { ilce: 'Şişli' }]
    expect(fuzzySearch('USKUDAR', people, { key: (p) => p.ilce })[0]?.item.ilce).toBe('Üsküdar')
    expect(fuzzySearch('sisli', people, { key: (p) => p.ilce })[0]?.score).toBe(1)
    expect(fuzzySearch('kadkoy', people, { key: (p) => p.ilce })[0]?.item.ilce).toBe('Kadıköy')
  })
})
