/**
 * yeniden_dene — başarısız işlemi üstel geri çekilme + titreme (jitter) ile yeniden dener; iptal (AbortSignal),
 * toplam süre sınırı, "Retry-After" desteği ve hangi hatada yeniden deneneceği seçimi vardır.
 *
 * Kullanım:
 *   const veri = await retry(async (deneme, signal) => {
 *     const yanit = await fetch(url, { signal })
 *     if (!yanit.ok) throw new HttpError(yanit.status)
 *     return yanit.json()
 *   }, { retries: 4, shouldRetry: (e) => !(e instanceof HttpError) || isRetryableHttpStatus(e.status) })
 *
 * Bekleme: n. yeniden denemeden önce taban = min(maxDelayMs, minDelayMs · factor^(n−1)); 'full' titreme (varsayılan,
 * AWS önerisi) → 0…taban arası rastgele; 'equal' → taban/2 + rastgele(taban/2); 'none' → taban. Aynı anda düşen
 * istemcilerin sunucuya aynı anda yüklenmesini titreme önler.
 *
 * Sınırlar: Yeniden denenen işlem YAN ETKİSİZ (idempotent) olmalıdır; ödeme gibi işlemlerde idempotency anahtarı
 * kullanın. Varsayılan `shouldRetry` her hatayı (iptal hariç) yeniden dener; 4xx gibi kalıcı hataları siz ayırın.
 * Tükenince son hata `RetryError.cause` içindedir; `shouldRetry` false derse asıl hata olduğu gibi fırlatılır.
 *
 * Genişletme: Yeni seçenek `RetryOptions`'a eklenir ve `retry` döngüsünde tek yerde kullanılır; saat (`now`),
 * uyku (`sleep`) ve rastgelelik (`random`) dışarıdan verilebildiği için testte gerçek bekleme olmaz.
 */

export interface RetryOptions {
  /** İlk denemeden SONRAKİ en fazla deneme sayısı (varsayılan 3 → toplam 4 deneme). */
  retries?: number
  minDelayMs?: number
  maxDelayMs?: number
  factor?: number
  jitter?: 'full' | 'equal' | 'none'
  /** İlk denemeden itibaren toplam süre sınırı; aşılacaksa yeniden denenmez. */
  maxElapsedMs?: number
  /** Bu hata yeniden denensin mi? `attempt` başarısız olan denemenin numarasıdır (1'den başlar). */
  shouldRetry?: (error: unknown, attempt: number) => boolean
  /** Sunucu ne kadar beklenmesini istediyse (ms) onu döndürün (ör. 429 + Retry-After). */
  retryAfterMs?: (error: unknown) => number | undefined
  onRetry?: (info: { error: unknown; attempt: number; delayMs: number }) => void
  signal?: AbortSignal
  random?: () => number
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
  now?: () => number
}

/** Denemeler tükendiğinde fırlatılır; `cause` son hata, `errors` tüm hatalar. */
export class RetryError extends Error {
  override name = 'RetryError'
  readonly attempts: number
  readonly errors: readonly unknown[]

  constructor(message: string, attempts: number, errors: readonly unknown[]) {
    super(message, { cause: errors[errors.length - 1] })
    this.attempts = attempts
    this.errors = errors
  }
}

/** n. yeniden denemeden önce beklenecek süre (ms). `randomValue` 0 ≤ r < 1. */
export function backoffDelay(
  attempt: number,
  options: Pick<RetryOptions, 'minDelayMs' | 'maxDelayMs' | 'factor' | 'jitter'> = {},
  randomValue: number = Math.random(),
): number {
  const min = options.minDelayMs ?? 200
  const max = options.maxDelayMs ?? 30_000
  const base = Math.min(max, min * (options.factor ?? 2) ** Math.max(0, attempt - 1))
  const jitter = options.jitter ?? 'full'
  if (jitter === 'none') return base
  if (jitter === 'equal') return base / 2 + randomValue * (base / 2)
  return randomValue * base
}

/** Geçici olabilecek HTTP durumları: 408, 425, 429, 500, 502, 503, 504. */
export function isRetryableHttpStatus(status: number): boolean {
  return [408, 425, 429, 500, 502, 503, 504].includes(status)
}

/** "Retry-After" başlığını ms'ye çevirir: "120" → 120000; HTTP tarihi → kalan süre; okunamazsa undefined. */
export function parseRetryAfter(value: string | null | undefined, nowMs: number = Date.now()): number | undefined {
  const text = (value ?? '').trim()
  if (/^[0-9]+$/.test(text)) return Number(text) * 1000
  if (!/^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(text)) return undefined
  const at = Date.parse(text)
  return Number.isNaN(at) ? undefined : Math.max(0, at - nowMs)
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason as Error)
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(signal?.reason as Error)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')
}

/** `fn`'i başarılı olana, denemeler tükenene, süre dolana ya da iptal edilene kadar çalıştırır. */
export async function retry<T>(
  fn: (attempt: number, signal?: AbortSignal) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const retries = options.retries ?? 3
  const now = options.now ?? (() => Date.now())
  const random = options.random ?? Math.random
  const sleep = options.sleep ?? defaultSleep
  const shouldRetry = options.shouldRetry ?? ((error: unknown) => !isAbort(error))
  const started = now()
  const errors: unknown[] = []
  for (let attempt = 1; ; attempt++) {
    if (options.signal?.aborted) throw options.signal.reason as Error
    try {
      return await fn(attempt, options.signal)
    } catch (error) {
      errors.push(error)
      if (options.signal?.aborted) throw options.signal.reason as Error
      if (!shouldRetry(error, attempt)) throw error
      if (attempt > retries) throw new RetryError(`${attempt} denemenin hepsi başarısız oldu.`, attempt, errors)
      const requested = options.retryAfterMs?.(error)
      const delayMs = Math.min(options.maxDelayMs ?? 30_000, requested ?? backoffDelay(attempt, options, random()))
      if (options.maxElapsedMs !== undefined && now() - started + delayMs > options.maxElapsedMs) {
        throw new RetryError(`Süre sınırı (${options.maxElapsedMs} ms) doldu; ${attempt} deneme yapıldı.`, attempt, errors)
      }
      options.onRetry?.({ error, attempt, delayMs })
      await sleep(delayMs, options.signal)
    }
  }
}
