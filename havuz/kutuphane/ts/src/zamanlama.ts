/**
 * zamanlama — zamanla ilgili küçük ama hataya açık yardımcılar: iptal edilebilir `sleep`, Promise'e zaman aşımı
 * (`withTimeout`), `debounce` (son çağrıdan sonra bekle) ve `throttle` (en çok her N ms'de bir).
 *
 * Kullanım:
 *   await sleep(500, { signal })                                   // iptal edilirse sinyalin nedeniyle reddeder
 *   const veri = await withTimeout((signal) => fetch(url, { signal }), 5000)   // 5 sn'de bitmezse TimeoutError
 *   const ara = debounce((q: string) => sorgula(q), 300)            // yazarken her tuşta değil, durunca bir kez
 *   const kaydir = throttle(() => konumuGuncelle(), 100)           // kaydırırken en çok 100 ms'de bir
 *   ara.cancel(); ara.flush()                                       // bekleyeni iptal et / hemen çalıştır
 *
 * Sınırlar: Zamanlayıcılar `setTimeout` kullanır; arka plandaki tarayıcı sekmesinde yavaşlayabilir. debounce/
 * throttle'ın döndürdüğü işlev sonucu DÖNDÜRMEZ (undefined); sonuç gerekiyorsa çağrılan işlevin içinde kullanın.
 * Yalnız TypeScript'te vardır (Python'da asyncio.wait_for / asyncio.timeout kullanın).
 *
 * Genişletme: Yeni bir zamanlama aracı (ör. `interval`) iptal için AbortSignal alır ve testi vitest sahte
 * saatleriyle (vi.useFakeTimers) yazılır.
 */

export class TimeoutError extends Error {
  override name = 'TimeoutError'
}

/** `ms` bekler; sinyal iptal edilirse beklemeyi keser ve sinyalin nedeniyle reddeder. */
export function sleep(ms: number, options: { signal?: AbortSignal } = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const { signal } = options
    if (signal?.aborted) {
      reject(signal.reason as Error)
      return
    }
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(signal?.reason as Error)
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * İşi `ms` içinde bitmezse TimeoutError ile reddeder. İşlev verilirse ona bir AbortSignal geçer ve süre dolunca
 * sinyal tetiklenir (fetch gibi işlemler gerçekten durur). Promise verilirse yalnız beklemeyi bırakır.
 */
export function withTimeout<T>(
  work: Promise<T> | ((signal: AbortSignal) => Promise<T>),
  ms: number,
  options: { message?: string; signal?: AbortSignal } = {},
): Promise<T> {
  const controller = new AbortController()
  const outer = options.signal
  return new Promise<T>((resolve, reject) => {
    const cleanup = (): void => {
      clearTimeout(timer)
      outer?.removeEventListener('abort', onOuterAbort)
    }
    const timer = setTimeout(() => {
      const error = new TimeoutError(options.message ?? `İşlem ${ms} ms içinde bitmedi.`)
      controller.abort(error)
      cleanup()
      reject(error)
    }, ms)
    const onOuterAbort = (): void => {
      controller.abort(outer?.reason)
      cleanup()
      reject(outer?.reason as Error)
    }
    if (outer?.aborted) {
      onOuterAbort()
      return
    }
    outer?.addEventListener('abort', onOuterAbort, { once: true })
    const promise = typeof work === 'function' ? work(controller.signal) : work
    promise.then(
      (value) => {
        cleanup()
        resolve(value)
      },
      (error: unknown) => {
        cleanup()
        reject(error instanceof Error ? error : new Error(String(error)))
      },
    )
  })
}

export interface Controlled<A extends unknown[]> {
  (...args: A): void
  /** Bekleyen çağrıyı iptal eder. */
  cancel(): void
  /** Bekleyen çağrı varsa hemen çalıştırır. */
  flush(): void
  /** Bekleyen çağrı var mı? */
  pending(): boolean
}

/**
 * Son çağrıdan `waitMs` sonra çalışır (arada gelen çağrılar süreyi yeniler). `leading: true` → ilk çağrıda hemen;
 * `maxWaitMs` → sürekli çağrılsa bile en geç bu kadar sürede bir çalışır.
 */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  waitMs: number,
  options: { leading?: boolean; trailing?: boolean; maxWaitMs?: number } = {},
): Controlled<A> {
  const trailing = options.trailing ?? true
  let timer: ReturnType<typeof setTimeout> | undefined
  let maxTimer: ReturnType<typeof setTimeout> | undefined
  let lastArgs: A | undefined
  const clearTimers = (): void => {
    if (timer !== undefined) clearTimeout(timer)
    if (maxTimer !== undefined) clearTimeout(maxTimer)
    timer = undefined
    maxTimer = undefined
  }
  const invoke = (): void => {
    const args = lastArgs
    lastArgs = undefined
    clearTimers()
    if (args !== undefined) fn(...args)
  }
  const controlled = ((...args: A) => {
    const idle = timer === undefined
    if (idle && options.leading === true) {
      fn(...args)
      lastArgs = undefined
    } else if (trailing) lastArgs = args
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(() => (trailing ? invoke() : clearTimers()), waitMs)
    if (options.maxWaitMs !== undefined && maxTimer === undefined) {
      maxTimer = setTimeout(invoke, options.maxWaitMs)
    }
  }) as Controlled<A>
  controlled.cancel = () => {
    lastArgs = undefined
    clearTimers()
  }
  controlled.flush = invoke
  controlled.pending = () => lastArgs !== undefined
  return controlled
}

/** En çok `waitMs`'de bir çalışır: ilk çağrı hemen (leading), pencere içindeki son çağrı pencere sonunda (trailing). */
export function throttle<A extends unknown[]>(
  fn: (...args: A) => void,
  waitMs: number,
  options: { leading?: boolean; trailing?: boolean } = {},
): Controlled<A> {
  const leading = options.leading ?? true
  const trailing = options.trailing ?? true
  let timer: ReturnType<typeof setTimeout> | undefined
  let lastArgs: A | undefined
  const startWindow = (): void => {
    timer = setTimeout(() => {
      timer = undefined
      if (trailing && lastArgs !== undefined) {
        const args = lastArgs
        lastArgs = undefined
        fn(...args)
        startWindow()
      }
    }, waitMs)
  }
  const controlled = ((...args: A) => {
    if (timer === undefined) {
      if (leading) fn(...args)
      else lastArgs = args
      startWindow()
    } else lastArgs = args
  }) as Controlled<A>
  controlled.cancel = () => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
    lastArgs = undefined
  }
  controlled.flush = () => {
    if (lastArgs === undefined) return
    const args = lastArgs
    lastArgs = undefined
    fn(...args)
  }
  controlled.pending = () => lastArgs !== undefined
  return controlled
}
