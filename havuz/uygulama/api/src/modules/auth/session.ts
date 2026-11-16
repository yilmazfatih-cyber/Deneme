/**
 * Oturum: belirteç üretimi, çerez, isteği yapan kullanıcının çözülmesi ve korumalı uçların kapısı.
 *
 *  - Belirteç: 32 bayt rastgele (base64url). Veritabanında yalnız SHA-256 özeti durur.
 *  - Çerez: `HttpOnly; SameSite=Lax; Path=/`, üretimde `Secure` + `__Host-` öneki (`__Host-sid`).
 *  - `Authorization: Bearer <belirteç>` de kabul edilir (başka alan adındaki istemci; çerez gerekmez).
 *  - Kayan süre: SESSION_TTL_DAYS (30 gün). Kalan süre yarının altına inince süre yenilenir, çerez tazelenir.
 *
 * Korumalı her işleyici ŞÖYLE başlar:  `const { user } = requireUser(c)`  (yönetici için `requireAdmin(c)`).
 * Bu kapı unutulursa uç herkese açık olur; kural testi (test/rules.test.ts) korumasız uçları listeyle denetler.
 *
 * Genişletme: yeni bir rol kapısı gerekiyorsa `requireAdmin` örneğiyle burada yazın ve olumsuz testini ekleyin.
 */
import { AppError, HEADERS, SESSION_COOKIE } from '@uygulama/shared'
import type { Context, MiddlewareHandler } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import type { Config } from '../../config.ts'
import type { AppContext } from '../../context.ts'
import type { AppEnv, AuthSession, AuthState, AuthUser } from '../../http/types.ts'
import { addDays, hashToken, isTokenFormat, newId, newToken } from '../../lib/random.ts'
import { deleteSession, extendSession, findSessionByTokenHash, insertSession, touchSession } from './sessionRepo.ts'
import { toAuthUser, touchUserLastSeen } from './userRepo.ts'

/** Son kullanım zamanı en fazla bu sıklıkta yazılır (her istekte yazmamak için). */
const TOUCH_INTERVAL_MS = 5 * 60_000

export function sessionCookieName(config: Config): string {
  return config.isProduction ? `__Host-${SESSION_COOKIE}` : SESSION_COOKIE
}

function writeCookie(c: Context<AppEnv>, config: Config, value: string, maxAge: number): void {
  const base = { httpOnly: true, sameSite: 'Lax', path: '/', maxAge } as const
  if (config.isProduction) setCookie(c, SESSION_COOKIE, value, { ...base, secure: true, prefix: 'host' })
  else setCookie(c, SESSION_COOKIE, value, base)
}

export function setSessionCookie(c: Context<AppEnv>, config: Config, token: string, expiresAt: Date, now: Date): void {
  writeCookie(c, config, token, Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000)))
}

export function clearSessionCookie(c: Context<AppEnv>, config: Config): void {
  writeCookie(c, config, '', 0)
}

/** İstek `X-Auth-Mode: token` ile mi geldi? (Giriş/kayıt yanıtında belirteç gövdede döner, çerez yazılmaz.) */
export function wantsTokenMode(c: Context<AppEnv>): boolean {
  return /^token$/i.test(c.req.header(HEADERS.authMode) ?? '')
}

function readCredential(c: Context<AppEnv>, config: Config): { token: string; method: AuthState['method'] } | null {
  const authorization = c.req.header('authorization')
  if (authorization !== undefined) {
    const match = /^Bearer\s+(\S+)\s*$/i.exec(authorization)
    return { token: match?.[1] ?? '', method: 'bearer' }
  }
  const cookie = getCookie(c, SESSION_COOKIE, config.isProduction ? 'host' : undefined)
  return cookie ? { token: cookie, method: 'cookie' } : null
}

export type ResolvedSession =
  | {
      readonly status: 'ok'
      readonly user: AuthUser
      readonly session: AuthSession
      readonly renewedUntil: Date | null
    }
  | { readonly status: 'invalid' | 'expired' | 'disabled' }

/** Belirteci oturuma çevirir; süresi dolmuşsa siler, yarı ömrü geçmişse uzatır. */
export function resolveSession(ctx: AppContext, token: string): ResolvedSession {
  if (!isTokenFormat(token)) return { status: 'invalid' }
  const found = findSessionByTokenHash(ctx.db, hashToken(token))
  if (!found) return { status: 'invalid' }
  const now = ctx.clock.now()
  const nowIso = now.toISOString()
  if (found.session.expires_at <= nowIso) {
    deleteSession(ctx.db, found.session.id)
    return { status: 'expired' }
  }
  const user = toAuthUser(found.user)
  if (user.disabled) return { status: 'disabled' }
  const ttlMs = ctx.config.sessionTtlDays * 24 * 60 * 60_000
  let expiresAt = found.session.expires_at
  let renewedUntil: Date | null = null
  if (Date.parse(found.session.expires_at) - now.getTime() < ttlMs / 2) {
    const until = addDays(now, ctx.config.sessionTtlDays)
    renewedUntil = until
    expiresAt = until.toISOString()
    ctx.db.transaction(() => {
      extendSession(ctx.db, found.session.id, until.toISOString(), nowIso)
      touchUserLastSeen(ctx.db, user.id, nowIso)
    })
  } else if (now.getTime() - Date.parse(found.session.last_used_at) > TOUCH_INTERVAL_MS) {
    ctx.db.transaction(() => {
      touchSession(ctx.db, found.session.id, nowIso)
      touchUserLastSeen(ctx.db, user.id, nowIso)
    })
  }
  return { status: 'ok', user, session: { id: found.session.id, expiresAt }, renewedUntil }
}

/** /api altındaki her istekte çalışır: oturumu çözer, `c.get('auth')`'u doldurur. Kimse yoksa geçer. */
export function sessionMiddleware(ctx: AppContext): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const credential = readCredential(c, ctx.config)
    if (credential) {
      const resolved = resolveSession(ctx, credential.token)
      if (resolved.status === 'ok') {
        c.set('auth', { user: resolved.user, session: resolved.session, method: credential.method })
        if (resolved.renewedUntil && credential.method === 'cookie') {
          setSessionCookie(c, ctx.config, credential.token, resolved.renewedUntil, ctx.clock.now())
        }
      } else {
        if (resolved.status === 'disabled') c.set('authError', 'account_disabled')
        if (credential.method === 'cookie') clearSessionCookie(c, ctx.config)
      }
    }
    await next()
  }
}

/** Korumalı uçların kapısı: oturum yoksa 401 `unauthorized` (hesap kapalıysa 403 `account_disabled`). */
export function requireUser(c: Context<AppEnv>): AuthState {
  const auth = c.get('auth')
  if (auth) return auth
  throw new AppError(c.get('authError') ?? 'unauthorized')
}

/** Yalnız yöneticiler (`role: 'admin'`). */
export function requireAdmin(c: Context<AppEnv>): AuthState {
  const auth = requireUser(c)
  if (auth.user.role !== 'admin') throw new AppError('forbidden')
  return auth
}

export interface NewSession {
  readonly id: string
  readonly token: string
  readonly expiresAt: Date
}

/** Yeni oturum satırı açar (işlem içinde çağrılabilir). Belirteç yalnız burada, bir kez görünür. */
export function createSession(ctx: AppContext, userId: string, userAgent: string): NewSession {
  const now = ctx.clock.now()
  const token = newToken(ctx.random)
  const session: NewSession = {
    id: newId(ctx.clock, ctx.random),
    token,
    expiresAt: addDays(now, ctx.config.sessionTtlDays),
  }
  insertSession(ctx.db, {
    id: session.id,
    tokenHash: hashToken(token),
    userId,
    now: now.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    userAgent: userAgent.slice(0, 200),
  })
  return session
}

/** Oturumu yanıta bağlar: tarayıcı kipinde çerez yazar; belirteç kipinde belirteci döndürür (gövdeye konur). */
export function attachSession(c: Context<AppEnv>, ctx: AppContext, session: NewSession): { token?: string } {
  if (wantsTokenMode(c)) return { token: session.token }
  setSessionCookie(c, ctx.config, session.token, session.expiresAt, ctx.clock.now())
  return {}
}
