/**
 * Takma kimlik, olay kimliği ve İstanbul günü yardımcıları.
 *
 * Takma kimlik: 'v_' + HMAC-SHA256(deriveKey(config, 'viewer-id'), '<ad alanı>:<kaynak kimliği>') (base64url, 16 karakter
 * = 96 bit). Anahtar sunucunun gizli anahtarından türediği için geri çevrilemez ve başka kurulumla eşleştirilemez.
 * Ad alanları: 'profile' (uygulama profili), 'mixpanel' (Mixpanel distinct_id), 'synthetic' (sentetik örnek).
 */
import { createHmac } from 'node:crypto'

export function pseudonymOf(key: Buffer, namespace: string, rawId: string): string {
  return `v_${createHmac('sha256', key).update(`${namespace}:${rawId}`).digest('base64url').slice(0, 16)}`
}

/** Olay kimliği: önek + HMAC özeti (128 bit). Girdideki ham kimlikler özetten geri çıkarılamaz. */
export function eventIdOf(key: Buffer, prefix: string, parts: string): string {
  return `${prefix}${createHmac('sha256', key).update(parts).digest('base64url').slice(0, 22)}`
}

/** Önbellekli takma kimlik üretici (içe aktarma boyunca aynı ham kimlik tekrar tekrar gelir). Ham kimlik yalnız bellekte, geçici. */
export function pseudonymizer(key: Buffer, namespace: string, cacheSize = 50_000): (rawId: string) => string {
  let cache = new Map<string, string>()
  return (rawId) => {
    let v = cache.get(rawId)
    if (v === undefined) {
      v = pseudonymOf(key, namespace, rawId)
      if (cache.size >= cacheSize) cache = new Map()
      cache.set(rawId, v)
    }
    return v
  }
}

const DAY_MS = 86_400_000
/** Türkiye 7 Eylül 2016'dan beri kalıcı UTC+3'tür; öncesi için Intl ile hesaplanır. */
const FIXED_SINCE = Date.UTC(2016, 8, 7)
const ISTANBUL_OFFSET_MS = 3 * 3_600_000
let fmt: Intl.DateTimeFormat | null = null

/** İstanbul yerel takvim günü (1970-01-01'den gün sayısı). */
export function istanbulDay(ts: number): number {
  if (ts >= FIXED_SINCE) return Math.floor((ts + ISTANBUL_OFFSET_MS) / DAY_MS)
  fmt ??= new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return Math.floor(Date.parse(`${fmt.format(new Date(ts))}T00:00:00Z`) / DAY_MS)
}

/** Gün numarası → 'YYYY-MM-DD' */
export const dayToIso = (day: number): string => new Date(day * DAY_MS).toISOString().slice(0, 10)
/** Gün numarası → 'YYYY-MM' */
export const dayToMonth = (day: number): string => new Date(day * DAY_MS).toISOString().slice(0, 7)

/**
 * Pencere kuralı: İstanbul günü, ortası (İstanbul 12:00 = UTC 09:00) [from, to) içindeyse pencereye girer.
 * Böylece pencere sınırı UTC ya da İstanbul gece yarısı verilse de doğru gün seçilir.
 */
export function dayInWindow(day: number, from: number | undefined, to: number | undefined): boolean {
  const mid = day * DAY_MS + 9 * 3_600_000
  return (from === undefined || mid >= from) && (to === undefined || mid < to)
}

export { DAY_MS }
