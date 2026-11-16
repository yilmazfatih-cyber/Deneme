// fark modülünün testi: ortak vektörler + fark uygulanınca hedefin çıkması ve en kısa olma (LCS ile).
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as fark from '../src/fark.ts'
import { diffByKey, diffSequences, unifiedDiff } from '../src/fark.ts'

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

/** Bağımsız gerçekleme: dinamik programlamayla en uzun ortak alt dizi uzunluğu. */
function lcsLength(a: string[], b: string[]): number {
  const row = new Array<number>(b.length + 1).fill(0)
  for (const x of a) {
    let diagonal = 0
    for (let j = 1; j <= b.length; j++) {
      const up = row[j] ?? 0
      row[j] = x === b[j - 1] ? diagonal + 1 : Math.max(up, row[j - 1] ?? 0)
      diagonal = up
    }
  }
  return row[b.length] ?? 0
}

describe('ortak vektörler', () => {
  for (const [name, cases] of Object.entries(loadVectors('fark'))) {
    const fn = (fark as Record<string, unknown>)[name] as (...args: unknown[]) => unknown
    cases.forEach((testCase, index) => {
      it(`${name} #${index + 1}`, () => {
        const args = testCase.secenek ? [...testCase.girdi, testCase.secenek] : testCase.girdi
        expect(fn(...args)).toEqual(testCase.cikti)
      })
    })
  }
})

describe('özellikler', () => {
  it('fark uygulanınca hedef çıkar ve düzenleme sayısı en azdır (n + m − 2·LCS)', () => {
    const random = seededRandom(61)
    for (let i = 0; i < 400; i++) {
      const a = Array.from({ length: Math.floor(random() * 12) }, () => 'abc'[Math.floor(random() * 3)] ?? 'a')
      const b = Array.from({ length: Math.floor(random() * 12) }, () => 'abc'[Math.floor(random() * 3)] ?? 'a')
      const ops = diffSequences(a, b)
      const rebuiltA = ops.filter((op) => op.type !== 'insert').flatMap((op) => op.items)
      const rebuiltB = ops.filter((op) => op.type !== 'delete').flatMap((op) => op.items)
      expect(rebuiltA).toEqual(a)
      expect(rebuiltB).toEqual(b)
      const edits = ops.filter((op) => op.type !== 'equal').reduce((sum, op) => sum + op.items.length, 0)
      expect(edits).toBe(a.length + b.length - 2 * lcsLength(a, b))
    }
  })

  it('diffByKey taşınmayı değişiklik saymaz', () => {
    const before = [
      { id: 1, ad: 'Ali' },
      { id: 2, ad: 'Veli' },
      { id: 3, ad: 'Can' },
    ]
    const after = [
      { id: 3, ad: 'Can' },
      { id: 1, ad: 'Ali Rıza' },
      { id: 4, ad: 'Ece' },
    ]
    const result = diffByKey(before, after, (k) => k.id)
    expect(result.added).toEqual([{ id: 4, ad: 'Ece' }])
    expect(result.removed).toEqual([{ id: 2, ad: 'Veli' }])
    expect(result.changed).toEqual([{ before: { id: 1, ad: 'Ali' }, after: { id: 1, ad: 'Ali Rıza' } }])
    expect(result.unchanged).toEqual([{ id: 3, ad: 'Can' }])
    expect(unifiedDiff('a\n', 'a\n')).toBe('')
  })
})
