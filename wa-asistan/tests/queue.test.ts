import { describe, expect, it } from 'vitest'
import { KeyedQueue, TtlSet } from '../src/core/queue.js'

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0))

describe('KeyedQueue', () => {
  it('runs tasks of the same key one after another, in order', async () => {
    const q = new KeyedQueue()
    const events: string[] = []
    const a = deferred<string>()
    const b = deferred<string>()
    const pa = q.run('chat1', () => {
      events.push('a:start')
      return a.promise
    })
    const pb = q.run('chat1', () => {
      events.push('b:start')
      return b.promise
    })
    await tick()
    expect(events).toEqual(['a:start'])
    expect(q.size).toBe(2)
    a.resolve('A')
    await expect(pa).resolves.toBe('A')
    await tick()
    expect(events).toEqual(['a:start', 'b:start'])
    b.resolve('B')
    await expect(pb).resolves.toBe('B')
    await tick()
    expect(q.size).toBe(0)
  })

  it('runs different keys concurrently', async () => {
    const q = new KeyedQueue()
    const started: string[] = []
    const a = deferred<void>()
    const b = deferred<void>()
    const pa = q.run('chat1', () => {
      started.push('a')
      return a.promise
    })
    const pb = q.run('chat2', () => {
      started.push('b')
      return b.promise
    })
    await tick()
    expect(started).toEqual(['a', 'b'])
    b.resolve()
    a.resolve()
    await Promise.all([pa, pb])
  })

  it('isolates failures: a rejected task does not block the next one for that key', async () => {
    const q = new KeyedQueue()
    const boom = new Error('patladı')
    const first = q.run('k', () => Promise.reject(boom))
    const second = q.run('k', async () => 'ok')
    const third = q.run('k', () => {
      throw new Error('senkron')
    })
    const fourth = q.run('k', async () => 42)
    await expect(first).rejects.toBe(boom)
    await expect(second).resolves.toBe('ok')
    await expect(third).rejects.toThrow('senkron')
    await expect(fourth).resolves.toBe(42)
    await tick()
    expect(q.size).toBe(0)
  })

  it('keeps ordering across many queued tasks and interleaved keys', async () => {
    const q = new KeyedQueue()
    const log: string[] = []
    const tasks = []
    for (let i = 0; i < 5; i++) {
      for (const key of ['x', 'y']) {
        tasks.push(
          q.run(key, async () => {
            await tick()
            log.push(`${key}${i}`)
          }),
        )
      }
    }
    await Promise.all(tasks)
    expect(log.filter((e) => e.startsWith('x'))).toEqual(['x0', 'x1', 'x2', 'x3', 'x4'])
    expect(log.filter((e) => e.startsWith('y'))).toEqual(['y0', 'y1', 'y2', 'y3', 'y4'])
    expect(q.size).toBe(0)
  })
})

describe('TtlSet', () => {
  function clock(start = 0) {
    let t = start
    return { now: () => t, advance: (ms: number) => (t += ms) }
  }

  it('remembers ids until the ttl passes', () => {
    const c = clock()
    const set = new TtlSet(1000, 5000, c.now)
    set.add('m1')
    expect(set.has('m1')).toBe(true)
    expect(set.has('m2')).toBe(false)
    c.advance(999)
    expect(set.has('m1')).toBe(true)
    c.advance(1)
    expect(set.has('m1')).toBe(false)
    expect(set.size).toBe(0)
  })

  it('firstSeen is true once within the ttl and true again after expiry', () => {
    const c = clock(10_000)
    const set = new TtlSet(600_000, 5000, c.now)
    expect(set.firstSeen('chat:1')).toBe(true)
    expect(set.firstSeen('chat:1')).toBe(false)
    c.advance(599_999)
    expect(set.firstSeen('chat:1')).toBe(false)
    c.advance(1)
    expect(set.firstSeen('chat:1')).toBe(true)
  })

  it('re-adding refreshes the expiry', () => {
    const c = clock()
    const set = new TtlSet(100, 5000, c.now)
    set.add('a')
    c.advance(80)
    set.add('a')
    c.advance(80)
    expect(set.has('a')).toBe(true)
    expect(set.size).toBe(1)
  })

  it('drops the oldest entries when the cap is exceeded', () => {
    const c = clock()
    const set = new TtlSet(1_000_000, 3, c.now)
    set.add('a')
    c.advance(1)
    set.add('b')
    c.advance(1)
    set.add('c')
    c.advance(1)
    set.add('d')
    expect(set.size).toBe(3)
    expect(set.has('a')).toBe(false)
    expect(set.has('b')).toBe(true)
    expect(set.has('d')).toBe(true)
    set.add('b')
    set.add('e')
    expect(set.has('c')).toBe(false)
    expect(set.has('b')).toBe(true)
  })

  it('sweeps expired entries lazily and reports the live size', () => {
    const c = clock()
    const set = new TtlSet(100, 5000, c.now)
    set.add('a')
    c.advance(50)
    set.add('b')
    c.advance(60)
    expect(set.size).toBe(1)
    expect(set.has('a')).toBe(false)
    expect(set.has('b')).toBe(true)
    c.advance(100)
    expect(set.size).toBe(0)
  })

  it('uses Date.now by default', () => {
    const set = new TtlSet(60_000)
    expect(set.firstSeen('x')).toBe(true)
    expect(set.firstSeen('x')).toBe(false)
    expect(set.size).toBe(1)
  })
})
