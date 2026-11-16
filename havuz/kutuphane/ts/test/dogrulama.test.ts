// dogrulama modülünün testi: ortak vektörler + üreteç/sağlama özellik testleri (tek hane hatası yakalanır).
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as dogrulama from '../src/dogrulama.ts'
import {
  generateCardNumber,
  generateIbanTr,
  generatePhoneTr,
  generateTckn,
  generateVkn,
  luhnCheck,
  validateCardNumber,
  validateIban,
  validateIbanTr,
  validatePhoneTr,
  validateTckn,
  validateVkn,
} from '../src/dogrulama.ts'

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

/** i. haneyi başka bir rakamla değiştirir. */
function mutate(value: string, index: number, delta: number): string {
  const digit = (Number(value[index]) + delta) % 10
  return value.slice(0, index) + String(digit) + value.slice(index + 1)
}

describe('ortak vektörler', () => {
  for (const [name, cases] of Object.entries(loadVectors('dogrulama'))) {
    const fn = (dogrulama as Record<string, unknown>)[name] as (...args: unknown[]) => unknown
    cases.forEach((testCase, index) => {
      it(`${name} #${index + 1}: ${JSON.stringify(testCase.girdi)}`, () => {
        const args = testCase.secenek ? [...testCase.girdi, testCase.secenek] : testCase.girdi
        if (testCase.hata) expect(() => fn(...args)).toThrow()
        else expect(fn(...args)).toEqual(testCase.cikti)
      })
    })
  }
})

describe('üreteçler ve sağlama özellikleri', () => {
  const random = seededRandom(41)

  it('üretilen değerler geçerlidir', () => {
    for (let i = 0; i < 1000; i++) {
      expect(validateTckn(generateTckn(random))).toBe(true)
      expect(validateVkn(generateVkn(random))).toBe(true)
      expect(validateIbanTr(generateIbanTr(random))).toBe(true)
      expect(validateCardNumber(generateCardNumber(random))).toBe(true)
      expect(validatePhoneTr(generatePhoneTr(random))).toBe(true)
    }
    expect(generateIbanTr(random, '00061').slice(4, 9)).toBe('00061')
    expect(generateCardNumber(random, { prefix: '9792', length: 16 }).startsWith('9792')).toBe(true)
  })

  it('son haneyi bozmak her zaman yakalanır (TCKN, VKN)', () => {
    for (let i = 0; i < 500; i++) {
      const tckn = generateTckn(random)
      const vkn = generateVkn(random)
      for (let delta = 1; delta < 10; delta++) {
        expect(validateTckn(mutate(tckn, 10, delta))).toBe(false)
        expect(validateVkn(mutate(vkn, 9, delta))).toBe(false)
      }
    }
  })

  it('IBAN ve Luhn her tek hane hatasını yakalar', () => {
    for (let i = 0; i < 100; i++) {
      const iban = generateIbanTr(random)
      const card = generateCardNumber(random)
      for (let position = 2; position < iban.length; position++) {
        for (let delta = 1; delta < 10; delta++) expect(validateIban(mutate(iban, position, delta))).toBe(false)
      }
      for (let position = 0; position < card.length; position++) {
        for (let delta = 1; delta < 10; delta++) expect(luhnCheck(mutate(card, position, delta))).toBe(false)
      }
    }
  })

  it('TCKN sağlaması bağımsız bir yazımla aynı sonucu verir', () => {
    for (let i = 0; i < 2000; i++) {
      const candidate = String(10_000_000_000 + Math.floor(random() * 89_999_999_999))
      const d = Array.from(candidate, Number)
      const odd = d[0]! + d[2]! + d[4]! + d[6]! + d[8]!
      const even = d[1]! + d[3]! + d[5]! + d[7]!
      const tenth = (((odd * 7 - even) % 10) + 10) % 10
      const eleventh = d.slice(0, 10).reduce((a, b) => a + b, 0) % 10
      expect(validateTckn(candidate)).toBe(d[9] === tenth && d[10] === eleventh)
    }
  })
})
