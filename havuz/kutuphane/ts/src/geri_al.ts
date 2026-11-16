/**
 * geri_al — geri al / yinele yığını (anlık görüntü temelli): her değişiklik yeni bir durum olarak eklenir;
 * `undo`/`redo` önceki/sonraki duruma döner. Yazı yazmak gibi ardışık küçük değişiklikler tek adımda birleştirilebilir.
 *
 * Kullanım:
 *   const gecmis = new UndoStack({ metin: '' }, { limit: 100 })
 *   gecmis.push({ metin: 'Mer' }, { mergeKey: 'yazi' })
 *   gecmis.push({ metin: 'Merhaba' }, { mergeKey: 'yazi' })   // önceki adımla birleşir
 *   gecmis.undo()                                            // { metin: '' }
 *   gecmis.redo()                                            // { metin: 'Merhaba' }
 *
 * Sınırlar: Durumlar DEĞİŞMEZ (immutable) olmalıdır: aynı nesneyi değiştirip yeniden push etmeyin; yeni nesne
 * verin. Bellek = limit × durum boyutu; büyük belgelerde komut (fark) temelli bir yapı gerekir. Yalnız TypeScript'te.
 *
 * Genişletme: Kaydetme noktası ("kaydedilmemiş değişiklik var mı?") gibi özellikler sınıfa alan + test olarak eklenir.
 */

export class UndoStack<T> {
  private past: T[] = []
  private future: T[] = []
  private present: T
  private lastMergeKey: string | undefined
  private readonly limit: number

  constructor(initial: T, options: { limit?: number } = {}) {
    const limit = options.limit ?? 100
    if (!Number.isInteger(limit) || limit < 1) throw new RangeError('limit 1 veya daha büyük bir tam sayı olmalı.')
    this.present = initial
    this.limit = limit
  }

  get current(): T {
    return this.present
  }

  get canUndo(): boolean {
    return this.past.length > 0
  }

  get canRedo(): boolean {
    return this.future.length > 0
  }

  /** Geçmişte ve gelecekte kaç adım var. */
  get counts(): { undo: number; redo: number } {
    return { undo: this.past.length, redo: this.future.length }
  }

  /**
   * Yeni durumu ekler; yineleme geçmişi silinir. `mergeKey` bir önceki push'unkiyle aynıysa yeni adım açılmaz,
   * son adım güncellenir (ör. aynı alana art arda yazılan harfler).
   */
  push(next: T, options: { mergeKey?: string } = {}): void {
    const merge = options.mergeKey !== undefined && options.mergeKey === this.lastMergeKey && this.past.length > 0
    if (!merge) {
      this.past.push(this.present)
      if (this.past.length > this.limit) this.past.shift()
    }
    this.present = next
    this.future = []
    this.lastMergeKey = options.mergeKey
  }

  /** Bir adım geri; geri alınacak adım yoksa undefined. */
  undo(): T | undefined {
    if (this.past.length === 0) return undefined
    this.future.push(this.present)
    this.present = this.past.pop() as T
    this.lastMergeKey = undefined
    return this.present
  }

  /** Bir adım ileri; yinelenecek adım yoksa undefined. */
  redo(): T | undefined {
    if (this.future.length === 0) return undefined
    this.past.push(this.present)
    this.present = this.future.pop() as T
    this.lastMergeKey = undefined
    return this.present
  }

  /** Geçmişi siler; isteğe bağlı yeni başlangıç durumu. */
  clear(initial: T = this.present): void {
    this.past = []
    this.future = []
    this.present = initial
    this.lastMergeKey = undefined
  }
}
