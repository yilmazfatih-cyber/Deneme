// Sabit zaman adımlı oyun döngüsü ("Fix Your Timestep"). Ekran saniyede 60 ya da 144 kare çizse de fizik hep
// aynı adımla (varsayılan 1/60 s) ilerler: geçen gerçek süre bir "birikim"e eklenir, birikim adım kadar
// oldukça `update(step)` çağrılır. Artan kısım (0..1) `render(alpha)`'ya verilir: çizim önceki ve şimdiki fizik
// durumu arasında ara değerleme yapar, böylece hareket akıcı görünür. Çok uzun bir kare (sekme arka plandaydı)
// `maxFrame` ile kırpılır: aksi hâlde yetişmek için binlerce adım atılır ("ölüm sarmalı").
// Saat ve kare isteği dışarıdan verilir: testler `advance(saniye)` ile döngüyü başsız çalıştırır.
// Genişletme: yavaş çekim için `update`'e verilen adımı değil, `advance`'e verilen süreyi ölçekleyin.

export interface LoopOptions {
  /** Fizik adımı (saniye). */
  step?: number
  /** Tek karede işlenecek en uzun süre (saniye). */
  maxFrame?: number
  update: (dt: number) => void
  render?: (alpha: number) => void
  now?: () => number
  requestFrame?: (callback: (time: number) => void) => number
  cancelFrame?: (handle: number) => void
}

export class FixedLoop {
  readonly step: number
  private readonly maxFrame: number
  private readonly options: LoopOptions
  private accumulator = 0
  private last: number | undefined
  private handle: number | undefined
  /** Toplam fizik adımı sayısı. */
  ticks = 0
  alpha = 0

  constructor(options: LoopOptions) {
    this.options = options
    this.step = options.step ?? 1 / 60
    this.maxFrame = options.maxFrame ?? 0.25
  }

  get running(): boolean {
    return this.handle !== undefined
  }

  /** Geçen süreyi (saniye) işler; kaç fizik adımı atıldığını döndürür. */
  advance(elapsed: number): number {
    this.accumulator += Math.min(Math.max(elapsed, 0), this.maxFrame)
    let steps = 0
    while (this.accumulator >= this.step) {
      this.options.update(this.step)
      this.accumulator -= this.step
      this.ticks++
      steps++
    }
    this.alpha = this.accumulator / this.step
    this.options.render?.(this.alpha)
    return steps
  }

  start(): void {
    if (this.running) return
    const request = this.options.requestFrame ?? ((cb: (time: number) => void) => requestAnimationFrame(cb))
    const now = this.options.now ?? (() => performance.now())
    this.last = now()
    const frame = (time: number) => {
      const elapsed = (time - (this.last ?? time)) / 1000
      this.last = time
      this.advance(elapsed)
      if (this.handle !== undefined) this.handle = request(frame)
    }
    this.handle = request(frame)
  }

  stop(): void {
    if (this.handle === undefined) return
    const cancel = this.options.cancelFrame ?? ((h: number) => cancelAnimationFrame(h))
    cancel(this.handle)
    this.handle = undefined
    this.last = undefined
  }
}
