/**
 * Kimlik işleri: kayıt, giriş, çıkış, şifre değiştir / unuttum / sıfırla.
 *
 * Güvenlik kararları (gerekçe: docs/GUVENLIK.md):
 *  - Giriş hatası tek tiptir (`invalid_credentials`); e-posta yoksa da parola özeti hesaplanır (zamanlama eşit).
 *  - Şifre-unuttum her durumda aynı yanıtı verir; e-posta arka planda gönderilir (süre de sızmaz).
 *  - Kayıt, alınmış e-postada `email_taken` döner (kullanılabilirlik için bilinçli seçim; IP hız sınırıyla).
 *  - Şifre değişince öteki oturumlar, sıfırlanınca BÜTÜN oturumlar düşer; anlık bağlantılar da kapanır.
 *  - Parola özeti (yavaş, eşzamansız) işlemin DIŞINDA hesaplanır; işlem içinde await yoktur.
 *
 * Genişletme: e-posta doğrulama gibi yeni bir akış eklerken belirteç için `newToken`+`hashToken`, e-posta için
 * mail/templates.ts, hız sınırı için RATE_RULES kullanın; denetim günlüğüne olay yazın.
 */
import { AppError, webUrl, WEB_ROUTES, type Role } from '@uygulama/shared'
import type { AppContext } from '../../context.ts'
import { rateLimitKey } from '../../http/clientIp.ts'
import { RATE_RULES } from '../../http/rateLimit.ts'
import type { RequestMeta } from '../../http/meta.ts'
import type { AuthState, AuthUser } from '../../http/types.ts'
import { checkPassword } from '../../lib/passwordPolicy.ts'
import { addMinutes, hashToken, isTokenFormat, newId, newToken } from '../../lib/random.ts'
import { passwordChangedMail, passwordResetMail } from '../../mail/templates.ts'
import { MESSAGES } from '../../messages.ts'
import { createPersonalWorkspace } from '../workspaces/service.ts'
import { createSession, type NewSession } from './session.ts'
import {
  consumePasswordResets,
  deleteSession,
  deleteUserPasswordResets,
  deleteUserSessions,
  findPasswordReset,
  insertPasswordReset,
} from './sessionRepo.ts'
import {
  findUserByEmail,
  findUserById,
  insertUser,
  toAuthUser,
  touchUserLastSeen,
  updatePasswordHash,
} from './userRepo.ts'

export interface SignedIn {
  readonly user: AuthUser
  readonly session: NewSession
}

/** Zayıf şifrede `weak_password` (formdaki alan adıyla ayrıntı) fırlatır. */
export function assertStrong(password: string, identity: { email: string; name: string }, field: string): void {
  const check = checkPassword(password, identity)
  if (!check.ok) throw new AppError('weak_password', check.message, [{ path: field, message: check.message }])
}

/**
 * Kullanıcıyı ve kişisel alanını açar; kimliğini döndürür. İŞLEM İÇİNDE çağrılır. Kayıt ucu ve betikler
 * (seed, create-admin) kullanır. ADMIN_EMAILS'te olan e-posta yönetici olarak açılır.
 */
export function insertUserWithWorkspace(
  ctx: AppContext,
  input: { email: string; name: string; passwordHash: string; role?: Role },
): string {
  if (findUserByEmail(ctx.db, input.email)) throw new AppError('email_taken')
  const now = ctx.clock.now().toISOString()
  const id = newId(ctx.clock, ctx.random)
  const role = input.role ?? (ctx.config.adminEmails.includes(input.email) ? 'admin' : 'user')
  insertUser(ctx.db, { id, email: input.email, name: input.name, passwordHash: input.passwordHash, role, now })
  createPersonalWorkspace(ctx, id, now)
  return id
}

export async function register(
  ctx: AppContext,
  input: { email: string; password: string; name: string },
  meta: RequestMeta,
): Promise<SignedIn> {
  assertStrong(input.password, input, 'password')
  if (findUserByEmail(ctx.db, input.email)) throw new AppError('email_taken')
  const passwordHash = await ctx.hasher.hash(input.password)
  return ctx.db.transaction(() => {
    // Özet hesaplanırken aynı e-postayla başka kayıt gelmiş olabilir: işlemin içinde yeniden bakılır.
    const id = insertUserWithWorkspace(ctx, { email: input.email, name: input.name, passwordHash })
    const session = createSession(ctx, id, meta.userAgent)
    ctx.audit.record({ action: 'auth.register', actorId: id, targetType: 'user', targetId: id, ip: meta.ip })
    const row = findUserById(ctx.db, id)
    if (!row) throw new Error('Yeni kullanıcı okunamadı.')
    return { user: toAuthUser(row), session }
  })
}

export async function login(
  ctx: AppContext,
  input: { email: string; password: string },
  meta: RequestMeta,
): Promise<SignedIn> {
  ctx.limiter.consume(RATE_RULES.loginAccount, `${rateLimitKey(meta.ip)}|${input.email}`)
  const row = findUserByEmail(ctx.db, input.email)
  if (!row) {
    await ctx.hasher.burn(input.password)
    ctx.audit.record({ action: 'auth.login_failed', ip: meta.ip, details: { reason: 'unknown_email' } })
    throw new AppError('invalid_credentials')
  }
  if (!(await ctx.hasher.verify(input.password, row.password_hash))) {
    ctx.audit.record({
      action: 'auth.login_failed',
      targetType: 'user',
      targetId: row.id,
      ip: meta.ip,
      details: { reason: 'wrong_password' },
    })
    throw new AppError('invalid_credentials')
  }
  if (row.disabled === 1) {
    ctx.audit.record({
      action: 'auth.login_failed',
      targetType: 'user',
      targetId: row.id,
      ip: meta.ip,
      details: { reason: 'disabled' },
    })
    throw new AppError('account_disabled')
  }
  const rehash = ctx.hasher.needsRehash(row.password_hash) ? await ctx.hasher.hash(input.password) : null
  return ctx.db.transaction(() => {
    const now = ctx.clock.now().toISOString()
    if (rehash) updatePasswordHash(ctx.db, row.id, rehash, now)
    touchUserLastSeen(ctx.db, row.id, now)
    const session = createSession(ctx, row.id, meta.userAgent)
    ctx.audit.record({
      action: 'auth.login',
      actorId: row.id,
      targetType: 'user',
      targetId: row.id,
      ip: meta.ip,
      details: { rehashed: rehash !== null },
    })
    const fresh = findUserById(ctx.db, row.id) ?? row
    return { user: toAuthUser(fresh), session }
  })
}

export function logout(ctx: AppContext, auth: AuthState | null): void {
  if (!auth) return
  deleteSession(ctx.db, auth.session.id)
  ctx.hub.disconnectSession(auth.user.id, auth.session.id)
}

export function logoutAll(ctx: AppContext, auth: AuthState, meta: RequestMeta): void {
  ctx.db.transaction(() => {
    deleteUserSessions(ctx.db, auth.user.id)
    ctx.audit.record({
      action: 'auth.logout_all',
      actorId: auth.user.id,
      targetType: 'user',
      targetId: auth.user.id,
      ip: meta.ip,
    })
  })
  ctx.hub.disconnectUser(auth.user.id)
}

function sendPasswordChangedMail(ctx: AppContext, user: { email: string; name: string }): void {
  ctx.jobs.run('şifre değişti e-postası', () =>
    ctx.mailer.send(passwordChangedMail({ to: user.email, name: user.name, appUrl: ctx.config.appUrl })),
  )
}

export async function changePassword(
  ctx: AppContext,
  auth: AuthState,
  input: { currentPassword: string; newPassword: string },
  meta: RequestMeta,
): Promise<void> {
  ctx.limiter.consume(RATE_RULES.loginAccount, `${rateLimitKey(meta.ip)}|${auth.user.email}`)
  const row = findUserById(ctx.db, auth.user.id)
  if (!row) throw new AppError('unauthorized')
  if (!(await ctx.hasher.verify(input.currentPassword, row.password_hash))) {
    throw new AppError('invalid_credentials', MESSAGES.wrongCurrentPassword, [
      { path: 'currentPassword', message: MESSAGES.wrongCurrentPassword },
    ])
  }
  assertStrong(input.newPassword, row, 'newPassword')
  const passwordHash = await ctx.hasher.hash(input.newPassword)
  ctx.db.transaction(() => {
    updatePasswordHash(ctx.db, row.id, passwordHash, ctx.clock.now().toISOString())
    deleteUserSessions(ctx.db, row.id, auth.session.id)
    // Bekleyen sıfırlama bağlantıları da düşer: kutuya bir an erişip bağlantıyı alan biri, kullanıcı şifresini
    // değiştirdikten sonra hesabı geri alamasın.
    deleteUserPasswordResets(ctx.db, row.id)
    ctx.audit.record({
      action: 'auth.password_changed',
      actorId: row.id,
      targetType: 'user',
      targetId: row.id,
      ip: meta.ip,
    })
  })
  ctx.hub.disconnectUser(row.id, { exceptSessionId: auth.session.id })
  sendPasswordChangedMail(ctx, row)
}

/** Her durumda sessizce döner: hesabın varlığı yanıttan ya da süreden anlaşılmaz. */
export function forgotPassword(ctx: AppContext, email: string, meta: RequestMeta): void {
  ctx.limiter.consume(RATE_RULES.forgotAccount, email)
  const row = findUserByEmail(ctx.db, email)
  if (!row || row.disabled === 1) return
  const token = newToken(ctx.random)
  const now = ctx.clock.now()
  ctx.db.transaction(() => {
    insertPasswordReset(ctx.db, {
      tokenHash: hashToken(token),
      userId: row.id,
      now: now.toISOString(),
      expiresAt: addMinutes(now, ctx.config.resetTokenTtlMinutes).toISOString(),
    })
    ctx.audit.record({ action: 'auth.password_reset_requested', targetType: 'user', targetId: row.id, ip: meta.ip })
  })
  const link = webUrl(ctx.config.appUrl, WEB_ROUTES.resetPassword, { token })
  ctx.jobs.run('şifre sıfırlama e-postası', () =>
    ctx.mailer.send(
      passwordResetMail({ to: row.email, name: row.name, link, ttlMinutes: ctx.config.resetTokenTtlMinutes }),
    ),
  )
}

export async function resetPassword(
  ctx: AppContext,
  input: { token: string; newPassword: string },
  meta: RequestMeta,
): Promise<void> {
  const tokenHash = isTokenFormat(input.token) ? hashToken(input.token) : ''
  const usable = () => {
    const reset = tokenHash ? findPasswordReset(ctx.db, tokenHash) : undefined
    if (!reset || reset.used_at !== null || reset.expires_at <= ctx.clock.now().toISOString()) {
      throw new AppError('invalid_token')
    }
    return reset
  }
  const reset = usable()
  const row = findUserById(ctx.db, reset.user_id)
  if (!row) throw new AppError('invalid_token')
  assertStrong(input.newPassword, row, 'newPassword')
  const passwordHash = await ctx.hasher.hash(input.newPassword)
  ctx.db.transaction(() => {
    usable() // özet hesaplanırken aynı belirteç başka istekte kullanılmış olabilir
    const now = ctx.clock.now().toISOString()
    updatePasswordHash(ctx.db, row.id, passwordHash, now)
    consumePasswordResets(ctx.db, row.id, tokenHash, now)
    deleteUserSessions(ctx.db, row.id)
    ctx.audit.record({
      action: 'auth.password_reset',
      actorId: row.id,
      targetType: 'user',
      targetId: row.id,
      ip: meta.ip,
    })
  })
  ctx.hub.disconnectUser(row.id)
  sendPasswordChangedMail(ctx, row)
}
