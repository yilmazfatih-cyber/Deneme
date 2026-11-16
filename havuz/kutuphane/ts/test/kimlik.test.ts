// kimlik modülünün testi: ortak vektörler + sıralılık, sapmasızlık ve sabit baytlarla diller arası aynı çıktı.
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as kimlik from '../src/kimlik.ts'
import {
  isUuid,
  readableCode,
  shortId,
  Uuidv7Generator,
  uuidv7,
  uuidv7Timestamp,
  validateReadableCode,
} from '../src/kimlik.ts'

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

/** Sabit bayt akışı: (i·37 + 11) mod 256. Python testi aynı akışı kullanır. */
function fixedBytes(): (count: number) => Uint8Array {
  let position = 0
  return (count) => {
    const out = Uint8Array.from({ length: count }, (_, i) => ((position + i) * 37 + 11) % 256)
    position += count
    return out
  }
}

describe('ortak vektörler', () => {
  for (const [name, cases] of Object.entries(loadVectors('kimlik'))) {
    const fn = (kimlik as Record<string, unknown>)[name] as (...args: unknown[]) => unknown
    cases.forEach((testCase, index) => {
      it(`${name} #${index + 1}: ${JSON.stringify(testCase.girdi)}`, () => {
        const args = testCase.secenek ? [...testCase.girdi, testCase.secenek] : testCase.girdi
        if (testCase.hata) expect(() => fn(...args)).toThrow()
        else expect(fn(...args)).toEqual(testCase.cikti)
      })
    })
  }
})

describe('UUIDv7', () => {
  it('aynı milisaniyede ve saat geri giderken bile kesin artan sırada üretir', () => {
    let time = 1_763_280_000_000
    const generator = new Uuidv7Generator({ now: () => time })
    const ids: string[] = []
    for (let i = 0; i < 2000; i++) {
      if (i % 100 === 0) time += 1
      if (i === 1500) time -= 50 // saat geri gitti
      ids.push(generator.next())
    }
    expect([...ids].sort()).toEqual(ids)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.every((id) => isUuid(id, 7))).toBe(true)
    expect(uuidv7Timestamp(ids[0] ?? '')).toBe(1_763_280_000_001)
  })

  it('varsayılan üreteç gerçek saati kullanır', () => {
    const before = Date.now()
    const id = uuidv7()
    expect(uuidv7Timestamp(id)).toBeGreaterThanOrEqual(before)
    expect(uuidv7Timestamp(id)).toBeLessThanOrEqual(Date.now())
  })
})

describe('shortId ve readableCode', () => {
  it('sabit baytlarla Python eşiyle aynı çıktıyı verir', () => {
    expect(shortId(21, { randomBytes: fixedBytes() })).toBe('LwV6fEpOzY9iHsR2bAlKv')
    expect(shortId(10, { alphabet: '0123456789', randomBytes: fixedBytes() })).toBe('0549382716')
    expect(readableCode(8, { check: true, randomBytes: fixedBytes() })).toBe('BGNT-Z49E-Y')
  })

  it('her karakter yaklaşık eşit sıklıkta çıkar (sapma yok)', () => {
    const counts = new Map<string, number>()
    for (const ch of shortId(60_000, { alphabet: '0123456789' })) counts.set(ch, (counts.get(ch) ?? 0) + 1)
    for (const count of counts.values()) expect(Math.abs(count - 6000)).toBeLessThan(400)
  })

  it('üretilen okunaklı kodlar doğrulanır; tek karakter hatası yakalanır', () => {
    for (let i = 0; i < 300; i++) {
      const code = readableCode(8, { check: true })
      expect(validateReadableCode(code)).toBe(true)
      const chars = code.replace(/-/g, '').split('')
      const position = i % chars.length
      chars[position] = chars[position] === 'A' ? 'B' : 'A'
      expect(validateReadableCode(chars.join(''))).toBe(false)
    }
  })

  it('geçersiz alfabe ve uzunluk hata verir', () => {
    expect(() => shortId(5, { alphabet: 'a' })).toThrow(RangeError)
    expect(() => shortId(5, { alphabet: 'aab' })).toThrow(RangeError)
    expect(() => shortId(0)).toThrow(RangeError)
  })
})
