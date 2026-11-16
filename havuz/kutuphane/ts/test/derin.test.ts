// derin modülünün testi: ortak vektörler + döngüsel yapılar, özel türler, kopyanın bağımsızlığı.
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as derin from '../src/derin.ts'
import { deepClone, deepEqual, deepFreeze, deepMerge, setPath } from '../src/derin.ts'

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
  for (const [name, cases] of Object.entries(loadVectors('derin'))) {
    const fn = (derin as Record<string, unknown>)[name] as (...args: unknown[]) => unknown
    cases.forEach((testCase, index) => {
      it(`${name} #${index + 1}`, () => {
        const args = testCase.secenek ? [...testCase.girdi, testCase.secenek] : testCase.girdi
        if (testCase.hata) expect(() => fn(...args)).toThrow()
        else expect(fn(...args)).toEqual(testCase.cikti)
      })
    })
  }
})

describe('özel durumlar', () => {
  it('NaN, Date, RegExp, Map, Set, tipli dizi ve döngüsel yapı', () => {
    expect(deepEqual({ x: Number.NaN }, { x: Number.NaN })).toBe(true)
    expect(deepEqual(new Date(5), new Date(5))).toBe(true)
    expect(deepEqual(new Date(5), new Date(6))).toBe(false)
    expect(deepEqual(/a/g, /a/g)).toBe(true)
    expect(deepEqual(new Map([[1, { a: 1 }]]), new Map([[1, { a: 1 }]]))).toBe(true)
    expect(deepEqual(new Set([1, 2]), new Set([2, 1]))).toBe(true)
    expect(deepEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true)
    expect(deepEqual(new Uint8Array([1, 2]), new Uint16Array([1, 2]))).toBe(false)
    const a: Record<string, unknown> = { ad: 'a' }
    a.ben = a
    const b: Record<string, unknown> = { ad: 'a' }
    b.ben = b
    expect(deepEqual(a, b)).toBe(true)
  })

  it('kopya bağımsızdır ve döngüler korunur', () => {
    const original: Record<string, unknown> = {
      liste: [1, { iç: true }],
      tarih: new Date(0),
      harita: new Map([['k', [1]]]),
    }
    original.kendisi = original
    const copy = deepClone(original)
    expect(copy).not.toBe(original)
    expect(copy.kendisi).toBe(copy)
    expect(deepEqual(copy, original)).toBe(true)
    ;((copy.liste as unknown[])[1] as Record<string, boolean>).iç = false
    expect(((original.liste as unknown[])[1] as Record<string, boolean>).iç).toBe(true)
  })

  it('birleştirme ve yol yazma girdiyi değiştirmez; donmuş nesne değiştirilemez', () => {
    const base = deepFreeze({ a: { b: 1 }, liste: [1] })
    const merged = deepMerge(base, { a: { c: 2 } })
    expect(merged).toEqual({ a: { b: 1, c: 2 }, liste: [1] })
    const updated = setPath(base, 'a.b', 9)
    expect(updated.a.b).toBe(9)
    expect(base.a.b).toBe(1)
    expect(Object.isFrozen(base.a)).toBe(true)
    expect(Reflect.set(base.a, 'b', 2)).toBe(false) // donmuş nesneye yazılamaz
    expect(base.a.b).toBe(1)
    expect(({} as Record<string, unknown>).kirli).toBeUndefined()
  })
})
