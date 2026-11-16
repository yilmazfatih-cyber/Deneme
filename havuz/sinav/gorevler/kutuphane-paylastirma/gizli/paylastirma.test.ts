/**
 * Gizli sınav testi (kutuphane-paylastirma): `allocate` en büyük kalan yöntemine uyar (Python ile aynı).
 */
import { describe, expect, it } from 'vitest'
import { allocate, money } from '../src/para.ts'

const kurus = (parts: { kurus: number }[]) => parts.map((part) => part.kurus)

function reference(total: number, ratios: number[]): number[] {
  const weight = ratios.reduce((a, b) => a + b, 0)
  const amount = Math.abs(total)
  const shares = ratios.map((ratio) => Math.floor((amount * ratio) / weight))
  const remainders = ratios.map((ratio) => (amount * ratio) % weight)
  let leftover = amount - shares.reduce((a, b) => a + b, 0)
  const order = ratios.map((_, i) => i).sort((a, b) => (remainders[b] ?? 0) - (remainders[a] ?? 0) || a - b)
  for (const index of order) {
    if (leftover === 0) break
    shares[index] = (shares[index] ?? 0) + 1
    leftover -= 1
  }
  return shares.map((share) => (total < 0 && share !== 0 ? -share : share))
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('gizli: paylaştırma', () => {
  it('bildirilen örnek: 100,00 TL 1:2:3 → 16,67 / 33,33 / 50,00', () => {
    expect(kurus(allocate(money(10000), [1, 2, 3]))).toEqual([1667, 3333, 5000])
    expect(kurus(allocate(money(100), [1, 2, 3]))).toEqual([17, 33, 50])
    expect(kurus(allocate(money(-10000), [1, 2, 3]))).toEqual([-1667, -3333, -5000])
  })

  it('eşit kalanda öndeki pay artar', () => {
    expect(kurus(allocate(money(10000), [1, 1, 1]))).toEqual([3334, 3333, 3333])
    expect(kurus(allocate(money(5), [1, 1, 1, 1, 1, 1, 1]))).toEqual([1, 1, 1, 1, 1, 0, 0])
    expect(kurus(allocate(money(100), [0, 1]))).toEqual([0, 100])
  })

  it('en büyük kalan: kaba kuvvetle karşılaştırma', () => {
    const random = mulberry32(4242)
    for (let i = 0; i < 3000; i++) {
      const total = Math.floor((random() - 0.5) * 2_000_000)
      const ratios = Array.from({ length: 1 + Math.floor(random() * 7) }, () => Math.floor(random() * 51))
      if (!ratios.some((ratio) => ratio > 0)) ratios[0] = 1
      const parts = kurus(allocate(money(total), ratios))
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total)
      expect(parts, JSON.stringify({ total, ratios })).toEqual(reference(total, ratios))
    }
  })
})
