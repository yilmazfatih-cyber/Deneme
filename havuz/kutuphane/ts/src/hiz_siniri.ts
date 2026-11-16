/**
 * hiz_siniri — istek hızını sınırlar: jeton kovası (TokenBucket; patlamaya izin verir, ortalamayı sınırlar) ve
 * kayan pencere (SlidingWindowLimiter; "son 60 sn'de en çok 10 istek", anahtar başına). Saat dışarıdan verilir.
 *
 * Kullanım:
 *   const kova = new TokenBucket({ capacity: 10, refillPerSecond: 2 })   // 10'luk patlama, saniyede 2 ortalama
 *   if (!kova.tryTake()) return yanit(429, { retryAfterMs: kova.waitTimeMs() })
 *   const pencere = new SlidingWindowLimiter({ limit: 5, windowMs: 60_000 })
 *   if (!pencere.tryAcquire(`giris:${ip}`)) return yanit(429)          // IP başına dakikada 5 giriş denemesi
 *
 * Sınırlar: Bellek içidir; tek süreçte çalışır. Birden çok sunucu/süreç varsa sayaç paylaşılmaz (Redis gibi ortak
 * bir depo gerekir). Kayan pencere her istek için bir zaman damgası tutar: bellek = anahtar × limit. Uzun süre
 * gelmeyen anahtarları `prune()` ile temizleyin. Varsayılan saat `performance.now()` (geri gitmez).
 *
 * Genişletme: Yeni algoritma (ör. sabit pencere) aynı yapıda bir sınıf olarak eklenir: `now` parametresi alır,
 * `tryAcquire`/`retryAfterMs` sunar; testi sahte saatle yazılır.
 */

export interface TokenBucketOptions {
  /** Kovadaki en çok jeton (izin verilen patlama). */
  capacity: number
  /** Saniyede eklenen jeton (ortalama hız). */
  refillPerSecond: number
  /** Başlangıç jetonu; varsayılan `capacity` (dolu). */
  initialTokens?: number
  /** Milisaniye döndüren saat; varsayılan performance.now. */
  now?: () => number
}

export class TokenBucket {
  readonly capacity: number
  readonly refillPerSecond: number
  private tokens: number
  private last: number
  private readonly now: () => number

  constructor(options: TokenBucketOptions) {
    if (!(options.capacity > 0) || !(options.refillPerSecond > 0)) {
      throw new RangeError('capacity ve refillPerSecond sıfırdan büyük olmalı.')
    }
    this.capacity = options.capacity
    this.refillPerSecond = options.refillPerSecond
    this.now = options.now ?? (() => performance.now())
    this.tokens = Math.min(options.initialTokens ?? options.capacity, options.capacity)
    this.last = this.now()
  }

  private refill(): void {
    const current = this.now()
    const elapsed = Math.max(0, current - this.last) / 1000
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSecond)
    this.last = Math.max(this.last, current)
  }

  /** Şu an kullanılabilir jeton (kesirli olabilir). */
  available(): number {
    this.refill()
    return this.tokens
  }

  /** `count` jeton varsa alır ve true döner; yoksa hiçbir şey almaz, false döner. */
  tryTake(count = 1): boolean {
    this.refill()
    if (count > this.tokens) return false
    this.tokens -= count
    return true
  }

  /** `count` jetonun birikmesine kalan süre (ms); hemen alınabiliyorsa 0, kapasiteden büyükse Infinity. */
  waitTimeMs(count = 1): number {
    if (count > this.capacity) return Number.POSITIVE_INFINITY
    this.refill()
    return count <= this.tokens ? 0 : Math.ceil(((count - this.tokens) / this.refillPerSecond) * 1000)
  }
}

export interface SlidingWindowOptions {
  /** Pencere içinde izin verilen en çok istek. */
  limit: number
  /** Pencere uzunluğu (ms). */
  windowMs: number
  now?: () => number
}

export class SlidingWindowLimiter {
  readonly limit: number
  readonly windowMs: number
  private readonly now: () => number
  private readonly hits = new Map<string, number[]>()

  constructor(options: SlidingWindowOptions) {
    if (!Number.isInteger(options.limit) || options.limit < 1 || !(options.windowMs > 0)) {
      throw new RangeError('limit 1 veya daha büyük tam sayı, windowMs sıfırdan büyük olmalı.')
    }
    this.limit = options.limit
    this.windowMs = options.windowMs
    this.now = options.now ?? (() => performance.now())
  }

  private recent(key: string, current: number): number[] {
    const list = (this.hits.get(key) ?? []).filter((at) => at > current - this.windowMs)
    if (list.length === 0) this.hits.delete(key)
    else this.hits.set(key, list)
    return list
  }

  /** İzin varsa isteği kaydeder ve true döner. */
  tryAcquire(key = 'default'): boolean {
    const current = this.now()
    const list = this.recent(key, current)
    if (list.length >= this.limit) return false
    list.push(current)
    this.hits.set(key, list)
    return true
  }

  /** Penceredeki kalan hak. */
  remaining(key = 'default'): number {
    return this.limit - this.recent(key, this.now()).length
  }

  /** Bir sonraki isteğe izin verilene kadar kalan süre (ms); şimdi izin varsa 0. */
  retryAfterMs(key = 'default'): number {
    const current = this.now()
    const list = this.recent(key, current)
    if (list.length < this.limit) return 0
    return Math.max(0, (list[list.length - this.limit] ?? current) + this.windowMs - current)
  }

  /** Bir anahtarın (ya da hepsinin) sayaçlarını siler. */
  reset(key?: string): void {
    if (key === undefined) this.hits.clear()
    else this.hits.delete(key)
  }

  /** Penceresi dolmuş anahtarları bellekten atar; kaç anahtar silindiğini döner. */
  prune(): number {
    const before = this.hits.size
    const current = this.now()
    for (const key of [...this.hits.keys()]) this.recent(key, current)
    return before - this.hits.size
  }
}
