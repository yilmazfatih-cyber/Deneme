// Etki: okuduğu sinyaller değişince yeniden çalışan yan etki (DOM güncelleme, günlük, ağ isteği...).
// Her çalışmadan önce bir önceki çalışmanın temizliği yapılır: işlevin döndürdüğü temizlik, `onCleanup` ile
// kaydedilenler ve bu etkinin içinde yaratılmış iç etkiler (sahiplik: iç etki üst etkiyle birlikte ölür).
// Etkiler kuyruktan oluşturulma sırasıyla çalışır; bir kaynak gerçekten değişmediyse (ör. hesaplanmış aynı
// değeri verdiyse) etki hiç çalışmaz.
// Genişletme: zamanlanmış etki (ör. requestAnimationFrame ile) için `notify` içinde kuyruk yerine zamanlayıcı kullanın.
import {
  collect,
  endBatch,
  enqueue,
  sourcesChanged,
  startBatch,
  swapSources,
  type Observer,
  type Runnable,
  type Source,
} from './graph.ts'

export type Cleanup = () => void
export type EffectFn = () => void | Cleanup

let nextId = 0
let currentOwner: Effect | undefined

export class Effect implements Observer, Runnable {
  readonly kind = 'effect'
  readonly id = ++nextId
  sources = new Map<Source, number>()
  /** Kaç kez çalıştı (testler ve hata ayıklama için). */
  runCount = 0
  private readonly fn: EffectFn
  private queued = false
  private disposed = false
  private cleanups: Cleanup[] = []
  private children: Effect[] = []

  constructor(fn: EffectFn) {
    this.fn = fn
  }

  get isDisposed(): boolean {
    return this.disposed
  }

  notify(): void {
    if (this.queued || this.disposed) return
    this.queued = true
    enqueue(this)
  }

  dropFromQueue(): void {
    this.queued = false
  }

  runIfStale(): void {
    this.queued = false
    if (this.disposed) return
    if (sourcesChanged(this)) this.run()
  }

  run(): void {
    if (this.disposed) return
    this.runCount++
    this.teardown()
    const prevOwner = setOwner(this)
    let result
    try {
      result = collect(this, this.fn)
    } finally {
      setOwner(prevOwner)
    }
    swapSources(this, result.sources, true)
    // Etki, okuduğu bir sinyali çalışırken kendisi yazdıysa o anda henüz abone değildi: bildirim kaçtı.
    // Sürümler okuma anındakinden farklıysa kendini yeniden kuyruğa koyar.
    if (sourcesChanged(this)) this.notify()
    if (!result.ok) throw result.error
    if (typeof result.value === 'function') this.cleanups.push(result.value)
  }

  addCleanup(fn: Cleanup): void {
    this.cleanups.push(fn)
  }

  adopt(child: Effect): void {
    this.children.push(child)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.teardown()
    for (const source of this.sources.keys()) source.removeObserver(this)
    this.sources = new Map()
  }

  /** Önce iç etkiler (en son yaratılan önce), sonra kendi temizlikleri (en son kaydedilen önce). */
  private teardown(): void {
    const children = this.children
    this.children = []
    for (let i = children.length - 1; i >= 0; i--) children[i]?.dispose()
    const cleanups = this.cleanups
    this.cleanups = []
    for (let i = cleanups.length - 1; i >= 0; i--) cleanups[i]?.()
  }
}

/** Sahip etkiyi değiştirir ve öncekini döndürür (iç içe etkilerin sahipliği için). */
function setOwner(owner: Effect | undefined): Effect | undefined {
  const previous = currentOwner
  currentOwner = owner
  return previous
}

/**
 * Etkiyi hemen bir kez çalıştırır ve bir "kapat" işlevi döndürür. İlk çalışma bir toplu iş içinde yapılır:
 * etkinin kendi yazmaları, o çalışma bitince işlenir (iç içe yeniden giriş olmaz).
 */
export function effect(fn: EffectFn): () => void {
  const instance = new Effect(fn)
  currentOwner?.adopt(instance)
  startBatch()
  try {
    instance.run()
  } finally {
    endBatch()
  }
  return () => instance.dispose()
}

/** Çalışmakta olan etkiye, bir sonraki çalışmadan ya da kapatılmadan önce çağrılacak bir temizlik ekler. */
export function onCleanup(fn: Cleanup): void {
  if (!currentOwner) throw new Error('onCleanup yalnız bir etkinin içinde çağrılabilir.')
  currentOwner.addCleanup(fn)
}
