// Ara değerleme animasyonu (tween): `from`'dan `to`'ya `duration` ms'de, yumuşatma eğrisiyle. Değer türü
// sayı, renk, birimli dizgi, dizi ya da nesne olabilir (interpolate.ts). Gecikme (`delay`) süreye dahildir.
// Yay animasyonu (`springAnimation`) ise süresizdir: her karede kapalı formülden konum okunur; hedef
// değişirse (`retarget`) o anki hız korunur — sürükle-bırak sonrası doğal hareket.
// Genişletme: tekrar (repeat/yoyo) için `render`'da zamanı süreye göre modlayan bir seçenek ekleyin.
import { linear, type Easing } from './easing.ts'
import { interpolate, type Interpolator } from './interpolate.ts'
import { shouldReduceMotion } from './motion.ts'
import { Player } from './player.ts'
import { springState, type SpringConfig } from './spring.ts'
import { defaultTicker, type Ticker } from './ticker.ts'

export interface TweenOptions<T> {
  from: T
  to: T
  /** Süre (ms). */
  duration: number
  delay?: number
  easing?: Easing
  onUpdate?: (value: T, progress: number) => void
  onComplete?: () => void
  ticker?: Ticker
  /** Kurulunca hemen oynasın mı? (varsayılan true) */
  autoplay?: boolean
}

export class Tween<T> extends Player {
  readonly duration: number
  private readonly options: TweenOptions<T>
  private readonly value: Interpolator<T>
  current: T

  constructor(options: TweenOptions<T>) {
    super(options.ticker)
    if (options.duration < 0 || (options.delay ?? 0) < 0) throw new RangeError('Süre ve gecikme negatif olamaz.')
    this.options = options
    this.duration = options.duration + (options.delay ?? 0)
    this.value = interpolate(options.from, options.to)
    this.current = options.from
    if (options.autoplay !== false) this.play()
  }

  render(time: number): void {
    const local = Math.max(0, time - (this.options.delay ?? 0))
    const t = this.options.duration === 0 ? 1 : Math.min(1, local / this.options.duration)
    const eased = (this.options.easing ?? linear)(t)
    this.current = this.value(eased)
    this.options.onUpdate?.(this.current, t)
  }

  protected override onFinish(completed: boolean): void {
    if (completed) this.options.onComplete?.()
  }
}

export function tween<T>(options: TweenOptions<T>): Tween<T> {
  return new Tween(options)
}

export interface SpringAnimation {
  readonly value: number
  readonly velocity: number
  retarget(to: number): void
  stop(): void
  finished: Promise<boolean>
}

/** Yay animasyonu: durulunca biter. Hareket azaltma açıksa hemen hedefe atlar. */
export function springAnimation(options: {
  from: number
  to: number
  config?: SpringConfig
  velocity?: number
  onUpdate?: (value: number) => void
  ticker?: Ticker
}): SpringAnimation {
  const ticker = options.ticker ?? defaultTicker()
  let from = options.from
  let to = options.to
  let v0 = options.velocity ?? 0
  let start: number | undefined
  let value = from
  let velocity = v0
  let resolve!: (completed: boolean) => void
  const finished = new Promise<boolean>((r) => (resolve = r))
  let remove: (() => void) | undefined
  const finish = (completed: boolean) => {
    remove?.()
    remove = undefined
    resolve(completed)
  }
  if (shouldReduceMotion()) {
    value = to
    options.onUpdate?.(to)
    finish(true)
  } else {
    remove = ticker.add((now) => {
      start ??= now
      const state = springState(from, to, (now - start) / 1000, options.config, v0)
      value = state.position
      velocity = state.velocity
      options.onUpdate?.(value)
      if (state.done) finish(true)
    })
  }
  return {
    get value() {
      return value
    },
    get velocity() {
      return velocity
    },
    retarget(next) {
      from = value
      v0 = velocity
      to = next
      start = undefined
    },
    stop: () => finish(false),
    finished,
  }
}
