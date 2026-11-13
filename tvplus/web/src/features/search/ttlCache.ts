/**
 * Arama yanıtı önbelleği ("arama sonuçlarının ömrü vardır"): her yanıt sunucunun verdiği `expires` anına kadar
 * yeniden kullanılır. Sunucu sayfanın ömrünü en kısa bölümünkine eşitler (canlı 60 sn, katalog ~8 saat).
 * Anahtar: profil + düzleştirilmiş terim + süzgeçler + yetenek bildirimi — biri değişirse ayrı girdi.
 */

export interface CacheHit<T> {
  value: T
  /** epoch ms */
  expires: number
  /** girdinin yaşı (ms) */
  ageMs: number
}

interface Slot<T> {
  value: T
  expires: number
  storedAt: number
}

/** Terimi önbellek için düzleştirir: Türkçe küçük harf, baş/son boşluk yok, iç boşluklar teke iner. */
export function normalizeTerm(term: string): string {
  return term.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR')
}

/** Anahtar sırası bağımsız JSON (süzgeç nesneleri için). */
export function stableJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null'
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`
  const o = v as Record<string, unknown>
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`)
    .join(',')}}`
}

/** `exact`: yazım düzeltmesiz arama ("Bunun yerine … ara") — düzeltmeli yanıttan ayrı girdi. */
export function searchCacheKey(parts: {
  profile: string
  term: string
  filters: unknown
  capabilities: string
  exact?: boolean
}): string {
  return `${parts.profile}|${normalizeTerm(parts.term)}|${stableJson(parts.filters)}|${parts.capabilities}${parts.exact ? '|tam' : ''}`
}

export class TtlCache<T> {
  private readonly slots = new Map<string, Slot<T>>()
  private readonly max: number

  constructor(max = 60) {
    this.max = max
  }

  /** Süresi dolmamış girdi; dolmuşsa silinir ve null döner. */
  get(key: string, now: number): CacheHit<T> | null {
    const s = this.slots.get(key)
    if (!s) return null
    if (now >= s.expires) {
      this.slots.delete(key)
      return null
    }
    // En son kullanılan sona (LRU)
    this.slots.delete(key)
    this.slots.set(key, s)
    return { value: s.value, expires: s.expires, ageMs: now - s.storedAt }
  }

  set(key: string, value: T, expires: number, now: number): void {
    if (!(expires > now)) return // ömrü olmayan yanıt saklanmaz
    this.slots.delete(key)
    this.slots.set(key, { value, expires, storedAt: now })
    while (this.slots.size > this.max) {
      const oldest = this.slots.keys().next().value
      if (oldest === undefined) break
      this.slots.delete(oldest)
    }
  }

  /** Koşula uyan anahtarları siler (ör. son aramalar değişince boş terim girdileri). */
  deleteWhere(pred: (key: string) => boolean): void {
    for (const k of [...this.slots.keys()]) if (pred(k)) this.slots.delete(k)
  }

  clear(): void {
    this.slots.clear()
  }

  get size(): number {
    return this.slots.size
  }
}
