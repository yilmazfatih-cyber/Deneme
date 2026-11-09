// Kimlik doğrulama: personel e-posta + parola (scrypt), sakin telefon + tek kullanımlık kod.
// Oturum belirteci yalnız çerezde durur; veritabanında SHA-256 özeti saklanır.
import { createHash, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import type { MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { STAFF_ROLES, type Role } from '../../shared/labels.ts'
import { get, insert, run, type DB } from '../db/db.ts'
import { HttpError, type AppUser, type Deps, type Env } from '../http.ts'

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>
const SCRYPT = { N: 16384, r: 8, p: 1 }
export const COOKIE = 'kahya_oturum'

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await scryptAsync(password, salt, 64, SCRYPT)
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored?.startsWith('scrypt$')) {
    // Zamanlama farkı oluşmasın diye yine de bir türetme yap.
    await scryptAsync(password, Buffer.alloc(16), 64, SCRYPT)
    return false
  }
  const [, saltB64, hashB64] = stored.split('$')
  const expected = Buffer.from(hashB64!, 'base64')
  const actual = await scryptAsync(password, Buffer.from(saltB64!, 'base64'), expected.length, SCRYPT)
  return timingSafeEqual(expected, actual)
}

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

type UserRow = {
  id: number
  org_id: number
  name: string
  email: string | null
  phone: string | null
  role: Role
  person_id: number | null
  active: number
}

export const toAppUser = (u: UserRow): AppUser => ({
  id: u.id,
  orgId: u.org_id,
  name: u.name,
  email: u.email,
  phone: u.phone,
  role: u.role,
  personId: u.person_id,
})

export function createSession(deps: Deps, userId: number): { token: string; maxAge: number } {
  const token = randomBytes(32).toString('base64url')
  const maxAge = deps.config.sessionDays * 86_400
  insert(deps.db, 'sessions', {
    token_hash: sha256(token),
    user_id: userId,
    expires_at: new Date(deps.now().getTime() + maxAge * 1000).toISOString(),
  })
  run(deps.db, `UPDATE users SET last_login_at = ? WHERE id = ?`, deps.now().toISOString(), userId)
  return { token, maxAge }
}

export function setSessionCookie(c: Parameters<MiddlewareHandler<Env>>[0], deps: Deps, token: string, maxAge: number) {
  const secure = deps.config.publicUrl.startsWith('https') || c.req.header('x-forwarded-proto') === 'https'
  setCookie(c, COOKIE, token, { httpOnly: true, sameSite: 'Lax', path: '/', maxAge, secure })
}

export function clearSession(c: Parameters<MiddlewareHandler<Env>>[0], db: DB) {
  const token = getCookie(c, COOKIE)
  if (token) run(db, 'DELETE FROM sessions WHERE token_hash = ?', sha256(token))
  deleteCookie(c, COOKIE, { path: '/' })
}

export function userFromToken(deps: Deps, token: string | undefined): AppUser | null {
  if (!token) return null
  const row = get<UserRow & { expires_at: string }>(
    deps.db,
    `SELECT u.*, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
    sha256(token),
  )
  if (!row || !row.active || row.expires_at < deps.now().toISOString()) return null
  return toAppUser(row)
}

/** Oturum zorunlu; isteğe bağlı rol kısıtı. */
export function requireAuth(deps: Deps, roles?: Role[]): MiddlewareHandler<Env> {
  return async (c, next) => {
    const user = userFromToken(deps, getCookie(c, COOKIE))
    if (!user) throw new HttpError(401, 'Oturum açmanız gerekiyor')
    if (roles && !roles.includes(user.role)) throw new HttpError(403, 'Bu işlem için yetkiniz yok')
    c.set('user', user)
    await next()
  }
}

export const staffOnly = (deps: Deps) => requireAuth(deps, STAFF_ROLES)
export const residentOnly = (deps: Deps) => requireAuth(deps, ['sakin'])

/** Yazma yetkisi: denetçi/muhasebe salt okunur değildir ama personel ayarlarını yalnız şirket yöneticisi değiştirir. */
export function assertRole(user: AppUser, roles: Role[]) {
  if (!roles.includes(user.role)) throw new HttpError(403, 'Bu işlem için yetkiniz yok')
}

// --- Tek kullanımlık kod (OTP) ---

export function issueOtp(db: DB, phone: string, now: Date): string {
  const recent = get<{ created_at: string }>(db, 'SELECT created_at FROM otp_codes WHERE phone = ?', phone)
  if (recent && now.getTime() - new Date(recent.created_at).getTime() < 30_000) {
    throw new HttpError(429, 'Yeni kod istemeden önce 30 saniye bekleyin')
  }
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  run(
    db,
    `INSERT INTO otp_codes (phone, code_hash, expires_at, attempts, created_at) VALUES (?, ?, ?, 0, ?)
     ON CONFLICT(phone) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, created_at = excluded.created_at`,
    phone,
    sha256(`${phone}:${code}`),
    new Date(now.getTime() + 5 * 60_000).toISOString(),
    now.toISOString(),
  )
  return code
}

export function checkOtp(db: DB, phone: string, code: string, now: Date): boolean {
  const row = get<{ code_hash: string; expires_at: string; attempts: number }>(
    db,
    'SELECT code_hash, expires_at, attempts FROM otp_codes WHERE phone = ?',
    phone,
  )
  if (!row || row.expires_at < now.toISOString() || row.attempts >= 5) return false
  const ok = timingSafeEqual(Buffer.from(row.code_hash), Buffer.from(sha256(`${phone}:${code}`)))
  if (ok) run(db, 'DELETE FROM otp_codes WHERE phone = ?', phone)
  else run(db, 'UPDATE otp_codes SET attempts = attempts + 1 WHERE phone = ?', phone)
  return ok
}

// --- Basit hız sınırlayıcı (tek sunucu için bellek içi) ---

const buckets = new Map<string, { count: number; reset: number }>()

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()) {
  if (buckets.size > 10_000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k)
  const b = buckets.get(key)
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs })
    return
  }
  b.count++
  if (b.count > limit) throw new HttpError(429, 'Çok fazla deneme. Lütfen biraz sonra tekrar deneyin.')
}

export function resetRateLimits() {
  buckets.clear()
}
