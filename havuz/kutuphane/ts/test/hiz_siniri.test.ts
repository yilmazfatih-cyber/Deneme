// hiz_siniri modülünün testi: sahte saatle.
import { describe, expect, it } from 'vitest'
import { SlidingWindowLimiter, TokenBucket } from '../src/hiz_siniri.ts'

function clock(start = 0) {
  let time = start
  return { now: () => time, advance: (ms: number) => (time += ms) }
}

describe('TokenBucket', () => {
  it('patlamaya izin verir, sonra ortalama hızla dolar', () => {
    const c = clock()
    const bucket = new TokenBucket({ capacity: 3, refillPerSecond: 2, now: c.now })
    expect([bucket.tryTake(), bucket.tryTake(), bucket.tryTake(), bucket.tryTake()]).toEqual([true, true, true, false])
    expect(bucket.waitTimeMs()).toBe(500)
    c.advance(499)
    expect(bucket.tryTake()).toBe(false)
    c.advance(1)
    expect(bucket.tryTake()).toBe(true)
    c.advance(10_000)
    expect(bucket.available()).toBe(3)
    expect(bucket.waitTimeMs(4)).toBe(Number.POSITIVE_INFINITY)
  })

  it('uzun vadede izin verilen istek sayısı kapasite + hız × süreyi aşmaz', () => {
    const c = clock()
    const bucket = new TokenBucket({ capacity: 5, refillPerSecond: 10, now: c.now })
    let granted = 0
    for (let t = 0; t < 10_000; t += 7) {
      c.advance(7)
      if (bucket.tryTake()) granted += 1
    }
    expect(granted).toBeLessThanOrEqual(5 + 10 * 10.01)
    expect(granted).toBeGreaterThanOrEqual(95)
  })

  it('saat geri giderse jeton uydurmaz', () => {
    const c = clock(1000)
    const bucket = new TokenBucket({ capacity: 1, refillPerSecond: 1, now: c.now })
    expect(bucket.tryTake()).toBe(true)
    c.advance(-500)
    expect(bucket.tryTake()).toBe(false)
  })
})

describe('SlidingWindowLimiter', () => {
  it('pencere içinde sınırı uygular, pencere kayınca yeniden izin verir', () => {
    const c = clock()
    const limiter = new SlidingWindowLimiter({ limit: 2, windowMs: 1000, now: c.now })
    expect(limiter.tryAcquire('a')).toBe(true)
    c.advance(400)
    expect(limiter.tryAcquire('a')).toBe(true)
    expect(limiter.tryAcquire('a')).toBe(false)
    expect(limiter.tryAcquire('b')).toBe(true)
    expect(limiter.remaining('a')).toBe(0)
    expect(limiter.retryAfterMs('a')).toBe(600)
    c.advance(600)
    expect(limiter.tryAcquire('a')).toBe(true)
    expect(limiter.remaining('a')).toBe(0)
  })

  it('her an son windowMs içinde en çok limit istek kabul edilir (kaba kuvvet)', () => {
    const c = clock()
    const limiter = new SlidingWindowLimiter({ limit: 3, windowMs: 100, now: c.now })
    const accepted: number[] = []
    for (let i = 0; i < 2000; i++) {
      c.advance((i * 7919) % 23)
      if (limiter.tryAcquire()) accepted.push(c.now())
    }
    for (const at of accepted) expect(accepted.filter((t) => t > at - 100 && t <= at).length).toBeLessThanOrEqual(3)
  })

  it('prune ve reset belleği boşaltır', () => {
    const c = clock()
    const limiter = new SlidingWindowLimiter({ limit: 1, windowMs: 10, now: c.now })
    limiter.tryAcquire('x')
    limiter.tryAcquire('y')
    c.advance(20)
    expect(limiter.prune()).toBe(2)
    limiter.tryAcquire('x')
    limiter.reset('x')
    expect(limiter.tryAcquire('x')).toBe(true)
  })
})
