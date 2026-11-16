// para modülünün testi: ortak vektörler + paylaştırma/KDV değişmezleri (toplam korunur) için özellik testleri.
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as para from '../src/para.ts'
import { addVat, allocate, formatMoney, money, MoneyError, parseMoney, removeVat, sumMoney } from '../src/para.ts'

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

describe('ortak vektörler', () => {
  for (const [name, cases] of Object.entries(loadVectors('para'))) {
    const fn = (para as Record<string, unknown>)[name] as (...args: unknown[]) => unknown
    cases.forEach((testCase, index) => {
      it(`${name} #${index + 1}: ${JSON.stringify(testCase.girdi)}`, () => {
        const args = testCase.secenek ? [...testCase.girdi, testCase.secenek] : testCase.girdi
        if (testCase.hata) expect(() => fn(...args)).toThrow(MoneyError)
        else expect(fn(...args)).toEqual(testCase.cikti)
      })
    })
  }
})

describe('değişmezler', () => {
  it('paylaştırmada parçaların toplamı tutara eşittir ve paylar en fazla 1 kuruş sapar', () => {
    const random = seededRandom(21)
    for (let i = 0; i < 2000; i++) {
      const total = money(Math.floor((random() - 0.3) * 1_000_000))
      const ratios = Array.from({ length: 1 + Math.floor(random() * 8) }, () => Math.floor(random() * 100))
      if (!ratios.some((r) => r > 0)) ratios[0] = 1
      const parts = allocate(total, ratios)
      expect(sumMoney(parts).kurus).toBe(total.kurus)
      const weightSum = ratios.reduce((a, b) => a + b, 0)
      parts.forEach((part, k) => {
        const exact = (total.kurus * (ratios[k] ?? 0)) / weightSum
        expect(Math.abs(part.kurus - exact)).toBeLessThan(1)
      })
    }
  })

  it('KDV ayırmada net + KDV her zaman brüte eşittir; eklemede brüt = net + KDV', () => {
    const random = seededRandom(22)
    for (let i = 0; i < 2000; i++) {
      const amount = money(Math.floor(random() * 10_000_000))
      const rate = [0, 1, 8, 10, 18, 20, '7.5'][Math.floor(random() * 7)] ?? 20
      const removed = removeVat(amount, rate)
      expect(removed.net.kurus + removed.vat.kurus).toBe(amount.kurus)
      const added = addVat(amount, rate)
      expect(added.gross.kurus).toBe(amount.kurus + added.vat.kurus)
    }
  })

  it('biçimlenen tutar geri ayrıştırılınca aynı tutar çıkar', () => {
    const random = seededRandom(23)
    for (let i = 0; i < 2000; i++) {
      const m = money(Math.floor((random() - 0.5) * 10 ** (1 + Math.floor(random() * 13))))
      for (const style of ['symbol', 'code', 'plain'] as const) expect(parseMoney(formatMoney(m, { style }))).toEqual(m)
    }
  })

  it('güvenli tam sayı sınırını aşan tutar hata verir', () => {
    expect(() => money(Number.MAX_SAFE_INTEGER + 1)).toThrow(MoneyError)
    expect(() => para.add(money(Number.MAX_SAFE_INTEGER), money(1))).toThrow(MoneyError)
  })
})
