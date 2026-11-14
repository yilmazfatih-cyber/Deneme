/**
 * Bayt-aralığı indirici + CDN yük devri. Her akışın CDN başına bir imzalı adresi vardır (sıralama sırasıyla).
 * Ağ hatası / 5xx / zaman aşımı (ilk bayt 8 sn, ya da 8 sn veri gelmemesi) → aynı aralık sıradaki CDN'den denenir,
 * başarısız düğüm 60 sn karantinaya alınır. Hepsi başarısız → AllCdnsFailedError.
 * Durağan kipte (GitHub Pages) adres açık kaynağın kendisidir ve `{range}` yer tutucusu taşımaz: aralık `Range`
 * başlığıyla istenir (köken CORS'ta Range'e izin vermelidir; ör. storage.googleapis.com).
 */
import { RANGE_PLACEHOLDER, rangeUrl, type StreamUrl } from '../../../../shared/playback'

export const CDN_TIMEOUT_MS = 8000
export const CDN_QUARANTINE_MS = 60_000

/** Uygulama genelinde düğüm sağlığı (önizleme ve tam oynatma aynı bilgiyi paylaşır). */
export class CdnHealth {
  private until = new Map<string, number>()
  quarantine(cdnId: string, ms = CDN_QUARANTINE_MS): void {
    this.until.set(cdnId, Date.now() + ms)
  }
  isQuarantined(cdnId: string): boolean {
    const t = this.until.get(cdnId)
    if (t === undefined) return false
    if (t <= Date.now()) {
      this.until.delete(cdnId)
      return false
    }
    return true
  }
  /** Karantinada olmayanlar manifest sırasıyla; hepsi karantinadaysa son çare olarak hepsi. */
  order<T extends { cdnId: string }>(urls: T[]): T[] {
    const healthy = urls.filter((u) => !this.isQuarantined(u.cdnId))
    return healthy.length ? healthy : urls.slice()
  }
  clear(): void {
    this.until.clear()
  }
  quarantined(): string[] {
    return [...this.until.keys()].filter((id) => this.isQuarantined(id))
  }
}

export const cdnHealth = new CdnHealth()

export class AllCdnsFailedError extends Error {
  readonly attempts: { cdnId: string; reason: string }[]
  constructor(attempts: { cdnId: string; reason: string }[]) {
    super('Hiçbir CDN düğümüne ulaşılamadı')
    this.name = 'AllCdnsFailedError'
    this.attempts = attempts
  }
}

export interface RangeResult {
  bytes: Uint8Array<ArrayBuffer>
  cdnId: string
  ttfbMs: number
  totalMs: number
  status: number
}

export interface FetchRangeOptions {
  signal: AbortSignal
  health?: CdnHealth
  timeoutMs?: number
  /** Bir düğümden diğerine geçildiğinde */
  onFailover?: (from: string, to: string, reason: string) => void
}

function abortError(): DOMException {
  return new DOMException('İstek iptal edildi', 'AbortError')
}

export function isAbortError(err: unknown): boolean {
  return (err as { name?: string } | null)?.name === 'AbortError'
}

/** İmzalı adres reddedildi (403 SIGNATURE_INVALID / URL_EXPIRED, 410 OBJECT_VERSION_STALE): manifest yenilenmeli. */
export class StaleUrlError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string) {
    super(`İmzalı adres geçersiz (${status} ${code})`)
    this.name = 'StaleUrlError'
    this.status = status
    this.code = code
  }
}

/** Başka düğümde de değişmeyecek istek hatası (400, 416): yük devri yapılmaz. */
export class RangeRequestError extends Error {
  readonly status: number
  constructor(status: number, code: string) {
    super(`Aralık isteği reddedildi (${status} ${code})`)
    this.name = 'RangeRequestError'
    this.status = status
  }
}

class AttemptError extends Error {
  readonly quarantine: boolean
  constructor(message: string, quarantine: boolean) {
    super(message)
    this.quarantine = quarantine
  }
}

async function errorCode(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: { code?: string } }
    return j.error?.code ?? ''
  } catch {
    return ''
  }
}

async function attempt(
  url: string,
  signal: AbortSignal,
  timeoutMs: number,
  range?: { start: number; end: number },
): Promise<Omit<RangeResult, 'cdnId'>> {
  const ctrl = new AbortController()
  let timedOut = false
  let timer = setTimeout(() => {
    timedOut = true
    ctrl.abort()
  }, timeoutMs)
  const onOuterAbort = () => ctrl.abort()
  signal.addEventListener('abort', onOuterAbort)
  const t0 = performance.now()
  try {
    let res: Response
    try {
      res = await fetch(url, {
        signal: ctrl.signal,
        credentials: 'same-origin',
        ...(range ? { headers: { range: `bytes=${range.start}-${range.end}` } } : {}),
      })
    } catch (err) {
      if (signal.aborted) throw abortError()
      throw new AttemptError(timedOut ? 'zaman aşımı (ilk bayt)' : `ağ hatası (${(err as Error).message})`, true)
    }
    const ttfbMs = performance.now() - t0
    if (!res.ok) {
      // Sözleşme (shared/playback.ts §4): 403/410 → manifesti yenile · 5xx → sıradaki CDN · 400/416 → hata
      if (res.status === 403 || res.status === 410) throw new StaleUrlError(res.status, await errorCode(res))
      if (res.status === 400 || res.status === 416) throw new RangeRequestError(res.status, await errorCode(res))
      const code = await errorCode(res)
      throw new AttemptError(`HTTP ${res.status}${code ? ` ${code}` : ''}`, res.status >= 500)
    }
    const expected = res.headers.get('content-encoding') ? 0 : Number(res.headers.get('content-length') ?? '0')
    const chunks: Uint8Array[] = []
    let total = 0
    if (res.body) {
      const reader = res.body.getReader()
      for (;;) {
        // her parça geldikçe izleme sayacını yenile (yavaş ama akan bağlantı kesilmez)
        clearTimeout(timer)
        timer = setTimeout(() => {
          timedOut = true
          ctrl.abort()
        }, timeoutMs)
        let r: ReadableStreamReadResult<Uint8Array>
        try {
          r = await reader.read()
        } catch (err) {
          if (signal.aborted) throw abortError()
          throw new AttemptError(timedOut ? 'zaman aşımı (veri durdu)' : `ağ hatası (${(err as Error).message})`, true)
        }
        if (r.done) break
        chunks.push(r.value)
        total += r.value.length
      }
    } else {
      const buf = new Uint8Array(await res.arrayBuffer())
      chunks.push(buf)
      total = buf.length
    }
    if (expected && total !== expected) throw new AttemptError(`eksik gövde (${total}/${expected})`, true)
    const bytes = new Uint8Array(total)
    let o = 0
    for (const c of chunks) {
      bytes.set(c, o)
      o += c.length
    }
    return { bytes, ttfbMs, totalMs: performance.now() - t0, status: res.status }
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', onOuterAbort)
  }
}

/** [start, end] aralığını (dahil) indirir; gerekirse sıradaki CDN'e geçer. */
export async function fetchRange(
  urls: StreamUrl[],
  start: number,
  end: number,
  o: FetchRangeOptions,
): Promise<RangeResult> {
  const health = o.health ?? cdnHealth
  const order = health.order(urls)
  const attempts: { cdnId: string; reason: string }[] = []
  for (let i = 0; i < order.length; i++) {
    const u = order[i]!
    if (o.signal.aborted) throw abortError()
    try {
      // İmzalı OCA adresi aralığı yolda taşır; doğrudan kaynak adresi (durağan kip) Range başlığıyla ister
      const templated = u.url.includes(RANGE_PLACEHOLDER)
      const r = await attempt(
        templated ? rangeUrl(u.url, start, end) : u.url,
        o.signal,
        o.timeoutMs ?? CDN_TIMEOUT_MS,
        templated ? undefined : { start, end },
      )
      if (r.bytes.length !== end - start + 1) throw new AttemptError(`beklenmeyen uzunluk ${r.bytes.length}`, false)
      return { ...r, cdnId: u.cdnId }
    } catch (err) {
      if (isAbortError(err) || err instanceof StaleUrlError || err instanceof RangeRequestError) throw err
      const reason = (err as Error).message
      attempts.push({ cdnId: u.cdnId, reason })
      if (!(err instanceof AttemptError) || err.quarantine) health.quarantine(u.cdnId)
      const next = order[i + 1]
      if (next) o.onFailover?.(u.cdnId, next.cdnId, reason)
    }
  }
  throw new AllCdnsFailedError(attempts)
}

/** Tam belge indirir (TTML); aynı yük devri kuralları. */
export async function fetchDocument(
  urls: { cdnId: string; url: string }[],
  o: FetchRangeOptions,
): Promise<{ text: string; cdnId: string; ms: number }> {
  const health = o.health ?? cdnHealth
  const order = health.order(urls)
  const attempts: { cdnId: string; reason: string }[] = []
  for (let i = 0; i < order.length; i++) {
    const u = order[i]!
    try {
      const r = await attempt(u.url, o.signal, o.timeoutMs ?? CDN_TIMEOUT_MS)
      return { text: new TextDecoder().decode(r.bytes), cdnId: u.cdnId, ms: r.totalMs }
    } catch (err) {
      if (isAbortError(err) || err instanceof StaleUrlError || err instanceof RangeRequestError) throw err
      const reason = (err as Error).message
      attempts.push({ cdnId: u.cdnId, reason })
      if (!(err instanceof AttemptError) || err.quarantine) health.quarantine(u.cdnId)
      const next = order[i + 1]
      if (next) o.onFailover?.(u.cdnId, next.cdnId, reason)
    }
  }
  throw new AllCdnsFailedError(attempts)
}
