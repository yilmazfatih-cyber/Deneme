/**
 * Köken (upstream) erişimi: uzak açık kaynaklara giden her istek buradan geçer.
 * HTTPS_PROXY'ye uyan undici EnvHttpProxyAgent kullanılır, her isteğe zaman aşımı konur,
 * `config.offline` iken ağa hiç çıkılmaz (OfflineError).
 */
import { EnvHttpProxyAgent, fetch } from 'undici'
import type { AppConfig } from '../../kernel/config'

export class OfflineError extends Error {
  constructor(what: string) {
    super(`Çevrimdışı kip: ${what} için ağa çıkılmadı`)
    this.name = 'OfflineError'
  }
}
export class UpstreamError extends Error {
  status: number | null
  constructor(message: string, status: number | null = null) {
    super(message)
    this.name = 'UpstreamError'
    this.status = status
  }
}

let agent: EnvHttpProxyAgent | null = null
function dispatcher(): EnvHttpProxyAgent {
  agent ??= new EnvHttpProxyAgent({ connectTimeout: 5000, keepAliveTimeout: 10_000 })
  return agent
}

export interface UpstreamResponse {
  status: number
  headers: Headers
  body: Buffer
}

export interface UpstreamOptions {
  /** dahil aralık */
  range?: { start: number; end: number }
  timeoutMs?: number
  /** beklenen en büyük gövde (bellek koruması) */
  maxBytes?: number
}

export async function upstreamGet(
  config: AppConfig,
  url: string,
  opts: UpstreamOptions = {},
): Promise<UpstreamResponse> {
  if (config.offline) throw new OfflineError(url)
  const headers: Record<string, string> = { 'user-agent': 'tvplus-oca/1.0', accept: '*/*' }
  if (opts.range) headers.range = `bytes=${opts.range.start}-${opts.range.end}`
  let res
  try {
    res = await fetch(url, {
      headers,
      dispatcher: dispatcher(),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
      redirect: 'follow',
    })
  } catch (err) {
    throw new UpstreamError(`Kökene ulaşılamadı: ${(err as Error).message}`)
  }
  if (res.status >= 400) {
    await res.body?.cancel().catch(() => undefined)
    throw new UpstreamError(`Köken ${res.status} döndü`, res.status)
  }
  const ab = await res.arrayBuffer().catch((err: unknown) => {
    throw new UpstreamError(`Köken gövdesi okunamadı: ${(err as Error).message}`)
  })
  const body = Buffer.from(ab)
  if (opts.maxBytes !== undefined && body.length > opts.maxBytes)
    throw new UpstreamError('Köken beklenenden büyük yanıt döndü')
  return { status: res.status, headers: res.headers as unknown as Headers, body }
}

/** Bir bayt aralığını getirir; köken 206 vermezse (tam gövde) aralığı kendisi keser. */
export async function upstreamRange(
  config: AppConfig,
  url: string,
  start: number,
  end: number,
  timeoutMs = 15_000,
): Promise<Buffer> {
  const res = await upstreamGet(config, url, { range: { start, end }, timeoutMs })
  const want = end - start + 1
  if (res.status === 206) {
    if (res.body.length !== want) throw new UpstreamError(`Köken ${res.body.length} bayt döndü, ${want} bekleniyordu`)
    return res.body
  }
  const slice = res.body.subarray(start, end + 1)
  if (slice.length !== want) throw new UpstreamError('Köken aralığı karşılayamadı')
  return slice
}

/** Dosya boyu: `Range: bytes=0-0` isteğinin content-range başlığından. */
export async function upstreamSize(config: AppConfig, url: string, timeoutMs = 6000): Promise<number> {
  const res = await upstreamGet(config, url, { range: { start: 0, end: 0 }, timeoutMs, maxBytes: 64 * 1024 * 1024 })
  const cr = res.headers.get('content-range')
  const m = cr ? /\/(\d+)\s*$/.exec(cr) : null
  if (m?.[1]) return Number(m[1])
  if (res.status === 200) return res.body.length
  throw new UpstreamError('Köken boyut bildirmedi')
}

/** Metin belgesi (MPD, altyazı) getirir. */
export async function upstreamText(config: AppConfig, url: string, timeoutMs = 8000): Promise<string> {
  const res = await upstreamGet(config, url, { timeoutMs, maxBytes: 8 * 1024 * 1024 })
  return res.body.toString('utf8')
}
