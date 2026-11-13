/**
 * Mixpanel Raw Event Export API çekicisi (docs/MIXPANEL.md "API ile çekme").
 *
 *   GET https://<bölge>/api/2.0/export?project_id=…&from_date=YYYY-MM-DD&to_date=YYYY-MM-DD
 *   Authorization: Basic base64(<servis hesabı kullanıcı adı>:<gizli>)      Accept-Encoding: gzip
 *   bölge: us → data.mixpanel.com · eu → data-eu.mixpanel.com · in → data-in.mixpanel.com
 *   yanıt: JSONL (satır başına bir olay), akış olarak okunur.
 *
 * Aralık `chunkDays` günlük parçalara bölünür ve sırayla çekilir (Mixpanel: saatte 60 sorgu, saniyede 3 sorgu).
 * 429 ve 5xx yanıtlarında ve ağ hatalarında üstel bekleme ile yeniden denenir (Retry-After varsa ona uyulur).
 * Kimlik bilgileri yalnız başlıkta gider; hiçbir hata metnine, günlüğe ya da yanıta girmez.
 * Dış istek undici + EnvHttpProxyAgent ile yapılır (HTTPS_PROXY / NO_PROXY'ye uyar).
 */
import { setTimeout as delay } from 'node:timers/promises'
import { EnvHttpProxyAgent, fetch, type Dispatcher } from 'undici'

export const EXPORT_HOSTS = {
  us: 'https://data.mixpanel.com',
  eu: 'https://data-eu.mixpanel.com',
  in: 'https://data-in.mixpanel.com',
} as const
export type MixpanelRegion = keyof typeof EXPORT_HOSTS

export class MixpanelPullError extends Error {
  /** Sunucunun dönmesi gereken durum kodu */
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'MixpanelPullError'
    this.status = status
    this.code = code
  }
}

export interface PullOptions {
  from: string
  to: string
  region: MixpanelRegion
  username: string
  secret: string
  projectId: string
  /** Testler için: bölge adresinin yerine (ör. http://127.0.0.1:port) */
  baseUrl?: string | null
  dispatcher?: Dispatcher
  /** Parça başına en çok deneme (varsayılan 5) */
  maxAttempts?: number
  /** İlk bekleme (ms, varsayılan 2000); her denemede iki katı, en çok 60 sn */
  backoffMs?: number
  /** Parça büyüklüğü (gün, varsayılan 7) */
  chunkDays?: number
  sleep?: (ms: number) => Promise<void>
  signal?: AbortSignal
  /** Her deneme sonrası (gözlem/test) */
  onAttempt?: (info: { from: string; to: string; attempt: number; status: number | null }) => void
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 86_400_000
export const MAX_PULL_DAYS = 366

/** 'YYYY-MM-DD' aralığını doğrular; geçersizse Türkçe hata metni. */
export function validateRange(from: unknown, to: unknown): string | null {
  if (typeof from !== 'string' || typeof to !== 'string' || !DATE_RE.test(from) || !DATE_RE.test(to))
    return "from ve to 'YYYY-MM-DD' biçiminde olmalı."
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b) || new Date(a).toISOString().slice(0, 10) !== from)
    return 'Geçersiz tarih.'
  if (new Date(b).toISOString().slice(0, 10) !== to) return 'Geçersiz tarih.'
  if (b < a) return 'to, from tarihinden önce olamaz.'
  if ((b - a) / DAY_MS + 1 > MAX_PULL_DAYS) return `Aralık en çok ${MAX_PULL_DAYS} gün olabilir.`
  return null
}

/** Aralığı en çok `days` günlük parçalara böler (iki uç dahil). */
export function chunkRange(from: string, to: string, days: number): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = []
  let a = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)
  while (a <= end) {
    const b = Math.min(end, a + (Math.max(1, days) - 1) * DAY_MS)
    out.push({ from: new Date(a).toISOString().slice(0, 10), to: new Date(b).toISOString().slice(0, 10) })
    a = b + DAY_MS
  }
  return out
}

export function exportUrl(base: string, projectId: string, from: string, to: string): string {
  const u = new URL('/api/2.0/export', base)
  u.searchParams.set('project_id', projectId)
  u.searchParams.set('from_date', from)
  u.searchParams.set('to_date', to)
  return u.toString()
}

let agent: EnvHttpProxyAgent | null = null
const defaultDispatcher = () =>
  (agent ??= new EnvHttpProxyAgent({ connectTimeout: 10_000, headersTimeout: 120_000, bodyTimeout: 300_000 }))

function retryAfterMs(h: string | null): number | null {
  if (!h) return null
  const s = Number(h)
  if (Number.isFinite(s) && s >= 0) return Math.min(300_000, s * 1000)
  const t = Date.parse(h)
  return Number.isFinite(t) ? Math.max(0, Math.min(300_000, t - Date.now())) : null
}

/** Hata metninden olası gizli değerleri ayıklar ve kısaltır. */
function scrub(text: string, secrets: string[]): string {
  let t = text.replace(/\s+/g, ' ').trim().slice(0, 200)
  for (const s of secrets) if (s) t = t.split(s).join('***')
  return t
}

/**
 * Tüm aralığın JSONL baytlarını sırayla verir (parçalar arasında satır sonu eklenir).
 * Durum hataları MixpanelPullError olarak fırlatılır.
 */
export async function* pullExport(opts: PullOptions): AsyncGenerator<Uint8Array> {
  const base = opts.baseUrl || EXPORT_HOSTS[opts.region]
  const auth = `Basic ${Buffer.from(`${opts.username}:${opts.secret}`).toString('base64')}`
  const sleep = opts.sleep ?? ((ms: number) => delay(ms, undefined, { signal: opts.signal }))
  const maxAttempts = opts.maxAttempts ?? 5
  const backoff = opts.backoffMs ?? 2000
  const secrets = [opts.secret, opts.username, auth]
  for (const range of chunkRange(opts.from, opts.to, opts.chunkDays ?? 7)) {
    const url = exportUrl(base, opts.projectId, range.from, range.to)
    let attempt = 0
    for (;;) {
      attempt++
      let res: Awaited<ReturnType<typeof fetch>> | null = null
      let netError: string | null = null
      try {
        res = await fetch(url, {
          headers: { authorization: auth, accept: 'text/plain', 'accept-encoding': 'gzip' },
          dispatcher: opts.dispatcher ?? defaultDispatcher(),
          signal: opts.signal,
        })
      } catch (err) {
        if (opts.signal?.aborted) throw err
        netError = scrub((err as Error).message, secrets)
      }
      opts.onAttempt?.({ ...range, attempt, status: res?.status ?? null })
      const status = res?.status ?? 0
      if (res && status >= 200 && status < 300) {
        if (res.body) for await (const chunk of res.body) yield chunk
        yield new Uint8Array([0x0a])
        break
      }
      const retryable = netError !== null || status === 429 || status >= 500
      const text = res ? await res.text().catch(() => '') : ''
      if (!retryable) {
        if (status === 401 || status === 403)
          throw new MixpanelPullError(502, 'MIXPANEL_AUTH', `Mixpanel kimlik bilgilerini reddetti (${status}).`)
        throw new MixpanelPullError(
          502,
          'MIXPANEL_ERROR',
          `Mixpanel isteği reddetti (${status})${text ? `: ${scrub(text, secrets)}` : ''}`,
        )
      }
      if (attempt >= maxAttempts)
        throw new MixpanelPullError(
          status === 429 ? 429 : 502,
          status === 429 ? 'MIXPANEL_RATE_LIMITED' : 'MIXPANEL_UNAVAILABLE',
          netError
            ? `Mixpanel'e ulaşılamadı (${attempt} deneme): ${netError}`
            : `Mixpanel ${status} döndü (${attempt} deneme); daha sonra yeniden deneyin.`,
        )
      const wait =
        retryAfterMs(res?.headers.get('retry-after') ?? null) ?? Math.min(60_000, backoff * 2 ** (attempt - 1))
      await sleep(wait)
    }
  }
}
