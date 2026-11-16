// yeniden_dene modülünün testi: sahte uyku/saat/rastgelelik ile gerçek bekleme yapılmaz.
import { describe, expect, it, vi } from 'vitest'
import { backoffDelay, isRetryableHttpStatus, parseRetryAfter, retry, RetryError } from '../src/yeniden_dene.ts'

function fakeClock() {
  let time = 0
  const delays: number[] = []
  return {
    delays,
    now: () => time,
    sleep: async (ms: number) => {
      delays.push(ms)
      time += ms
    },
  }
}

class HttpError extends Error {
  readonly status: number
  constructor(status: number) {
    super(`HTTP ${status}`)
    this.status = status
  }
}

describe('backoffDelay', () => {
  it('üstel büyür, tavanda durur ve titreme aralığında kalır', () => {
    const options = { minDelayMs: 100, maxDelayMs: 1000, factor: 2, jitter: 'none' as const }
    expect([1, 2, 3, 4, 5, 6].map((n) => backoffDelay(n, options))).toEqual([100, 200, 400, 800, 1000, 1000])
    expect(backoffDelay(3, { ...options, jitter: 'full' }, 0.5)).toBe(200)
    expect(backoffDelay(3, { ...options, jitter: 'equal' }, 0)).toBe(200)
    expect(backoffDelay(3, { ...options, jitter: 'equal' }, 0.999)).toBeLessThan(400)
    for (let i = 0; i < 100; i++) {
      const d = backoffDelay(4, { minDelayMs: 100, jitter: 'full' })
      expect(d).toBeGreaterThanOrEqual(0)
      expect(d).toBeLessThan(800)
    }
  })
})

describe('retry', () => {
  it('başarılı olana kadar dener ve beklemeleri sırayla uygular', async () => {
    const clock = fakeClock()
    const fn = vi.fn(async (attempt: number) => {
      if (attempt < 3) throw new Error(`geçici ${attempt}`)
      return 'tamam'
    })
    const result = await retry(fn, { ...clock, random: () => 0.5, minDelayMs: 100, jitter: 'full' })
    expect(result).toBe('tamam')
    expect(fn).toHaveBeenCalledTimes(3)
    expect(clock.delays).toEqual([50, 100])
  })

  it('denemeler tükenince RetryError (son hata cause) fırlatır', async () => {
    const clock = fakeClock()
    const error = await retry(
      async (attempt) => {
        throw new Error(`hata ${attempt}`)
      },
      { ...clock, retries: 2 },
    ).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(RetryError)
    expect((error as RetryError).attempts).toBe(3)
    expect(((error as RetryError).cause as Error).message).toBe('hata 3')
    expect((error as RetryError).errors).toHaveLength(3)
  })

  it('shouldRetry false derse asıl hatayı hemen fırlatır', async () => {
    const clock = fakeClock()
    const fn = vi.fn(async () => {
      throw new HttpError(404)
    })
    const shouldRetry = (e: unknown) => !(e instanceof HttpError) || isRetryableHttpStatus(e.status)
    await expect(retry(fn, { ...clock, shouldRetry })).rejects.toBeInstanceOf(HttpError)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('Retry-After süresine uyar ama maxDelayMs ile sınırlar; onRetry bilgi verir', async () => {
    const clock = fakeClock()
    const seen: number[] = []
    let calls = 0
    await retry(
      async () => {
        calls += 1
        if (calls < 3) throw new HttpError(429)
        return 1
      },
      {
        ...clock,
        maxDelayMs: 5000,
        retryAfterMs: () => (calls === 1 ? 2000 : 9000),
        onRetry: ({ delayMs }) => seen.push(delayMs),
      },
    )
    expect(seen).toEqual([2000, 5000])
  })

  it('toplam süre sınırı aşılacaksa durur', async () => {
    const clock = fakeClock()
    const error = await retry(
      async () => {
        throw new Error('x')
      },
      { ...clock, retries: 10, minDelayMs: 1000, jitter: 'none', maxElapsedMs: 3500 },
    ).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(RetryError)
    expect(clock.delays).toEqual([1000, 2000])
  })

  it('iptal sinyali beklemeyi keser ve sinyalin nedenini fırlatır', async () => {
    const controller = new AbortController()
    const promise = retry(
      async () => {
        throw new Error('x')
      },
      { signal: controller.signal, minDelayMs: 60_000, jitter: 'none' },
    )
    setTimeout(() => controller.abort(new Error('kullanıcı vazgeçti')), 10)
    await expect(promise).rejects.toThrow('kullanıcı vazgeçti')
  })

  it('Retry-After başlığı okunur', () => {
    expect(parseRetryAfter('120')).toBe(120_000)
    const now = Date.parse('2026-11-16T10:00:00Z')
    expect(parseRetryAfter('Mon, 16 Nov 2026 10:00:30 GMT', now)).toBe(30_000)
    expect(parseRetryAfter('yarın', now)).toBeUndefined()
    expect(parseRetryAfter(null)).toBeUndefined()
  })
})
