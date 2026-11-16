// Hesaplanmış değer: tembel (okunmadan hesaplanmaz), önbellekli (kaynaklar değişmedikçe yeniden hesaplanmaz).
// Canlıyken (bir etki ona bağlıyken) kaynaklarına abonedir ve "eskidin" bildirimi alır; canlı değilken abone
// değildir (çöp toplayıcı onu silebilir) ve okunduğunda dönem sayacına + kaynak sürümlerine bakarak doğrulanır.
// Hata atan işlev de bir sonuçtur: hata önbelleğe alınır, okuyana yeniden atılır, kaynak değişince yeniden denenir.
// Genişletme: eşitlik için `equals` seçeneği; yeni bir "kaynak türü" için graph.ts'teki arayüzler.
import { collect, getEpoch, sourcesChanged, swapSources, track, type Observer, type Source } from './graph.ts'

export class CycleError extends Error {
  constructor(name: string | undefined) {
    super(`Döngüsel bağımlılık: ${name ? `"${name}" ` : ''}hesaplanırken kendi değerine ulaştı.`)
    this.name = 'CycleError'
  }
}

export interface ComputedOptions<T> {
  equals?: (a: T, b: T) => boolean
  name?: string
}

export class Computed<T> implements Source, Observer {
  readonly kind = 'computed'
  version = 0
  readonly observers = new Set<Observer>()
  sources = new Map<Source, number>()
  readonly name: string | undefined
  /** Kaç kez gerçekten hesaplandı (testler ve hata ayıklama için). */
  computeCount = 0
  private readonly fn: (previous: T | undefined) => T
  private readonly equals: (a: T, b: T) => boolean
  private current: T | undefined
  private error: unknown
  private hasError = false
  private stale = true
  private running = false
  private checkedEpoch = -1
  private notifiedEpoch = -1

  constructor(fn: (previous: T | undefined) => T, options: ComputedOptions<T> = {}) {
    this.fn = fn
    this.equals = options.equals ?? Object.is
    this.name = options.name
  }

  get value(): T {
    this.refresh()
    track(this)
    if (this.hasError) throw this.error
    return this.current as T
  }

  /** İzlemeden okur (yine de güncel değeri verir). */
  peek(): T {
    this.refresh()
    if (this.hasError) throw this.error
    return this.current as T
  }

  /** Bildirim aynı yazma için bir kez aşağı yayılır (elmasta iki yoldan gelse bile). */
  notify(): void {
    const epoch = getEpoch()
    if (this.notifiedEpoch === epoch) return
    this.notifiedEpoch = epoch
    this.stale = true
    for (const observer of this.observers) observer.notify()
  }

  refresh(): void {
    if (this.running) throw new CycleError(this.name)
    const live = this.observers.size > 0
    if (!this.stale && (live || this.checkedEpoch === getEpoch())) return
    let changed: boolean
    this.running = true
    try {
      changed = this.version === 0 || sourcesChanged(this)
    } finally {
      this.running = false
    }
    if (changed) this.recompute()
    this.stale = false
    this.checkedEpoch = getEpoch()
  }

  addObserver(observer: Observer): void {
    const wasLive = this.observers.size > 0
    this.observers.add(observer)
    if (wasLive) return
    for (const source of this.sources.keys()) source.addObserver(this)
    // Canlı değilken bildirim almıyordu: o günden beri yazma olduysa bir sonraki okumada doğrulansın.
    if (this.checkedEpoch !== getEpoch()) this.stale = true
  }

  removeObserver(observer: Observer): void {
    if (!this.observers.delete(observer) || this.observers.size > 0) return
    for (const source of this.sources.keys()) source.removeObserver(this)
  }

  private recompute(): void {
    this.computeCount++
    this.running = true
    let result
    try {
      result = collect(this, () => this.fn(this.current))
    } finally {
      this.running = false
    }
    swapSources(this, result.sources, this.observers.size > 0)
    if (result.ok) {
      const unchanged = this.version > 0 && !this.hasError && this.equals(this.current as T, result.value)
      if (unchanged) return
      this.current = result.value
      this.hasError = false
      this.error = undefined
      this.version++
    } else {
      if (this.hasError && this.error === result.error) return
      this.error = result.error
      this.hasError = true
      this.version++
    }
  }
}

export function computed<T>(fn: (previous: T | undefined) => T, options?: ComputedOptions<T>): Computed<T> {
  return new Computed(fn, options)
}
