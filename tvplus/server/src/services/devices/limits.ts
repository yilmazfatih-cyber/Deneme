/** Bellek içi hız sınırları: jeton kovası (komutlar) ve kayan pencere hata sayacı (kod tahmini koruması). */

export interface TokenBuckets {
  /** Jeton varsa düşer ve true döner; yoksa false ve bir sonraki jetona kalan süre (ms). */
  take(key: string): { ok: true } | { ok: false; retryAfterMs: number }
}

export function createTokenBuckets(ratePerSec: number, burst: number, now: () => number): TokenBuckets {
  const buckets = new Map<string, { tokens: number; at: number }>()
  return {
    take(key) {
      const t = now()
      let b = buckets.get(key)
      if (!b) {
        if (buckets.size > 5000) {
          // Dolu (uzun süredir kullanılmayan) kovaları at; bellek sınırsız büyümesin.
          for (const [k, v] of buckets) if (v.tokens + ((t - v.at) / 1000) * ratePerSec >= burst) buckets.delete(k)
        }
        b = { tokens: burst, at: t }
        buckets.set(key, b)
      }
      b.tokens = Math.min(burst, b.tokens + (Math.max(0, t - b.at) / 1000) * ratePerSec)
      b.at = t
      if (b.tokens >= 1) {
        b.tokens -= 1
        return { ok: true }
      }
      return { ok: false, retryAfterMs: Math.ceil(((1 - b.tokens) / ratePerSec) * 1000) }
    },
  }
}

export interface FailureGuard {
  /** Pencere içinde sınıra ulaşıldıysa engelin kalkmasına kalan süre (ms), yoksa 0. */
  blockedFor(key: string): number
  fail(key: string): void
}

export function createFailureGuard(limit: number, windowMs: number, now: () => number): FailureGuard {
  const hits = new Map<string, number[]>()
  const recent = (key: string): number[] => {
    const t = now()
    const list = (hits.get(key) ?? []).filter((x) => t - x < windowMs)
    if (list.length) hits.set(key, list)
    else hits.delete(key)
    return list
  }
  return {
    blockedFor(key) {
      const list = recent(key)
      if (list.length < limit) return 0
      return Math.max(1, list[0]! + windowMs - now())
    },
    fail(key) {
      const list = recent(key)
      list.push(now())
      hits.set(key, list)
    },
  }
}
