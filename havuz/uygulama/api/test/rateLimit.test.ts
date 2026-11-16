import { AppError } from '@uygulama/shared'
import { describe, expect, it } from 'vitest'
import { RateLimiter, RATE_RULES, type RateRule } from '../src/http/rateLimit.ts'
import type { Clock } from '../src/lib/random.ts'

class ManualClock implements Clock {
  ms = Date.parse('2026-11-16T09:00:00.000Z')
  now(): Date {
    return new Date(this.ms)
  }
}

const rule: RateRule = { name: 'deneme', limit: 3, windowMs: 60_000 }

describe('hız sınırı (jeton kovası)', () => {
  it('limit kadar izin verir, sonra kaç saniye bekleneceğini söyler; kova zamanla dolar', () => {
    const clock = new ManualClock()
    const limiter = new RateLimiter(clock, { enabled: true })
    expect([1, 2, 3].map(() => limiter.take(rule, 'ip').allowed)).toEqual([true, true, true])
    expect(limiter.take(rule, 'ip')).toEqual({ allowed: false, retryAfter: 20 })
    clock.ms += 19_000
    expect(limiter.take(rule, 'ip').allowed).toBe(false)
    clock.ms += 1_000
    expect(limiter.take(rule, 'ip').allowed).toBe(true)
    expect(limiter.take(rule, 'başka-ip').allowed).toBe(true)
  })

  it('consume sınırda rate_limited AppError fırlatır (ayrıntıda retryAfter)', () => {
    const limiter = new RateLimiter(new ManualClock(), { enabled: true })
    for (let index = 0; index < 3; index++) limiter.consume(rule, 'k')
    try {
      limiter.consume(rule, 'k')
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(AppError)
      expect((error as AppError).code).toBe('rate_limited')
      expect((error as AppError).details).toEqual({ retryAfter: 20 })
    }
  })

  it('kapalıyken her şeye izin verir', () => {
    const limiter = new RateLimiter(new ManualClock(), { enabled: false })
    for (let index = 0; index < 100; index++) expect(limiter.take(rule, 'k').allowed).toBe(true)
    expect(limiter.size).toBe(0)
  })

  it('süpürme dolmuş kovaları siler; anahtar sayısı sınırı belleği korur', () => {
    const clock = new ManualClock()
    const limiter = new RateLimiter(clock, { enabled: true, maxKeys: 100 })
    for (let index = 0; index < 250; index++) limiter.take(RATE_RULES.general, `ip-${index}`)
    expect(limiter.size).toBeLessThanOrEqual(100)
    clock.ms += RATE_RULES.general.windowMs
    limiter.sweep()
    expect(limiter.size).toBe(0)
  })

  it('her kuralın adı benzersizdir ve limiti pozitiftir', () => {
    const names = Object.values(RATE_RULES).map((item) => item.name)
    expect(new Set(names).size).toBe(names.length)
    for (const item of Object.values(RATE_RULES)) {
      expect(item.limit).toBeGreaterThan(0)
      expect(item.windowMs).toBeGreaterThan(0)
    }
  })
})
