// zamanlama modülünün testi: vitest sahte saatleriyle (gerçek bekleme yok).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { debounce, sleep, throttle, TimeoutError, withTimeout } from '../src/zamanlama.ts'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('sleep ve withTimeout', () => {
  it('sleep süre dolunca çözülür, iptalde reddeder', async () => {
    let done = false
    const waiting = sleep(100).then(() => (done = true))
    await vi.advanceTimersByTimeAsync(99)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await waiting
    expect(done).toBe(true)
    const controller = new AbortController()
    const aborted = sleep(1000, { signal: controller.signal })
    controller.abort(new Error('vazgeç'))
    await expect(aborted).rejects.toThrow('vazgeç')
  })

  it('withTimeout zamanında biteni geçirir, bitmeyeni TimeoutError ile keser ve sinyali tetikler', async () => {
    await expect(withTimeout(Promise.resolve(5), 100)).resolves.toBe(5)
    let signalSeen: AbortSignal | undefined
    const slow = withTimeout((signal) => {
      signalSeen = signal
      return new Promise<string>(() => undefined)
    }, 50)
    const assertion = expect(slow).rejects.toBeInstanceOf(TimeoutError)
    await vi.advanceTimersByTimeAsync(50)
    await assertion
    expect(signalSeen?.aborted).toBe(true)
    await expect(withTimeout(Promise.reject(new Error('iç hata')), 100)).rejects.toThrow('iç hata')
  })
})

describe('debounce', () => {
  it('son çağrıdan sonra bir kez, son argümanlarla çalışır', () => {
    const calls: string[] = []
    const fn = debounce((q: string) => calls.push(q), 100)
    fn('a')
    vi.advanceTimersByTime(50)
    fn('ab')
    vi.advanceTimersByTime(99)
    expect(calls).toEqual([])
    vi.advanceTimersByTime(1)
    expect(calls).toEqual(['ab'])
  })

  it('leading, maxWait, cancel ve flush', () => {
    const calls: number[] = []
    const fn = debounce((n: number) => calls.push(n), 100, { leading: true, maxWaitMs: 250 })
    fn(1)
    expect(calls).toEqual([1])
    for (let i = 2; i <= 6; i++) {
      vi.advanceTimersByTime(60)
      fn(i)
    }
    // 250. ms'de maxWait zorla çalıştırdı (5); 300. ms'de bekleyen yoktu, leading ile 6 hemen çalıştı.
    expect(calls).toEqual([1, 5, 6])
    vi.advanceTimersByTime(100)
    expect(calls).toEqual([1, 5, 6])
    const other = debounce((n: number) => calls.push(n * 10), 100)
    other(7)
    expect(other.pending()).toBe(true)
    other.cancel()
    vi.advanceTimersByTime(200)
    other(8)
    other.flush()
    expect(calls).toEqual([1, 5, 6, 80])
  })
})

describe('throttle', () => {
  it('pencerede en çok bir kez; pencere sonunda son argümanla', () => {
    const calls: number[] = []
    const fn = throttle((n: number) => calls.push(n), 100)
    fn(1)
    fn(2)
    fn(3)
    expect(calls).toEqual([1])
    vi.advanceTimersByTime(100)
    expect(calls).toEqual([1, 3])
    vi.advanceTimersByTime(100)
    fn(4)
    expect(calls).toEqual([1, 3, 4])
    fn.cancel()
    fn(5)
    expect(calls).toEqual([1, 3, 4, 5])
  })
})
