/**
 * Araçların ağ katmanı: undici + EnvHttpProxyAgent (HTTPS_PROXY'ye uyar), her istekte zaman aşımı.
 * Testler `HttpGet` yerine sahte bir işlev verir; araçlar ağa doğrudan dokunmaz.
 */
import { EnvHttpProxyAgent, fetch } from 'undici'

export interface HttpResponse {
  status: number
  contentType: string | null
  text: string
}
export type HttpGet = (url: string, opts?: { timeoutMs?: number; method?: 'GET' | 'HEAD' }) => Promise<HttpResponse>

let agent: EnvHttpProxyAgent | null = null

export const httpGet: HttpGet = async (url, opts = {}) => {
  agent ??= new EnvHttpProxyAgent()
  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    dispatcher: agent,
    signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
    headers: { 'user-agent': 'TVplus-ContentTools/1.0', 'accept-language': 'tr-TR,tr;q=0.9,en;q=0.7' },
  })
  const text = opts.method === 'HEAD' ? '' : await res.text()
  return { status: res.status, contentType: res.headers.get('content-type'), text }
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Komut satırından doğrudan mı çalıştırıldı (içe aktarıldığında ana işlev çalışmasın diye). */
export function isMain(metaUrl: string): boolean {
  const arg = process.argv[1]
  if (!arg) return false
  try {
    return new URL(metaUrl).pathname.replace(/\.[cm]?[jt]s$/, '') === new URL(`file://${arg}`).pathname.replace(/\.[cm]?[jt]s$/, '')
  } catch {
    return false
  }
}
