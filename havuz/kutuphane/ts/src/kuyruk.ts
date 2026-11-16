/**
 * kuyruk — eşzamanlılığı sınırlı görev kuyruğu: aynı anda en çok N görev çalışır, gerisi sırada bekler
 * (öncelik destekli; eşit öncelikte ilk gelen ilk çalışır). Ayrıca `mapLimit`: diziyi en çok N paralel işle eşler.
 *
 * Kullanım:
 *   const kuyruk = new TaskQueue({ concurrency: 3 })
 *   const sonuc = await kuyruk.add((signal) => fetch(url, { signal }).then((r) => r.json()))
 *   kuyruk.add(() => yedekle(), { priority: 10 })        // büyük öncelik önce çalışır
 *   await kuyruk.onIdle()                                 // sıra boşalıp çalışan iş bitince
 *   const boyutlar = await mapLimit(dosyalar, 4, (f) => boyutOku(f))   // sıra korunur
 *
 * Sınırlar: Tek süreç içidir (kalıcı değil; sayfa/süreç kapanınca sıradakiler kaybolur). Çalışan görev
 * durdurulamaz; ancak görevlere verilen AbortSignal `clear({ abortRunning: true })` ile tetiklenir, görev buna
 * uymalıdır. `mapLimit` ilk hatada yeni iş başlatmaz ve o hatayla reddedilir (çalışanlar arka planda biter).
 *
 * Genişletme: Zaman aşımı gibi görev başına davranış `add` seçeneklerine eklenir ve `run` içinde uygulanır.
 */

export class QueueClearedError extends Error {
  override name = 'QueueClearedError'
}

interface Job {
  run: () => void
  reject: (reason: unknown) => void
  priority: number
  order: number
}

export class TaskQueue {
  readonly concurrency: number
  private readonly waiting: Job[] = []
  private running = 0
  private paused: boolean
  private counter = 0
  private controller = new AbortController()
  private idleWaiters: (() => void)[] = []

  constructor(options: { concurrency?: number; autoStart?: boolean } = {}) {
    const concurrency = options.concurrency ?? 4
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new RangeError('concurrency 1 veya daha büyük bir tam sayı olmalı.')
    }
    this.concurrency = concurrency
    this.paused = options.autoStart === false
  }

  /** Sırada bekleyen görev sayısı. */
  get size(): number {
    return this.waiting.length
  }

  /** Şu an çalışan görev sayısı. */
  get pending(): number {
    return this.running
  }

  /** Görevi sıraya ekler; görevin sonucuyla çözülen bir Promise döner. */
  add<T>(
    task: (signal: AbortSignal) => Promise<T> | T,
    options: { priority?: number; signal?: AbortSignal } = {},
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const job: Job = {
        priority: options.priority ?? 0,
        order: this.counter++,
        reject,
        run: () => {
          if (options.signal?.aborted) {
            reject(options.signal.reason as Error)
            this.finish()
            return
          }
          // Görev hemen (eşzamanlı) başlatılır; sinyal başladığı andaki denetleyiciye bağlıdır.
          let result: Promise<T> | T
          try {
            result = task(this.controller.signal)
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)))
            this.finish()
            return
          }
          Promise.resolve(result)
            .then(resolve, reject)
            .finally(() => this.finish())
        },
      }
      // Öncelik büyükten küçüğe; eşitlerde ekleme sırası (kararlı).
      let index = this.waiting.length
      while (index > 0 && (this.waiting[index - 1]?.priority ?? 0) < job.priority) index -= 1
      this.waiting.splice(index, 0, job)
      this.pump()
    })
  }

  private pump(): void {
    while (!this.paused && this.running < this.concurrency && this.waiting.length > 0) {
      const job = this.waiting.shift()
      if (job === undefined) break
      this.running += 1
      job.run()
    }
    if (this.running === 0 && this.waiting.length === 0) {
      const waiters = this.idleWaiters
      this.idleWaiters = []
      for (const resolve of waiters) resolve()
    }
  }

  private finish(): void {
    this.running -= 1
    this.pump()
  }

  /** Sıra boşalıp çalışan görev kalmayınca çözülür. */
  onIdle(): Promise<void> {
    if (this.running === 0 && this.waiting.length === 0) return Promise.resolve()
    return new Promise((resolve) => this.idleWaiters.push(resolve))
  }

  /** Yeni görev başlatmayı durdurur (çalışanlar sürer). */
  pause(): void {
    this.paused = true
  }

  start(): void {
    this.paused = false
    this.pump()
  }

  /** Sıradakileri QueueClearedError ile reddeder; `abortRunning` → çalışanların sinyali tetiklenir. */
  clear(options: { abortRunning?: boolean } = {}): void {
    const jobs = this.waiting.splice(0)
    for (const job of jobs) job.reject(new QueueClearedError('Görev kuyruk temizlendiği için çalıştırılmadı.'))
    if (options.abortRunning === true) {
      this.controller.abort(new QueueClearedError('Kuyruk temizlendi.'))
      this.controller = new AbortController()
    }
    this.pump()
  }
}

/** Diziyi en çok `limit` paralel işle eşler; sonuç sırası girdi sırasıdır. İlk hatada reddeder. */
export async function mapLimit<T, R>(
  items: Iterable<T>,
  limit: number,
  fn: (item: T, index: number) => Promise<R> | R,
): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError('limit 1 veya daha büyük bir tam sayı olmalı.')
  const list = [...items]
  const results = new Array<R>(list.length)
  let next = 0
  let failed = false
  const worker = async (): Promise<void> => {
    while (!failed && next < list.length) {
      const index = next++
      try {
        results[index] = await fn(list[index] as T, index)
      } catch (error) {
        failed = true
        throw error
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker))
  return results
}
