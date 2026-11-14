/**
 * `node:stream` karşılığı (küçük): `Readable` (+ `Readable.from`), `Transform`, `PassThrough`, `pipeline`.
 * Yalnız sunucu kodunun kullandığı akış biçimleri: `for await` ile tüketme, gövdeyi akış olarak alma, gzip açma.
 */
import { EventEmitter } from './events'

type Chunk = unknown

export class Readable extends EventEmitter {
  readable = true
  destroyed = false
  readableEnded = false
  #queue: Chunk[] = []
  #ended = false
  #error: Error | null = null
  #waiters: (() => void)[] = []
  #flowing = false
  #read: (() => void) | undefined

  constructor(opts: { read?: (this: Readable) => void; objectMode?: boolean } = {}) {
    super()
    this.#read = opts.read?.bind(this)
  }

  #wake(): void {
    const w = this.#waiters
    this.#waiters = []
    for (const fn of w) fn()
  }

  push(chunk: Chunk | null): boolean {
    if (this.#ended) return false
    if (chunk === null) this.#ended = true
    else this.#queue.push(chunk)
    this.#wake()
    return true
  }

  destroy(err?: Error): this {
    if (this.destroyed) return this
    this.destroyed = true
    if (err) this.#error = err
    this.#ended = true
    this.#queue = []
    this.#wake()
    queueMicrotask(() => {
      if (err && this.listenerCount('error')) this.emit('error', err)
      this.emit('close')
    })
    return this
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<Chunk> {
    for (;;) {
      if (this.#queue.length) {
        yield this.#queue.shift()
        continue
      }
      if (this.#error) throw this.#error
      if (this.#ended) {
        if (!this.readableEnded) {
          this.readableEnded = true
          queueMicrotask(() => this.emit('end'))
        }
        return
      }
      this.#read?.()
      if (this.#queue.length || this.#ended) continue
      await new Promise<void>((r) => this.#waiters.push(r))
    }
  }

  /** Akan kip: 'data' olaylarıyla tüketir. */
  resume(): this {
    if (this.#flowing) return this
    this.#flowing = true
    void (async () => {
      try {
        for await (const c of this) this.emit('data', c)
      } catch (err) {
        if (this.listenerCount('error')) this.emit('error', err)
      }
    })()
    return this
  }

  pause(): this {
    return this
  }

  override on(event: string | symbol, fn: (...args: unknown[]) => void): this {
    super.on(event, fn)
    if (event === 'data') this.resume()
    return this
  }

  pipe<T extends Writable>(dest: T): T {
    void (async () => {
      try {
        for await (const c of this) dest.write(c)
        dest.end()
      } catch (err) {
        dest.destroy(err as Error)
      }
    })()
    return dest
  }

  setEncoding(): this {
    return this
  }

  static from(iterable: Iterable<Chunk> | AsyncIterable<Chunk>): Readable {
    const r = new Readable()
    void (async () => {
      try {
        for await (const c of iterable as AsyncIterable<Chunk>) {
          if (r.destroyed) return
          r.push(c)
        }
        r.push(null)
      } catch (err) {
        r.destroy(err instanceof Error ? err : new Error(String(err)))
      }
    })()
    return r
  }
}

export interface Writable {
  write(chunk: Chunk): boolean
  end(chunk?: Chunk): void
  destroy(err?: Error): unknown
}

type TransformFn = (this: Transform, chunk: Chunk, enc: string, cb: (err?: Error | null, out?: Chunk) => void) => void

/** Yazılabilir + okunabilir akış: yazılan parçalar `_transform` ile dönüştürülüp okunur. */
export class Transform extends Readable implements Writable {
  writable = true
  #transform: TransformFn | undefined
  #flush: ((cb: (err?: Error | null, out?: Chunk) => void) => void) | undefined

  constructor(
    opts: {
      transform?: TransformFn
      flush?: (this: Transform, cb: (err?: Error | null, out?: Chunk) => void) => void
      objectMode?: boolean
    } = {},
  ) {
    super()
    this.#transform = opts.transform
    this.#flush = opts.flush?.bind(this)
  }

  _transform(chunk: Chunk, enc: string, cb: (err?: Error | null, out?: Chunk) => void): void {
    if (this.#transform) this.#transform.call(this, chunk, enc, cb)
    else cb(null, chunk)
  }

  write(chunk: Chunk): boolean {
    this._transform(chunk, 'buffer', (err, out) => {
      if (err) this.destroy(err)
      else if (out !== undefined && out !== null) this.push(out)
    })
    return true
  }

  end(chunk?: Chunk): void {
    if (chunk !== undefined && chunk !== null) this.write(chunk)
    this.writable = false
    const done = (err?: Error | null, out?: Chunk) => {
      if (err) return void this.destroy(err)
      if (out !== undefined && out !== null) this.push(out)
      this.push(null)
      this.emit('finish')
    }
    if (this.#flush) this.#flush(done)
    else this._final(done)
  }

  _final(cb: (err?: Error | null) => void): void {
    cb()
  }
}

export class PassThrough extends Transform {}

type Stage = Readable | Transform | Writable | AsyncIterable<Chunk>

/** pipeline(kaynak, ...dönüştürücüler/hedef, geri çağırma) — yalnız doğrusal zincir. */
export function pipeline(...args: unknown[]): unknown {
  const cb = typeof args[args.length - 1] === 'function' ? (args.pop() as (err: Error | null) => void) : null
  const stages = args as Stage[]
  const run = async (): Promise<void> => {
    let src = stages[0] as AsyncIterable<Chunk>
    for (let i = 1; i < stages.length; i++) {
      const dest = stages[i] as Writable & Partial<AsyncIterable<Chunk>>
      const from = src
      try {
        for await (const c of from) dest.write(c)
        dest.end()
      } catch (err) {
        dest.destroy(err as Error)
        throw err
      }
      if (i < stages.length - 1) src = dest as AsyncIterable<Chunk>
    }
  }
  const p = run()
  if (cb) {
    p.then(
      () => cb(null),
      (err: unknown) => cb(err instanceof Error ? err : new Error(String(err))),
    )
    return stages[stages.length - 1]
  }
  return p
}

export const promises = { pipeline: (...args: unknown[]) => pipeline(...args) as Promise<void> }

export class Stream extends EventEmitter {}
export class Duplex extends Transform {}

export default { Readable, Transform, PassThrough, Duplex, Stream, pipeline, promises }
