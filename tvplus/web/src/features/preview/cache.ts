/**
 * Önizleme (MiniModal) önbelleği — Netflix'in "satırın tamamını ön yükle" mekaniği.
 * Bir satırda ilk kez önizleme açılınca o satırda YÜKLÜ olan tüm video kimlikleri tek MiniModalQuery ile istenir;
 * sonuçlar video başına saklanır, böylece aynı satırda bir sonraki karta geçmek istek doğurmaz.
 * Saf sınıf (DOM yok); ağ ve devbus bağlantısı PreviewScope'ta.
 */

export const PREVIEW_TTL_MS = 5 * 60_000

interface Entry<V> {
  value: V
  at: number
}

export interface RowPlan {
  /** Fare altındaki video önbellekte ve taze mi */
  hit: boolean
  /** Ağdan istenecek kimlikler (fare altındaki önce); boşsa istek yok */
  fetch: number[]
  /** Fare altındaki video zaten yolda olan bir istekte mi */
  waiting: boolean
}

export class PreviewCache<V> {
  private readonly videos = new Map<number, Entry<V>>()
  private readonly inflight = new Set<number>()
  /** Satır kimliği → o satır için istenmiş kimlikler (tanılama) */
  private readonly rows = new Map<string, Set<number>>()
  private readonly ttlMs: number

  constructor(ttlMs = PREVIEW_TTL_MS) {
    this.ttlMs = ttlMs
  }

  /** Taze kayıt (yaşıyla) ya da null */
  get(videoId: number, now: number): { value: V; ageMs: number } | null {
    const e = this.videos.get(videoId)
    if (!e || now - e.at > this.ttlMs) return null
    return { value: e.value, ageMs: now - e.at }
  }

  /**
   * Bir satırda önizleme açılırken ne yapılacağı: fare altındaki video taze ise isabet;
   * değilse satırdaki önbellekte olmayan ve yolda olmayan TÜM kimlikler istenir (fare altındaki başta).
   * Fare altındaki taze olsa bile satıra sonradan yüklenen kartlar beklemez: onlar bir sonraki ıskada gelir.
   */
  planRow(rowId: string, rowVideoIds: readonly number[], videoId: number, now: number): RowPlan {
    const hit = this.get(videoId, now) !== null
    if (hit) return { hit: true, fetch: [], waiting: false }
    const waiting = this.inflight.has(videoId)
    const ids = [videoId, ...rowVideoIds.filter((id) => id !== videoId)]
    const fetch = [...new Set(ids)].filter((id) => id > 0 && !this.inflight.has(id) && this.get(id, now) === null)
    if (fetch.length) {
      const set = this.rows.get(rowId) ?? new Set<number>()
      fetch.forEach((id) => set.add(id))
      this.rows.set(rowId, set)
    }
    return { hit: false, fetch, waiting }
  }

  /** İstek yola çıktı */
  begin(ids: readonly number[]): void {
    ids.forEach((id) => this.inflight.add(id))
  }

  /** İstek bitti (başarılı ya da değil); gelen değerler yazılır */
  settle(ids: readonly number[], values: ReadonlyMap<number, V>, now: number): void {
    ids.forEach((id) => this.inflight.delete(id))
    for (const [id, value] of values) this.videos.set(id, { value, at: now })
  }

  /** İyimser güncelleme (Listeme ekle, Beğen); kayıt yoksa bir şey yapmaz. Eski değeri döndürür. */
  update(videoId: number, fn: (v: V) => V): V | null {
    const e = this.videos.get(videoId)
    if (!e) return null
    this.videos.set(videoId, { value: fn(e.value), at: e.at })
    return e.value
  }

  isInflight(videoId: number): boolean {
    return this.inflight.has(videoId)
  }

  requestedForRow(rowId: string): number[] {
    return [...(this.rows.get(rowId) ?? [])]
  }

  clear(): void {
    this.videos.clear()
    this.inflight.clear()
    this.rows.clear()
  }
}
