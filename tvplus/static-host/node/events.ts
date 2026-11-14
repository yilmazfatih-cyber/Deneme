/**
 * Küçük `EventEmitter` (`node:events` karşılığı): akış katmanı ve ham yanıt nesnesi bunu kullanır.
 */

export type Listener = (...args: unknown[]) => void

export class EventEmitter {
  #listeners = new Map<string | symbol, Listener[]>()

  on(event: string | symbol, fn: Listener): this {
    const list = this.#listeners.get(event)
    if (list) list.push(fn)
    else this.#listeners.set(event, [fn])
    return this
  }

  addListener(event: string | symbol, fn: Listener): this {
    return this.on(event, fn)
  }

  prependListener(event: string | symbol, fn: Listener): this {
    const list = this.#listeners.get(event)
    if (list) list.unshift(fn)
    else this.#listeners.set(event, [fn])
    return this
  }

  once(event: string | symbol, fn: Listener): this {
    const wrapped: Listener = (...args) => {
      this.off(event, wrapped)
      fn(...args)
    }
    ;(wrapped as Listener & { original?: Listener }).original = fn
    return this.on(event, wrapped)
  }

  off(event: string | symbol, fn: Listener): this {
    const list = this.#listeners.get(event)
    if (!list) return this
    const i = list.findIndex((l) => l === fn || (l as Listener & { original?: Listener }).original === fn)
    if (i >= 0) list.splice(i, 1)
    if (!list.length) this.#listeners.delete(event)
    return this
  }

  removeListener(event: string | symbol, fn: Listener): this {
    return this.off(event, fn)
  }

  removeAllListeners(event?: string | symbol): this {
    if (event === undefined) this.#listeners.clear()
    else this.#listeners.delete(event)
    return this
  }

  emit(event: string | symbol, ...args: unknown[]): boolean {
    const list = this.#listeners.get(event)
    if (!list || !list.length) {
      if (event === 'error') throw args[0] instanceof Error ? args[0] : new Error(String(args[0]))
      return false
    }
    for (const fn of [...list]) fn(...args)
    return true
  }

  listenerCount(event: string | symbol): number {
    return this.#listeners.get(event)?.length ?? 0
  }

  setMaxListeners(): this {
    return this
  }
}

export function once(emitter: EventEmitter, event: string): Promise<unknown[]> {
  return new Promise((resolve) => emitter.once(event, (...args) => resolve(args)))
}

export default EventEmitter
