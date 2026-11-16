// Kare zamanlayıcısı: tüm animasyonlar tek bir requestAnimationFrame döngüsünü paylaşır. Döngü yalnız çalışan
// animasyon varken döner; son animasyon bitince durur (pil dostu). Saat dışarıdan verilir (`Clock`):
// testler `ManualClock` ile zamanı elle ilerletir, böylece "300 ms sonra değer şu" kesin olarak sınanır.
// Genişletme: sekme arka plandayken duraklatmak için `document.visibilitychange` ile `pause/resume` ekleyin.

export interface Clock {
  now(): number
  request(callback: (time: number) => void): number
  cancel(handle: number): void
}

/** Tarayıcıda rAF; Node'da (rAF yoksa) ~60 Hz setTimeout. */
export function systemClock(): Clock {
  if (typeof requestAnimationFrame === 'function') {
    return {
      now: () => performance.now(),
      request: (cb) => requestAnimationFrame(cb),
      cancel: (h) => cancelAnimationFrame(h),
    }
  }
  return {
    now: () => performance.now(),
    request: (cb) => setTimeout(() => cb(performance.now()), 16) as unknown as number,
    cancel: (h) => clearTimeout(h),
  }
}

/** Elle ilerletilen saat: `advance(ms)` bekleyen kare isteklerini o anın zamanıyla çalıştırır. */
export class ManualClock implements Clock {
  time = 0
  private nextHandle = 1
  private readonly pending = new Map<number, (time: number) => void>()

  now(): number {
    return this.time
  }

  request(callback: (time: number) => void): number {
    const handle = this.nextHandle++
    this.pending.set(handle, callback)
    return handle
  }

  cancel(handle: number): void {
    this.pending.delete(handle)
  }

  /** Zamanı `ms` ilerletir; `frame` ms'lik karelerle (varsayılan tek kare). `advance(0)` tek bir kare çalıştırır. */
  advance(ms: number, frame = ms): void {
    let left = ms
    do {
      const step = Math.min(frame, left)
      this.time += step
      left -= step
      const callbacks = [...this.pending.values()]
      this.pending.clear()
      for (const callback of callbacks) callback(this.time)
    } while (left > 1e-9)
  }

  get waiting(): number {
    return this.pending.size
  }
}

export class Ticker {
  readonly clock: Clock
  private readonly callbacks = new Set<(time: number) => void>()
  private handle: number | undefined

  constructor(clock: Clock = systemClock()) {
    this.clock = clock
  }

  get running(): boolean {
    return this.handle !== undefined
  }

  add(callback: (time: number) => void): () => void {
    this.callbacks.add(callback)
    if (this.handle === undefined) this.handle = this.clock.request(this.frame)
    return () => this.callbacks.delete(callback)
  }

  private readonly frame = (time: number): void => {
    this.handle = undefined
    for (const callback of [...this.callbacks]) callback(time)
    if (this.callbacks.size > 0) this.handle = this.clock.request(this.frame)
  }
}

let shared: Ticker | undefined
export function defaultTicker(): Ticker {
  shared ??= new Ticker()
  return shared
}
