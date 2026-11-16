/**
 * Oturum ve şifre sıfırlama belirteçlerinin SQL'i. Belirtecin kendisi değil, SHA-256 özeti saklanır
 * (lib/random.ts → hashToken); veritabanı ele geçse bile oturum çalınamaz.
 *
 * Genişletme: "aktif cihazlarım" ekranı gerekirse `listSessions(userId)` buraya eklenir; `user_agent` sütunu hazır.
 */
import type { Db } from '../../db/database.ts'
import type { UserRow } from './userRepo.ts'

export interface SessionRow {
  id: string
  token_hash: string
  user_id: string
  created_at: string
  expires_at: string
  last_used_at: string
  user_agent: string
}

export function insertSession(
  db: Db,
  input: { id: string; tokenHash: string; userId: string; now: string; expiresAt: string; userAgent: string },
): void {
  db.run(
    'INSERT INTO sessions (id, token_hash, user_id, created_at, expires_at, last_used_at, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)',
    input.id,
    input.tokenHash,
    input.userId,
    input.now,
    input.expiresAt,
    input.now,
    input.userAgent,
  )
}

export function findSessionByTokenHash(db: Db, tokenHash: string): { session: SessionRow; user: UserRow } | undefined {
  const session = db.get<SessionRow>('SELECT * FROM sessions WHERE token_hash = ?', tokenHash)
  if (!session) return undefined
  const user = db.get<UserRow>('SELECT * FROM users WHERE id = ?', session.user_id)
  return user ? { session, user } : undefined
}

export function extendSession(db: Db, id: string, expiresAt: string, now: string): void {
  db.run('UPDATE sessions SET expires_at = ?, last_used_at = ? WHERE id = ?', expiresAt, now, id)
}

export function touchSession(db: Db, id: string, now: string): void {
  db.run('UPDATE sessions SET last_used_at = ? WHERE id = ?', now, id)
}

export function deleteSession(db: Db, id: string): void {
  db.run('DELETE FROM sessions WHERE id = ?', id)
}

/** Kullanıcının bütün oturumlarını siler; `exceptId` verilirse o oturum kalır. Silinen sayıyı döndürür. */
export function deleteUserSessions(db: Db, userId: string, exceptId?: string): number {
  if (exceptId) return db.run('DELETE FROM sessions WHERE user_id = ? AND id <> ?', userId, exceptId).changes
  return db.run('DELETE FROM sessions WHERE user_id = ?', userId).changes
}

// ── Şifre sıfırlama belirteçleri ─────────────────────────────────────────────────────────────────

export interface PasswordResetRow {
  token_hash: string
  user_id: string
  created_at: string
  expires_at: string
  used_at: string | null
}

export function insertPasswordReset(
  db: Db,
  input: { tokenHash: string; userId: string; now: string; expiresAt: string },
): void {
  db.run(
    'INSERT INTO password_resets (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
    input.tokenHash,
    input.userId,
    input.now,
    input.expiresAt,
  )
}

export function findPasswordReset(db: Db, tokenHash: string): PasswordResetRow | undefined {
  return db.get<PasswordResetRow>('SELECT * FROM password_resets WHERE token_hash = ?', tokenHash)
}

/** Kullanıcının bütün sıfırlama belirteçlerini siler (şifre oturumla değişince e-postadaki eski bağlantılar geçmesin). */
export function deleteUserPasswordResets(db: Db, userId: string): void {
  db.run('DELETE FROM password_resets WHERE user_id = ?', userId)
}

/** Belirteci kullanılmış işaretler; kullanıcının öteki bütün sıfırlama belirteçlerini siler. */
export function consumePasswordResets(db: Db, userId: string, tokenHash: string, now: string): void {
  db.run('UPDATE password_resets SET used_at = ? WHERE token_hash = ?', now, tokenHash)
  db.run('DELETE FROM password_resets WHERE user_id = ? AND token_hash <> ?', userId, tokenHash)
}
