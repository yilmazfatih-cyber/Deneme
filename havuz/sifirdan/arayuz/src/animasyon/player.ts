// Oynatıcı: süreli her animasyonun (ara değerleme, zaman çizelgesi) ortak denetimi — oynat, duraklat, git
// (seek), ters çevir, iptal, `finished` sözü. Alt sınıf yalnız `duration` ve `render(zaman)` yazar.
// Hareket azaltma açıksa `play()` animasyonu anında sona götürür (son kare çizilir, söz çözülür).
// Genişletme: oynatma hızı (playbackRate) için `tick` içindeki `dt`'yi bir katsayıyla çarpın.
import { shouldReduceMotion } from './motion.ts'
import { defaultTicker, type Ticker } from './ticker.ts'

export interface Playable {
  readonly duration: number
  /** Animasyonu yerel zamandaki (ms, 0..duration) durumuna getirir. */
  render(time: number): void
}

export abstract class Player implements Playable {
  abstract readonly duration: number
  abstract render(time: number): void
  protected readonly ticker: Ticker
  time = 0
  direction: 1 | -1 = 1
  private stop: (() => void) | undefined
  private last: number | undefined
  private resolveFinished!: (completed: boolean) => void
  /** Bitince true, iptal edilirse false ile çözülür. */
  finished: Promise<boolean>

  constructor(ticker?: Ticker) {
    this.ticker = ticker ?? defaultTicker()
    this.finished = new Promise((resolve) => (this.resolveFinished = resolve))
  }

  get playing(): boolean {
    return this.stop !== undefined
  }

  get progress(): number {
    return this.duration === 0 ? 1 : this.time / this.duration
  }

  play(): this {
    if (shouldReduceMotion()) {
      this.seek(this.direction > 0 ? this.duration : 0)
      this.complete(true)
      return this
    }
    if (this.playing) return this
    if ((this.direction > 0 && this.time >= this.duration) || (this.direction < 0 && this.time <= 0))
      this.restartPromise()
    this.last = undefined
    this.stop = this.ticker.add((now) => this.tick(now))
    return this
  }

  pause(): this {
    this.stop?.()
    this.stop = undefined
    return this
  }

  seek(time: number): this {
    this.time = Math.max(0, Math.min(this.duration, time))
    this.render(this.time)
    return this
  }

  reverse(): this {
    this.direction = this.direction > 0 ? -1 : 1
    if (!this.playing) this.play()
    return this
  }

  cancel(): void {
    this.pause()
    this.complete(false)
  }

  private restartPromise(): void {
    this.finished = new Promise((resolve) => (this.resolveFinished = resolve))
    this.time = this.direction > 0 ? 0 : this.duration
  }

  private complete(value: boolean): void {
    this.resolveFinished(value)
    this.onFinish(value)
  }

  /** Alt sınıf için: bitiş kancası. */
  protected onFinish(_completed: boolean): void {}

  private tick(now: number): void {
    const dt = this.last === undefined ? 0 : now - this.last
    this.last = now
    this.time = Math.max(0, Math.min(this.duration, this.time + dt * this.direction))
    this.render(this.time)
    const done = this.direction > 0 ? this.time >= this.duration : this.time <= 0
    if (done) {
      this.pause()
      this.complete(true)
    }
  }
}
