/**
 * Concurrency helpers: a per-key serial queue (one chat at a time, chats in parallel) and a
 * TTL set used to deduplicate inbound message ids and to ignore the bot's own sent ids.
 */

export class KeyedQueue {
  private readonly tails = new Map<string, Promise<void>>()
  private pending = 0

  /** Tasks accepted but not yet settled (queued or running), across all keys. */
  get size(): number {
    return this.pending
  }

  /**
   * Runs `task` after every task previously queued under `key` has settled. Different keys do not
   * wait for each other. A rejected task rejects the returned promise but never blocks the queue.
   */
  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(key) ?? Promise.resolve()
    this.pending++
    const result = prev.then(() => task())
    const tail: Promise<void> = result.then(
      () => undefined,
      () => undefined,
    )
    const done = tail.finally(() => {
      this.pending--
      if (this.tails.get(key) === done) this.tails.delete(key)
    })
    this.tails.set(key, done)
    return result
  }
}

export class TtlSet {
  /** id → expiry; insertion order is also age order, so the oldest entry is always first. */
  private readonly entries = new Map<string, number>()

  constructor(
    private readonly ttlMs: number,
    private readonly max = 5000,
    private readonly now: () => number = Date.now,
  ) {}

  /** Entries that have not expired yet. */
  get size(): number {
    this.sweep()
    return this.entries.size
  }

  add(id: string): void {
    this.sweep()
    this.entries.delete(id)
    this.entries.set(id, this.now() + this.ttlMs)
    while (this.entries.size > this.max) {
      const oldest = this.entries.keys().next()
      if (oldest.done) break
      this.entries.delete(oldest.value)
    }
  }

  has(id: string): boolean {
    const expiry = this.entries.get(id)
    if (expiry === undefined) return false
    if (expiry <= this.now()) {
      this.entries.delete(id)
      return false
    }
    return true
  }

  /** True the first time an id is seen within the TTL; records it as seen. */
  firstSeen(id: string): boolean {
    if (this.has(id)) return false
    this.add(id)
    return true
  }

  private sweep(): void {
    const t = this.now()
    for (const [id, expiry] of this.entries) {
      if (expiry > t) break
      this.entries.delete(id)
    }
  }
}
