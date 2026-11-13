/**
 * Çerez zinciri biçimleri (Netflix NetflixId / SecureNetflixId) ve authURL (CSRF belirteci).
 * Saf işlevlerdir; anahtarlar çağırandan gelir (deriveKey(config, 'cookie') / 'authurl').
 *
 *   TvpId       = v=1&ct=<b64url(JSON {aid,sid,iat})>&pg=<profil GUID | boş>&ch=<b64url HMAC("v|ct|pg")>
 *   SecureTvpId = v=1&mac=<b64url HMAC(TvpId değeri)>&dt=<epoch ms>
 *   authURL     = c1.<epoch ms>.<b64url HMAC("sid|ts")>   — 24 saat geçerli
 */
import { hmacB64, safeEqual } from './crypto'

export interface SessionClaims {
  /** hesap kimliği */
  aid: string
  /** oturum kimliği (authURL buna bağlıdır) */
  sid: string
  /** oturum açılış anı (epoch ms) */
  iat: number
}

export interface DecodedSession {
  claims: SessionClaims
  /** profil GUID'i; profil seçilmediyse boş dizgi */
  pg: string
}

export const AUTH_URL_TTL_MS = 24 * 60 * 60 * 1000
/** İstemci saatinden gelen küçük ileri kaymaya tolerans. */
const AUTH_URL_SKEW_MS = 5 * 60 * 1000

export function encodeTvpId(key: Buffer, claims: SessionClaims, pg: string): string {
  const ct = Buffer.from(JSON.stringify({ aid: claims.aid, sid: claims.sid, iat: claims.iat })).toString('base64url')
  const ch = hmacB64(key, `1|${ct}|${pg}`)
  return new URLSearchParams({ v: '1', ct, pg, ch }).toString()
}

export function decodeTvpId(key: Buffer, value: string | undefined | null): DecodedSession | null {
  if (!value || value.length > 2048) return null
  let params: URLSearchParams
  try {
    params = new URLSearchParams(value)
  } catch {
    return null
  }
  const v = params.get('v')
  const ct = params.get('ct')
  const pg = params.get('pg') ?? ''
  const ch = params.get('ch')
  if (v !== '1' || !ct || !ch) return null
  if (!safeEqual(hmacB64(key, `${v}|${ct}|${pg}`), ch)) return null
  try {
    const raw: unknown = JSON.parse(Buffer.from(ct, 'base64url').toString('utf8'))
    if (!raw || typeof raw !== 'object') return null
    const { aid, sid, iat } = raw as Record<string, unknown>
    if (typeof aid !== 'string' || typeof sid !== 'string' || typeof iat !== 'number') return null
    if (pg && !/^[A-Z2-7]{24}$/.test(pg)) return null
    return { claims: { aid, sid, iat }, pg }
  } catch {
    return null
  }
}

export function encodeSecure(key: Buffer, tvpIdValue: string, now = Date.now()): string {
  return new URLSearchParams({ v: '1', mac: hmacB64(key, tvpIdValue), dt: String(now) }).toString()
}

export function verifySecure(key: Buffer, tvpIdValue: string | undefined | null, secureValue: string | undefined | null): boolean {
  if (!tvpIdValue || !secureValue || secureValue.length > 1024) return false
  const params = new URLSearchParams(secureValue)
  const mac = params.get('mac')
  if (params.get('v') !== '1' || !mac) return false
  return safeEqual(hmacB64(key, tvpIdValue), mac)
}

export function issueAuthURL(key: Buffer, sid: string, now = Date.now()): string {
  return `c1.${now}.${hmacB64(key, `${sid}|${now}`)}`
}

export function verifyAuthURL(key: Buffer, sid: string, token: string | undefined | null, now = Date.now()): boolean {
  if (!token || token.length > 256) return false
  const m = /^c1\.(\d{10,16})\.([A-Za-z0-9_-]+)$/.exec(token)
  if (!m) return false
  const ts = Number(m[1])
  if (!Number.isSafeInteger(ts)) return false
  if (now - ts > AUTH_URL_TTL_MS || ts - now > AUTH_URL_SKEW_MS) return false
  return safeEqual(hmacB64(key, `${sid}|${ts}`), m[2]!)
}
