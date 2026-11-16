import { AppError } from '@uygulama/shared'
import { describe, expect, it } from 'vitest'
import { rateLimitKey } from '../src/http/clientIp.ts'
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

  it('rateLimitKey: IPv4 aynen; IPv6 /64 bloğuna iner (yazımdan bağımsız); IPv4 taşıyan biçimler toplanmaz', () => {
    expect(rateLimitKey('203.0.113.9')).toBe('203.0.113.9')
    expect(rateLimitKey('unknown')).toBe('unknown')
    expect(rateLimitKey('2001:db8:aa:bb::1')).toBe('2001:db8:aa:bb::/64')
    expect(rateLimitKey('2001:0DB8:00AA:00BB:ffff:1:2:3')).toBe('2001:db8:aa:bb::/64')
    expect(rateLimitKey('2001:db8::1')).toBe('2001:db8:0:0::/64')
    expect(rateLimitKey('2001:db8:1::')).toBe('2001:db8:1:0::/64')
    expect(rateLimitKey('2001:db8:aa:bb:cc:dd:1.2.3.4')).toBe('2001:db8:aa:bb::/64')
    // Bunlar /64'e indirilseydi ilgisiz herkes tek kovaya düşerdi:
    expect(rateLimitKey('::1')).toBe('0:0:0:0:0:0:0:1')
    expect(rateLimitKey('::FFFF:1.2.3.4')).toBe('0:0:0:0:0:ffff:1.2.3.4')
    expect(rateLimitKey('0:0:0:0:0:ffff:1.2.3.5')).toBe('0:0:0:0:0:ffff:1.2.3.5')
    expect(rateLimitKey('64:ff9b::198.51.100.7')).toBe('64:ff9b:0:0:0:0:198.51.100.7')
    expect(rateLimitKey('2001:0:4136:e378:8000:63bf:3fff:fdd2')).toBe('2001:0:4136:e378:8000:63bf:3fff:fdd2')
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
