// istatistik modülünün testi: ortak vektörler (hoşgörülü) + saf (iki geçişli) gerçeklemeyle karşılaştırma.
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as istatistik from '../src/istatistik.ts'
import { histogram, mean, preciseSum, quantile, StatsError, variance } from '../src/istatistik.ts'

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

function expectClose(actual: unknown, expected: unknown, path = '$'): void {
  if (typeof expected === 'number') {
    expect(typeof actual, path).toBe('number')
    expect(Math.abs((actual as number) - expected), path).toBeLessThan(1e-9)
  } else if (Array.isArray(expected)) {
    expect((actual as unknown[]).length, path).toBe(expected.length)
    expected.forEach((item, i) => expectClose((actual as unknown[])[i], item, `${path}[${i}]`))
  } else if (expected !== null && typeof expected === 'object') {
    for (const [key, value] of Object.entries(expected)) expectClose((actual as Record<string, unknown>)[key], value, `${path}.${key}`)
  } else expect(actual, path).toEqual(expected)
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('ortak vektörler', () => {
  for (const [name, cases] of Object.entries(loadVectors('istatistik'))) {
    const fn = (istatistik as Record<string, unknown>)[name] as (...args: unknown[]) => unknown
    cases.forEach((testCase, index) => {
      it(`${name} #${index + 1}`, () => {
        const args = testCase.secenek ? [...testCase.girdi, testCase.secenek] : testCase.girdi
        if (testCase.hata) expect(() => fn(...args)).toThrow(StatsError)
        else expectClose(fn(...args), testCase.cikti)
      })
    })
  }
})

describe('başvuru gerçeklemesiyle karşılaştırma', () => {
  it('Welford varyansı iki geçişli tanımla, R7 yüzdebirlik sıralı diziyle uyumlu', () => {
    const random = seededRandom(71)
    for (let i = 0; i < 300; i++) {
      const values = Array.from({ length: 2 + Math.floor(random() * 50) }, () => (random() - 0.5) * 1000)
      const m = values.reduce((a, b) => a + b, 0) / values.length
      const twoPass = values.reduce((a, v) => a + (v - m) ** 2, 0) / (values.length - 1)
      expect(Math.abs(variance(values) - twoPass)).toBeLessThan(1e-8 * Math.max(1, twoPass))
      expect(Math.abs(mean(values) - m)).toBeLessThan(1e-9)
      const sortedValues = [...values].sort((a, b) => a - b)
      expect(quantile(values, 0)).toBe(sortedValues[0])
      expect(quantile(values, 1)).toBe(sortedValues[sortedValues.length - 1])
      const counts = histogram(values, { bins: 7 }).counts
      expect(counts.reduce((a, b) => a + b, 0)).toBe(values.length)
    }
  })

  it('hassas toplam büyük ve küçük sayıları birlikte kaybetmez; NaN reddedilir', () => {
    expect(preciseSum([1e100, 1, -1e100])).toBe(1)
    expect(() => mean([1, Number.NaN])).toThrow(StatsError)
  })
})
