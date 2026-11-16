/**
 * olay — tipli olay yayıcı: olay adları ve yükleri derleme anında denetlenir; abonelikten çıkış işlevi döner;
 * bir dinleyicinin hatası diğerlerini durdurmaz; `waitFor` ile olay beklenebilir (zaman aşımı/iptal destekli).
 *
 * Kullanım:
 *   type Olaylar = { kaydedildi: { id: string }; silindi: string; temizlendi: undefined }
 *   const yayici = new Emitter<Olaylar>()
 *   const birak = yayici.on('kaydedildi', (y) => console.log(y.id))   // y: { id: string }
 *   yayici.emit('kaydedildi', { id: '42' })
 *   birak()                                                         // abonelikten çık
 *   const silinen = await yayici.waitFor('silindi', { timeoutMs: 5000 })
 *
 * Hata davranışı: Bütün dinleyiciler çağrılır; hata çıkan varsa sonra fırlatılır (tek hata → kendisi, birden çok →
 * AggregateError). Kurucuya `onError` verilirse fırlatılmaz, oraya bildirilir.
 *
 * Sınırlar: Eşzamanlıdır (dinleyiciler `emit` içinde sırayla çağrılır; Promise döndüren dinleyici beklenmez).
 * Yalnız TypeScript'te vardır (Python'da karşılığı gerekmedi). Bellek sızıntısı uyarısı yoktur: abonelikten
 * çıkmayı unutmayın.
 *
 * Genişletme: Yeni bir davranış (ör. joker "*" dinleyici) `emit` içinde tek yerde eklenir ve testi yazılır.
 */

type Listener<P> = (payload: P) => void

export interface WaitForOptions<P> {
  timeoutMs?: number
  signal?: AbortSignal
  /** Yalnız bu koşulu sağlayan yükü bekle. */
  filter?: (payload: P) => boolean
}

export class Emitter<Events extends Record<keyof Events, unknown>> {
  private readonly listeners = new Map<keyof Events, Set<Listener<never>>>()
  private readonly onError: ((error: unknown, event: keyof Events) => void) | undefined

  constructor(options: { onError?: (error: unknown, event: keyof Events) => void } = {}) {
    this.onError = options.onError
  }

  /** Dinleyici ekler; abonelikten çıkaran işlevi döner. */
  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    let set = this.listeners.get(event)
    if (set === undefined) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(listener)
    return () => this.off(event, listener)
  }

  /** Yalnız bir kez çalışan dinleyici. */
  once<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    const off = this.on(event, (payload) => {
      off()
      listener(payload)
    })
    return off
  }

  off<K extends keyof Events>(event: K, listener: Listener<Events[K]>): void {
    const set = this.listeners.get(event)
    set?.delete(listener)
    if (set?.size === 0) this.listeners.delete(event)
  }

  /** Olayı yayar. Dinleyiciler eklenme sırasıyla çağrılır; yayın sırasında eklenen/çıkan dinleyici bu turu etkilemez. */
  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const snapshot = [...(this.listeners.get(event) ?? [])] as Listener<Events[K]>[]
    const errors: unknown[] = []
    for (const listener of snapshot) {
      try {
        listener(payload)
      } catch (error) {
        if (this.onError) this.onError(error, event)
        else errors.push(error)
      }
    }
    if (errors.length === 1) throw errors[0]
    if (errors.length > 1) throw new AggregateError(errors, `"${String(event)}" olayında ${errors.length} dinleyici hata verdi.`)
  }

  listenerCount(event?: keyof Events): number {
    if (event !== undefined) return this.listeners.get(event)?.size ?? 0
    let total = 0
    for (const set of this.listeners.values()) total += set.size
    return total
  }

  /** Bir olayın (ya da hepsinin) dinleyicilerini siler. */
  clear(event?: keyof Events): void {
    if (event === undefined) this.listeners.clear()
    else this.listeners.delete(event)
  }

  /** Olay gelene kadar bekler; zaman aşımında ya da iptalde reddeder. */
  waitFor<K extends keyof Events>(event: K, options: WaitForOptions<Events[K]> = {}): Promise<Events[K]> {
    return new Promise<Events[K]>((resolve, reject) => {
      if (options.signal?.aborted) {
        reject(options.signal.reason as Error)
        return
      }
      let timer: ReturnType<typeof setTimeout> | undefined
      const cleanup = (): void => {
        off()
        if (timer !== undefined) clearTimeout(timer)
        options.signal?.removeEventListener('abort', onAbort)
      }
      const onAbort = (): void => {
        cleanup()
        reject(options.signal?.reason as Error)
      }
      const off = this.on(event, (payload) => {
        if (options.filter && !options.filter(payload)) return
        cleanup()
        resolve(payload)
      })
      if (options.timeoutMs !== undefined) {
        timer = setTimeout(() => {
          cleanup()
          reject(new Error(`"${String(event)}" olayı ${options.timeoutMs} ms içinde gelmedi.`))
        }, options.timeoutMs)
      }
      options.signal?.addEventListener('abort', onAbort, { once: true })
    })
  }
}
