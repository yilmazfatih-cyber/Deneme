/**
 * Hız sınırı (bellek içi "jeton kovası"). Her anahtarın (IP, IP+e-posta, kullanıcı…) kovası `limit` jetonla dolu
 * başlar; her istek bir jeton harcar; kova `windowMs` içinde yeniden dolar. Jeton yoksa 429 `rate_limited` ve
 * `Retry-After` (saniye) döner. Saat dışarıdan verilir (testte ileri sarılır).
 *
 * Sınırlar: tek süreçlidir (birden çok sunucu kopyası çalışırsa her biri ayrı sayar) ve yeniden başlatınca sıfırlanır.
 * Kurallar ve gerekçeleri aşağıdaki RATE_RULES'tadır; değiştirirken docs/GUVENLIK.md tablosunu da güncelleyin.
 *
 * Genişletme: yeni bir uç için RATE_RULES'a kural ekleyin; işleyicide `ctx.limiter.consume(RATE_RULES.x, anahtar)`.
 */
import { AppError } from '@uygulama/shared'
import type { MiddlewareHandler } from 'hono'
import type { Clock } from '../lib/random.ts'
import type { AppEnv } from './types.ts'

export interface RateRule {
  readonly name: string
  readonly limit: number
  readonly windowMs: number
}

const MINUTE = 60_000

export const RATE_RULES = {
  /** IP başına bütün /api istekleri: tarayıcı başına olağan kullanımın çok üstü, betikli saldırının altı. */
  general: { name: 'general', limit: 600, windowMs: MINUTE },
  /** IP başına giriş denemesi (birçok hesabı deneyen tek kaynak). */
  login: { name: 'login', limit: 30, windowMs: 15 * MINUTE },
  /** IP + e-posta başına giriş denemesi (tek hesaba parola deneme). */
  loginAccount: { name: 'login-account', limit: 10, windowMs: 15 * MINUTE },
  /** IP başına yeni hesap. */
  register: { name: 'register', limit: 10, windowMs: 60 * MINUTE },
  /** IP başına şifre-unuttum isteği. */
  forgot: { name: 'forgot', limit: 10, windowMs: 60 * MINUTE },
  /** E-posta başına şifre-unuttum: birinin kutusunu e-postayla doldurmayı önler. */
  forgotAccount: { name: 'forgot-account', limit: 3, windowMs: 60 * MINUTE },
  /** IP başına sıfırlama belirteci denemesi. */
  reset: { name: 'reset', limit: 20, windowMs: 15 * MINUTE },
  /** Kullanıcı başına eşitleme (sayfalı ilk eşitleme + giden kutusu boşaltma için bol). */
  sync: { name: 'sync', limit: 240, windowMs: MINUTE },
  /** Kullanıcı başına anlık bildirim bağlantısı açma (yeniden bağlanma fırtınasını keser). */
  events: { name: 'events', limit: 30, windowMs: MINUTE },
  // YENİ KURAL BURAYA
} as const satisfies Record<string, RateRule>

interface Bucket {
  tokens: number
  at: number
}

export interface RateLimiterOptions {
  readonly enabled: boolean
  /** Bellekte tutulacak en çok anahtar; aşılırsa dolu kovalar, sonra en eskiler atılır. */
  readonly maxKeys?: number
}

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>()
  private readonly clock: Clock
  private readonly enabled: boolean
  private readonly maxKeys: number

  constructor(clock: Clock, options: RateLimiterOptions) {
    this.clock = clock
    this.enabled = options.enabled
    this.maxKeys = options.maxKeys ?? 50_000
  }

  get size(): number {
    return this.buckets.size
  }

  /** Bir jeton harcamayı dener. Jeton yoksa kaç saniye sonra yeniden denenebileceğini söyler. */
  take(rule: RateRule, key: string): { allowed: true } | { allowed: false; retryAfter: number } {
    if (!this.enabled) return { allowed: true }
    const id = `${rule.name}:${key}`
    const now = this.clock.now().getTime()
    const rate = rule.limit / rule.windowMs
    const previous = this.buckets.get(id)
    const tokens = previous ? Math.min(rule.limit, previous.tokens + (now - previous.at) * rate) : rule.limit
    this.buckets.delete(id) // en son kullanılan sona geçsin (taşmada en eskiler atılır)
    if (tokens >= 1) {
      this.buckets.set(id, { tokens: tokens - 1, at: now })
      this.trim()
      return { allowed: true }
    }
    this.buckets.set(id, { tokens, at: now })
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((1 - tokens) / rate / 1000)) }
  }

  /** Jeton harcar; yoksa `rate_limited` fırlatır (yanıtta `Retry-After` başlığı olur). */
  consume(rule: RateRule, key: string): void {
    const result = this.take(rule, key)
    if (!result.allowed) throw new AppError('rate_limited', undefined, { retryAfter: result.retryAfter })
  }

  /** Yeniden dolmuş (bilgi taşımayan) kovaları siler. Bakım işi düzenli çağırır. */
  sweep(): void {
    const now = this.clock.now().getTime()
    for (const [id, bucket] of this.buckets) {
      const rule = Object.values(RATE_RULES).find((item) => id.startsWith(`${item.name}:`))
      if (!rule || bucket.tokens + (now - bucket.at) * (rule.limit / rule.windowMs) >= rule.limit) {
        this.buckets.delete(id)
      }
    }
  }

  private trim(): void {
    if (this.buckets.size <= this.maxKeys) return
    this.sweep()
    for (const id of this.buckets.keys()) {
      if (this.buckets.size <= this.maxKeys * 0.9) break
      this.buckets.delete(id)
    }
  }
}

/** Ara katman: kural + anahtar üreten işlev. Anahtar `null` dönerse sınır uygulanmaz. */
export function rateLimit(
  limiter: RateLimiter,
  rule: RateRule,
  keyOf: (c: Parameters<MiddlewareHandler<AppEnv>>[0]) => string | null,
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const key = keyOf(c)
    if (key !== null) limiter.consume(rule, key)
    await next()
  }
}
