/**
 * Node zamanlayıcıları: `setTimeout(...).unref()` gibi çağrılar tarayıcıda sayı döndüğü için patlar; burada Node'un
 * `Timeout` nesnesine benzeyen bir sarmalayıcı döner. `setImmediate` MessageChannel ile gerçek bir makro görevdir:
 * uzun arka plan işleri (örnek üretimi, eğitim) arada gelen istekleri bekletmez.
 */

type Fn = (...args: unknown[]) => void

const native = {
  setTimeout: globalThis.setTimeout.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
  setInterval: globalThis.setInterval.bind(globalThis),
  clearInterval: globalThis.clearInterval.bind(globalThis),
}

export class Timeout {
  #id: number
  #repeat: boolean
  #fn: () => void
  #ms: number

  constructor(fn: () => void, ms: number, repeat: boolean) {
    this.#fn = fn
    this.#ms = ms
    this.#repeat = repeat
    this.#id = this.#start()
  }

  #start(): number {
    return (this.#repeat ? native.setInterval(this.#fn, this.#ms) : native.setTimeout(this.#fn, this.#ms)) as unknown as number
  }

  ref(): this {
    return this
  }
  unref(): this {
    return this
  }
  hasRef(): boolean {
    return true
  }
  refresh(): this {
    this.close()
    this.#id = this.#start()
    return this
  }
  close(): this {
    if (this.#repeat) native.clearInterval(this.#id as unknown as Parameters<typeof native.clearInterval>[0])
    else native.clearTimeout(this.#id as unknown as Parameters<typeof native.clearTimeout>[0])
    return this
  }
  [Symbol.toPrimitive](): number {
    return this.#id
  }
}

export function setTimeout(fn: Fn, ms?: number, ...args: unknown[]): Timeout {
  return new Timeout(() => fn(...args), Math.max(0, Number(ms) || 0), false)
}

export function setInterval(fn: Fn, ms?: number, ...args: unknown[]): Timeout {
  return new Timeout(() => fn(...args), Math.max(1, Number(ms) || 0), true)
}

export function clearTimeout(t: unknown): void {
  if (t instanceof Timeout) t.close()
  else if (typeof t === 'number') native.clearTimeout(t as unknown as Parameters<typeof native.clearTimeout>[0])
}

export const clearInterval = clearTimeout

/* ───────────── setImmediate ───────────── */

export class Immediate {
  cancelled = false
  fn: () => void
  constructor(fn: () => void) {
    this.fn = fn
  }
  ref(): this {
    return this
  }
  unref(): this {
    return this
  }
  hasRef(): boolean {
    return true
  }
}

let queue: Immediate[] = []
let channel: MessageChannel | null = null
let posted = false

function flush(): void {
  posted = false
  const batch = queue
  queue = []
  for (const im of batch) {
    if (im.cancelled) continue
    try {
      im.fn()
    } catch (err) {
      // Node'da yakalanmayan hata süreci düşürür; burada günlüğe yazıp sürdürürüz.
      console.error('setImmediate içinde yakalanmayan hata', err)
    }
  }
}

/**
 * Tarayıcı MessageChannel görevlerini zamanlayıcılardan önce çalıştırabilir: art arda setImmediate ile ilerleyen
 * uzun bir iş (örnek üretimi, gömme kodlama) süresi dolmuş zamanlayıcıları (ör. deponun 400 ms'lik kaydı) aç bırakır.
 * Bu yüzden en geç TIMER_TURN_MS'de bir sıradaki tur setTimeout(0) ile kurulur ve bekleyen zamanlayıcılar araya girer.
 */
const TIMER_TURN_MS = 25
let lastTimerTurn = 0

function post(): void {
  if (posted) return
  posted = true
  const now = performance.now()
  if (now - lastTimerTurn > TIMER_TURN_MS) {
    native.setTimeout(() => {
      lastTimerTurn = performance.now()
      flush()
    }, 0)
    return
  }
  if (typeof MessageChannel === 'function') {
    if (!channel) {
      channel = new MessageChannel()
      channel.port1.onmessage = flush
    }
    channel.port2.postMessage(0)
  } else native.setTimeout(flush, 0)
}

export function setImmediate(fn: Fn, ...args: unknown[]): Immediate {
  const im = new Immediate(() => fn(...args))
  queue.push(im)
  post()
  return im
}

export function clearImmediate(im: unknown): void {
  if (im instanceof Immediate) im.cancelled = true
}

/* ───────────── timers/promises ───────────── */

interface AbortOpts {
  signal?: AbortSignal
}

function abortError(signal: AbortSignal): Error {
  const reason: unknown = signal.reason
  if (reason instanceof Error) return reason
  const e = new Error('The operation was aborted')
  e.name = 'AbortError'
  return e
}

export const promises = {
  setTimeout<T = void>(ms?: number, value?: T, opts: AbortOpts = {}): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const { signal } = opts
      if (signal?.aborted) return reject(abortError(signal))
      const t = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort)
        resolve(value as T)
      }, ms)
      const onAbort = (): void => {
        clearTimeout(t)
        reject(abortError(signal!))
      }
      signal?.addEventListener('abort', onAbort, { once: true })
    })
  },
  setImmediate<T = void>(value?: T, opts: AbortOpts = {}): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const { signal } = opts
      if (signal?.aborted) return reject(abortError(signal))
      setImmediate(() => resolve(value as T))
    })
  },
}

/** Worker'ın küresel zamanlayıcılarını Node biçimlileriyle değiştirir. */
export function installTimers(scope: Record<string, unknown>): void {
  scope.setTimeout = setTimeout
  scope.setInterval = setInterval
  scope.clearTimeout = clearTimeout
  scope.clearInterval = clearInterval
  scope.setImmediate = setImmediate
  scope.clearImmediate = clearImmediate
}

export default { setTimeout, setInterval, clearTimeout, clearInterval, setImmediate, clearImmediate, promises }
