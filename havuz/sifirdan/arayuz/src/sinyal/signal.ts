// Yazılabilir sinyal: tek bir değeri tutar; okuyanı izler, değişince gözlemcilerine haber verir.
// Kim kullanır: uygulama kodu (`signal(0)`), computed.ts ve effect.ts (Source arayüzü üzerinden).
// Eşitlik varsayılan olarak `Object.is`'tir: aynı değeri yazmak hiçbir şeyi tetiklemez.
// Genişletme: dizi/nesne için "her yazmada bildir" isteniyorsa `equals: () => false` verin.
import { assertWritable, bumpEpoch, endBatch, startBatch, track, type Observer, type Source } from './graph.ts'

export interface SignalOptions<T> {
  /** İki değer eşitse yazma yok sayılır. Varsayılan: Object.is */
  equals?: (a: T, b: T) => boolean
  /** Hata iletilerinde ve hata ayıklamada görünen ad. */
  name?: string
}

export class Signal<T> implements Source {
  version = 0
  readonly observers = new Set<Observer>()
  readonly name: string | undefined
  private current: T
  private readonly equals: (a: T, b: T) => boolean

  constructor(initial: T, options: SignalOptions<T> = {}) {
    this.current = initial
    this.equals = options.equals ?? Object.is
    this.name = options.name
  }

  /** Okur ve (bir etki/hesaplanmış içindeyse) bağımlılık olarak kaydeder. */
  get value(): T {
    track(this)
    return this.current
  }

  set value(next: T) {
    this.set(next)
  }

  /** İzlemeden okur. */
  peek(): T {
    return this.current
  }

  set(next: T): void {
    assertWritable(this.name)
    if (this.equals(this.current, next)) return
    this.current = next
    this.version++
    bumpEpoch()
    startBatch()
    try {
      for (const observer of this.observers) observer.notify()
    } finally {
      endBatch()
    }
  }

  /** Önceki değerden yenisini üretir: `count.update((n) => n + 1)`. */
  update(fn: (previous: T) => T): void {
    this.set(fn(this.current))
  }

  refresh(): void {}

  addObserver(observer: Observer): void {
    this.observers.add(observer)
  }

  removeObserver(observer: Observer): void {
    this.observers.delete(observer)
  }
}

export function signal<T>(initial: T, options?: SignalOptions<T>): Signal<T> {
  return new Signal(initial, options)
}
