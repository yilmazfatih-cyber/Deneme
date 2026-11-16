import { describe, expect, it } from 'vitest'
import { anchorAdjustment, HeightIndex, visibleRange } from '../../src/sanal_liste/index.ts'

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), a | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('yükseklik dizini (Fenwick)', () => {
  it('rastgele güncellemelerden sonra önek toplamı ve konum araması düz diziyle aynı', () => {
    const random = rng(11)
    const n = 1000
    const index = new HeightIndex(n, 40)
    const model = Array.from({ length: n }, () => 40)
    for (let step = 0; step < 2000; step++) {
      const i = Math.floor(random() * n)
      const h = 10 + Math.floor(random() * 200)
      expect(index.setHeight(i, h)).toBe(h - (model[i] as number))
      model[i] = h
      if (step % 100 !== 0) continue
      const k = Math.floor(random() * (n + 1))
      expect(index.offsetOf(k)).toBe(model.slice(0, k).reduce((a, b) => a + b, 0))
      const offset = random() * index.total()
      let sum = 0
      let expected = 0
      for (let j = 0; j < n; j++) {
        if (sum + (model[j] as number) > offset) {
          expected = j
          break
        }
        sum += model[j] as number
      }
      expect(index.indexAt(offset)).toBe(expected)
    }
    expect(index.total()).toBe(model.reduce((a, b) => a + b, 0))
  })

  it('uç durumlar: boş liste, sınır dışı, geçersiz kurulum', () => {
    expect(new HeightIndex(0, 10).indexAt(50)).toBe(0)
    const index = new HeightIndex(3, 10)
    expect([index.indexAt(0), index.indexAt(9.99), index.indexAt(10), index.indexAt(1e9)]).toEqual([0, 0, 1, 2])
    expect(() => index.setHeight(3, 5)).toThrow(/Öğe 3 yok/)
    expect(() => new HeightIndex(2, 0)).toThrow(RangeError)
  })
})

describe('görünür aralık ve kaydırma çapası', () => {
  it('yalnız görünenler + overscan çizilir', () => {
    const index = new HeightIndex(10_000, 50)
    const range = visibleRange(index, 50 * 5000, 600, 3)
    expect(range).toEqual({ start: 4997, end: 5015, offsetTop: 4997 * 50, totalHeight: 500_000 })
  })

  it('görünür alanın üstündeki öğe büyürse kaydırma fark kadar düzeltilir; içindeki öğede düzeltme yok', () => {
    const index = new HeightIndex(100, 50)
    const scrollTop = 1000
    const above = index.setHeight(3, 80)
    expect(anchorAdjustment(index, 3, above, scrollTop)).toBe(30)
    const inside = index.setHeight(21, 90)
    expect(anchorAdjustment(index, 21, inside, scrollTop + 30)).toBe(0)
  })
})
