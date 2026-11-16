/**
 * onbellek — boyut sınırlı (LRU: en uzun süre kullanılmayan atılır) ve süreli (TTL) bellek içi önbellek.
 * Eşzamanlı aynı anahtar isteklerini tek yüklemeye indirir (`getOrSetAsync`; "cache stampede" önlenir).
 *
 * Kullanım:
 *   const cache = new LruCache<string, Kullanici>({ maxSize: 500, ttlMs: 60_000 })
 *   cache.set('42', kullanici)
 *   cache.get('42')                                           // süresi dolduysa undefined
 *   const k = await cache.getOrSetAsync('42', () => db.kullanici('42'))   // aynı anda 100 çağrı → 1 sorgu
 *   cache.set('gecici', deger, { ttlMs: 5_000 })               // anahtar başına süre
 *
 * Sınırlar: Tek süreç belleğidir; süreçler arasında paylaşılmaz. Boyut ÖĞE sayısıdır (bayt değil). Süresi dolan
 * öğeler okunurken ya da `purgeExpired()` çağrılınca silinir. Hatalı yükleme önbelleğe yazılmaz.
 *
 * Genişletme: Atılma bildirimi için `onEvict` verin (neden: 'size' | 'expired' | 'deleted' | 'cleared').
 * Yeni bir özellik (ör. bayt sınırı) eklerken saat `now` ile verilmeye devam etmeli ki test sahte saatle yazılsın.
 */

export type EvictReason = 'size' | 'expired' | 'deleted' | 'cleared'

export interface LruCacheOptions<K, V> {
  /** En çok öğe sayısı. */
  maxSize: number
  /** Varsayılan yaşam süresi (ms); verilmezse öğeler süresiz. */
  ttlMs?: number
  /** Milisaniye döndüren saat (test için); varsayılan Date.now. */
  now?: () => number
  onEvict?: (key: K, value: V, reason: EvictReason) => void
}

interface Entry<V> {
  value: V
  expiresAt: number
}

export class LruCache<K, V> {
  private readonly map = new Map<K, Entry<V>>()
  private readonly inflight = new Map<K, Promise<V>>()
  private readonly maxSize: number
  private readonly ttlMs: number | undefined
  private readonly now: () => number
  private readonly onEvict: LruCacheOptions<K, V>['onEvict']

  constructor(options: LruCacheOptions<K, V>) {
    if (!Number.isInteger(options.maxSize) || options.maxSize < 1) {
      throw new RangeError('maxSize 1 veya daha büyük bir tam sayı olmalı.')
    }
    this.maxSize = options.maxSize
    this.ttlMs = options.ttlMs
    this.now = options.now ?? (() => Date.now())
    this.onEvict = options.onEvict
  }

  private live(key: K): Entry<V> | undefined {
    const entry = this.map.get(key)
    if (entry === undefined) return undefined
    if (entry.expiresAt <= this.now()) {
      this.map.delete(key)
      this.onEvict?.(key, entry.value, 'expired')
      return undefined
    }
    return entry
  }

  /** Değeri verir ve "son kullanılan" yapar; yoksa ya da süresi dolduysa undefined. */
  get(key: K): V | undefined {
    const entry = this.live(key)
    if (entry === undefined) return undefined
    this.map.delete(key)
    this.map.set(key, entry)
    return entry.value
  }

  /** Değeri verir ama kullanım sırasını değiştirmez. */
  peek(key: K): V | undefined {
    return this.live(key)?.value
  }

  has(key: K): boolean {
    return this.live(key) !== undefined
  }

  set(key: K, value: V, options: { ttlMs?: number } = {}): this {
    const ttl = options.ttlMs ?? this.ttlMs
    this.map.delete(key)
    this.map.set(key, { value, expiresAt: ttl === undefined ? Number.POSITIVE_INFINITY : this.now() + ttl })
    while (this.map.size > this.maxSize) {
      const oldest = this.map.keys().next()
      if (oldest.done === true) break
      const entry = this.map.get(oldest.value)
      this.map.delete(oldest.value)
      if (entry !== undefined) this.onEvict?.(oldest.value, entry.value, 'size')
    }
    return this
  }

  delete(key: K): boolean {
    const entry = this.map.get(key)
    if (entry === undefined) return false
    this.map.delete(key)
    this.onEvict?.(key, entry.value, 'deleted')
    return true
  }

  clear(): void {
    const entries = [...this.map.entries()]
    this.map.clear()
    for (const [key, entry] of entries) this.onEvict?.(key, entry.value, 'cleared')
  }

  /** Süresi dolanları siler; kaç öğe silindiğini döner. */
  purgeExpired(): number {
    let removed = 0
    for (const key of [...this.map.keys()]) if (this.live(key) === undefined) removed += 1
    return removed
  }

  /** Canlı öğe sayısı (önce süresi dolanlar temizlenir). */
  get size(): number {
    this.purgeExpired()
    return this.map.size
  }

  /** Canlı anahtarlar; en eski kullanılandan en yeniye. */
  keys(): K[] {
    this.purgeExpired()
    return [...this.map.keys()]
  }

  /** Varsa döndürür; yoksa `factory` ile üretip yazar. */
  getOrSet(key: K, factory: () => V, options: { ttlMs?: number } = {}): V {
    const entry = this.live(key)
    if (entry !== undefined) return this.get(key) as V
    const value = factory()
    this.set(key, value, options)
    return value
  }

  /** Eşzamansız yükleme; aynı anahtar için süren yükleme varsa onu bekler (tek sorgu). Hata önbelleğe yazılmaz. */
  async getOrSetAsync(key: K, factory: () => Promise<V>, options: { ttlMs?: number } = {}): Promise<V> {
    if (this.live(key) !== undefined) return this.get(key) as V
    const running = this.inflight.get(key)
    if (running !== undefined) return running
    const promise = (async () => {
      try {
        const value = await factory()
        this.set(key, value, options)
        return value
      } finally {
        this.inflight.delete(key)
      }
    })()
    this.inflight.set(key, promise)
    return promise
  }
}
