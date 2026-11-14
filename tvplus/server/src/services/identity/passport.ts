/**
 * Pasaport: her istekte çerez zincirinden kimliği çözer (Netflix "Passport").
 *   tvpvdid  → cihaz kimliği (yoksa üretilir) → ESN
 *   TvpId    → hesap + oturum + profil GUID'i (HMAC ile korunur; bozuksa anonim + çerezler silinir)
 *   SecureTvpId → GET dışındaki isteklerde TvpId'nin MAC'i de doğrulanmalı (SameSite=Strict: CSRF kalkanı)
 *   tvpProfilesNewSession = '0' → bu tarayıcı oturumunda profil kapısı geçildi
 *
 * Sanal cihaz (cihaz vitrini): istek `x-tvplus-vd: <ad>` başlığı ya da `?vd=<ad>` sorgusu taşırsa ([a-z0-9]{1,12})
 * zincirin TÜM çerezleri `<ad>` ekiyle okunur ve yazılır (`TvpId__tv`, `tvpvdid__tv` …): tek tarayıcıda birbirinden
 * bağımsız birden çok cihaz. Geçersiz ad yok sayılır (eksiz zincir kullanılır).
 */
import { randomBytes } from 'node:crypto'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { COOKIES, HEADERS, VIRTUAL_DEVICE_PARAM } from '../../../../shared/constants'
import type { AccountRecord, Passport, ProfileRecord } from '../../kernel/context'
import { deriveEsn, parseEsn } from './esn'
import { decodeTvpId, encodeSecure, encodeTvpId, verifyAuthURL, verifySecure, type SessionClaims } from './session'

export interface IdentityKeys {
  cookie: Buffer
  authUrl: Buffer
  esn: Buffer
}

export interface IdentityLookup {
  getAccount(accountId: string): AccountRecord | null
  getProfile(guid: string): ProfileRecord | null
  /** Cihazın uzaktan çıkış anı (epoch ms); bu andan önce açılmış oturumlar geçersizdir */
  revokedAt(deviceId: string): number | null
}

const ONE_YEAR_SEC = 365 * 24 * 60 * 60
const DEVICE_RE = /^[0-9a-f]{32}$/
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/** İstek başına oturum bilgisi (authURL üretimi/doğrulaması için sid gerekir). */
const sessions = new WeakMap<FastifyRequest, SessionClaims>()
export const sessionOf = (req: FastifyRequest): SessionClaims | null => sessions.get(req) ?? null

const isHttps = (req: FastifyRequest) => req.protocol === 'https'

const VD_RE = /^[a-z0-9]{1,12}$/

/** İsteğin sanal cihaz adı (başlık önce, sonra `?vd=`); yoksa ya da geçersizse null. */
export function virtualDeviceOf(req: FastifyRequest): string | null {
  const header = headerValue(req, HEADERS.VIRTUAL_DEVICE)
  if (header !== null) return VD_RE.test(header) ? header : null
  const q = req.query
  const raw = q && typeof q === 'object' ? (q as Record<string, unknown>)[VIRTUAL_DEVICE_PARAM] : undefined
  const v = Array.isArray(raw) ? raw[0] : raw
  return typeof v === 'string' && VD_RE.test(v) ? v : null
}

export type CookieNames = { [K in keyof typeof COOKIES]: string }

/** Bu isteğin çerez adları: sanal cihazda `__<ad>` ekli. */
export function cookieNames(req: FastifyRequest): CookieNames {
  const vd = virtualDeviceOf(req)
  if (!vd) return { ...COOKIES }
  const suffix = `__${vd}`
  return {
    SESSION: COOKIES.SESSION + suffix,
    SECURE: COOKIES.SECURE + suffix,
    DEVICE: COOKIES.DEVICE + suffix,
    PROFILE_GATE: COOKIES.PROFILE_GATE + suffix,
  }
}

function headerValue(req: FastifyRequest, name: string): string | null {
  const v = req.headers[name]
  const s = Array.isArray(v) ? v[0] : v
  return typeof s === 'string' ? s : null
}

export function anonymousPassport(deviceId: string, esn: string): Passport {
  return { membershipStatus: 'ANONYMOUS', account: null, profile: null, esn, deviceId, authURLVerified: false }
}

export function clearSessionCookies(req: FastifyRequest, reply: FastifyReply): void {
  const names = cookieNames(req)
  reply.clearCookie(names.SESSION, { path: '/' })
  reply.clearCookie(names.SECURE, { path: '/' })
  reply.clearCookie(names.PROFILE_GATE, { path: '/' })
  sessions.delete(req)
}

/** TvpId + SecureTvpId (+ istenirse profil kapısı) çerezlerini yazar. */
export function writeSessionCookies(
  req: FastifyRequest,
  reply: FastifyReply,
  keys: IdentityKeys,
  claims: SessionClaims,
  profileGuid: string | null,
): void {
  const secure = isHttps(req)
  const tvpId = encodeTvpId(keys.cookie, claims, profileGuid ?? '')
  // Netflix NetflixId gibi değer URL kodlanır (v%3D1%26ct%3D…); okurken @fastify/cookie çözer.
  const encode = encodeURIComponent
  const names = cookieNames(req)
  reply.setCookie(names.SESSION, tvpId, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: ONE_YEAR_SEC,
    encode,
  })
  reply.setCookie(names.SECURE, encodeSecure(keys.cookie, tvpId), {
    encode,
    path: '/',
    httpOnly: true,
    sameSite: 'strict',
    secure,
    maxAge: ONE_YEAR_SEC,
  })
  sessions.set(req, claims)
}

export function setProfileGate(req: FastifyRequest, reply: FastifyReply, passed: boolean): void {
  if (passed) {
    // Oturum çerezi: Max-Age yok → tarayıcı kapanınca silinir, kapı yeniden görünür.
    reply.setCookie(cookieNames(req).PROFILE_GATE, '0', {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: isHttps(req),
    })
  } else reply.clearCookie(cookieNames(req).PROFILE_GATE, { path: '/' })
}

/** authURL'yi başlıktan ya da (gövde ayrıştırıldıktan sonra) form alanından doğrular. */
export function checkAuthURL(req: FastifyRequest, keys: IdentityKeys, token: string | null): boolean {
  const s = sessions.get(req)
  return !!s && verifyAuthURL(keys.authUrl, s.sid, token)
}

/** onRequest kancası: pasaportu çözer ve gerekiyorsa çerezleri düzeltir. */
export function resolvePassport(
  req: FastifyRequest,
  reply: FastifyReply,
  keys: IdentityKeys,
  lookup: IdentityLookup,
): Passport {
  const cookies = req.cookies ?? {}
  const names = cookieNames(req)

  // 1) Cihaz kimliği
  let deviceId = cookies[names.DEVICE]
  if (!deviceId || !DEVICE_RE.test(deviceId)) {
    deviceId = randomBytes(16).toString('hex')
    reply.setCookie(names.DEVICE, deviceId, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: isHttps(req),
      maxAge: ONE_YEAR_SEC,
    })
  }

  // 2) ESN: istemcinin yolladığı sunucunun türettiğiyle aynıysa onu, değilse türetileni kullan
  const derived = deriveEsn(keys.esn, deviceId, headerValue(req, 'user-agent'))
  const sent = headerValue(req, HEADERS.ESN)
  const esn = sent && sent === derived && parseEsn(sent) ? sent : derived

  // 3) Oturum çerezi
  const raw = cookies[names.SESSION]
  if (!raw) return anonymousPassport(deviceId, esn)
  const decoded = decodeTvpId(keys.cookie, raw)
  const account = decoded ? lookup.getAccount(decoded.claims.aid) : null
  const revoked = decoded ? lookup.revokedAt(deviceId) : null
  if (!decoded || !account || (revoked !== null && decoded.claims.iat <= revoked)) {
    // Kurcalanmış, tanınmayan ya da uzaktan kapatılmış oturum: anonim say ve zinciri temizle.
    clearSessionCookies(req, reply)
    return anonymousPassport(deviceId, esn)
  }

  // 4) Durum değiştiren isteklerde SecureTvpId MAC'i şart (Strict çerez: başka siteden gelen istek taşımaz)
  if (!SAFE_METHODS.has(req.method) && !verifySecure(keys.cookie, raw, cookies[names.SECURE])) {
    return anonymousPassport(deviceId, esn)
  }

  sessions.set(req, decoded.claims)

  // 5) Profil: çerezde GUID var, hesaba ait ve bu tarayıcı oturumunda kapı geçilmiş
  let profile: ProfileRecord | null = null
  if (decoded.pg && cookies[names.PROFILE_GATE] === '0') {
    const p = lookup.getProfile(decoded.pg)
    if (p && p.accountId === account.accountId) profile = p
  }
  if (profile) reply.header(HEADERS.PASSPORT_PROFILE, profile.guid)

  const passport: Passport = {
    membershipStatus: 'CURRENT_MEMBER',
    account,
    profile,
    esn,
    deviceId,
    authURLVerified: false,
  }
  passport.authURLVerified = checkAuthURL(req, keys, headerValue(req, HEADERS.AUTH_URL))
  return passport
}
