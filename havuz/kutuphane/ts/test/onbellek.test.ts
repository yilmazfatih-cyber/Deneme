// onbellek modülünün testi: sahte saatle LRU + TTL, eşzamanlı yüklemenin teke indirilmesi.
import { describe, expect, it } from 'vitest'
import { LruCache, type EvictReason } from '../src/onbellek.ts'

describe('LruCache', () => {
  it('en uzun süre kullanılmayanı atar; get kullanım sırasını tazeler, peek tazelemez', () => {
    const evicted: [string, EvictReason][] = []
    const cache = new LruCache<string, number>({ maxSize: 2, onEvict: (k, _v, r) => evicted.push([k, r]) })
    cache.set('a', 1).set('b', 2)
    expect(cache.get('a')).toBe(1)
    cache.set('c', 3)
    expect(cache.has('b')).toBe(false)
    expect(cache.keys()).toEqual(['a', 'c'])
    expect(cache.peek('a')).toBe(1)
    cache.set('d', 4)
    expect(cache.keys()).toEqual(['c', 'd'])
    expect(evicted).toEqual([
      ['b', 'size'],
      ['a', 'size'],
    ])
  })

  it('süresi dolan öğe görünmez ve atılma nedeni bildirilir', () => {
    let now = 0
    const reasons: EvictReason[] = []
    const cache = new LruCache<string, string>({
      maxSize: 10,
      ttlMs: 100,
      now: () => now,
      onEvict: (_k, _v, r) => reasons.push(r),
    })
    cache.set('x', 'bir')
    cache.set('y', 'iki', { ttlMs: 1000 })
    now = 99
    expect(cache.get('x')).toBe('bir')
    now = 100
    expect(cache.get('x')).toBeUndefined()
    expect(cache.size).toBe(1)
    now = 1000
    expect(cache.purgeExpired()).toBe(1)
    expect(reasons).toEqual(['expired', 'expired'])
  })

  it('getOrSetAsync eşzamanlı istekleri tek yüklemeye indirir, hatayı yazmaz', async () => {
    const cache = new LruCache<string, number>({ maxSize: 10 })
    let loads = 0
    const load = async () => {
      loads += 1
      await new Promise((resolve) => setTimeout(resolve, 5))
      return 42
    }
    const results = await Promise.all(Array.from({ length: 50 }, () => cache.getOrSetAsync('k', load)))
    expect(results.every((r) => r === 42)).toBe(true)
    expect(loads).toBe(1)
    await expect(cache.getOrSetAsync('hata', () => Promise.reject(new Error('db')))).rejects.toThrow('db')
    expect(cache.has('hata')).toBe(false)
    expect(cache.getOrSet('z', () => 7)).toBe(7)
    expect(cache.getOrSet('z', () => 8)).toBe(7)
  })

  it('kaba kuvvet: rastgele işlemlerde basit bir başvuru modeliyle aynı davranır', () => {
    const cache = new LruCache<number, number>({ maxSize: 5 })
    const model: number[] = [] // en eski → en yeni
    let seed = 7
    const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) % 9
    for (let i = 0; i < 5000; i++) {
      const key = next()
      if (i % 3 === 0) {
        cache.set(key, key)
        model.splice(model.indexOf(key) >>> 0, model.includes(key) ? 1 : 0)
        model.push(key)
        if (model.length > 5) model.shift()
      } else {
        const hit = cache.get(key)
        expect(hit !== undefined).toBe(model.includes(key))
        if (model.includes(key)) {
          model.splice(model.indexOf(key), 1)
          model.push(key)
        }
      }
      expect(cache.keys()).toEqual(model)
    }
  })

  it('geçersiz boyut hata verir; delete ve clear bildirir', () => {
    expect(() => new LruCache({ maxSize: 0 })).toThrow(RangeError)
    const reasons: EvictReason[] = []
    const cache = new LruCache<string, number>({ maxSize: 3, onEvict: (_k, _v, r) => reasons.push(r) })
    cache.set('a', 1).set('b', 2)
    expect(cache.delete('a')).toBe(true)
    expect(cache.delete('a')).toBe(false)
    cache.clear()
    expect(reasons).toEqual(['deleted', 'cleared'])
  })
})
