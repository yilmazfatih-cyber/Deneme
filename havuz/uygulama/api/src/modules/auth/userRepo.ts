/**
 * Kullanıcı tablosu (users) SQL'i ve satır → API nesnesi dönüşümleri. Kimlik, hesap ve yönetim modülleri kullanır.
 * Bütün SQL parametrelidir; e-posta her zaman küçük harfe çevrilmiş (shared → emailSchema) olarak saklanır.
 *
 * Genişletme: kullanıcıya yeni sütun eklemek için yeni migrasyon (ALTER TABLE users ADD COLUMN … DEFAULT …),
 * `UserRow`'a alan, gerekiyorsa `toAuthUser`/`toApiUser`'a karşılığı. API'de görünecekse shared → userSchema'ya da.
 */
import { foldTr, type AdminUser, type Role, type User } from '@uygulama/shared'
import { fromBool, toBool, type Db } from '../../db/database.ts'
import type { AuthUser } from '../../http/types.ts'

export interface UserRow {
  id: string
  email: string
  name: string
  password_hash: string
  role: Role
  email_verified: number
  disabled: number
  search_key: string
  created_at: string
  updated_at: string
  last_seen_at: string | null
}

export function toAuthUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    emailVerified: toBool(row.email_verified),
    disabled: toBool(row.disabled),
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
  }
}

/** API'nin döndürdüğü kullanıcı (shared → userSchema). */
export function toApiUser(user: AuthUser): User {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
  }
}

export function toAdminUser(user: AuthUser): AdminUser {
  return { ...toApiUser(user), disabled: user.disabled, lastSeenAt: user.lastSeenAt }
}

export function searchKeyOf(name: string, email: string): string {
  return foldTr(`${name} ${email}`)
}

export function findUserById(db: Db, id: string): UserRow | undefined {
  return db.get<UserRow>('SELECT * FROM users WHERE id = ?', id)
}

export function findUserByEmail(db: Db, email: string): UserRow | undefined {
  return db.get<UserRow>('SELECT * FROM users WHERE email = ?', email)
}

export function insertUser(
  db: Db,
  input: { id: string; email: string; name: string; passwordHash: string; role: Role; now: string },
): void {
  db.run(
    'INSERT INTO users (id, email, name, password_hash, role, search_key, created_at, updated_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    input.id,
    input.email,
    input.name,
    input.passwordHash,
    input.role,
    searchKeyOf(input.name, input.email),
    input.now,
    input.now,
    input.now,
  )
}

export function updatePasswordHash(db: Db, id: string, passwordHash: string, now: string): void {
  db.run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', passwordHash, now, id)
}

export function updateUserName(db: Db, id: string, name: string, email: string, now: string): void {
  db.run(
    'UPDATE users SET name = ?, search_key = ?, updated_at = ? WHERE id = ?',
    name,
    searchKeyOf(name, email),
    now,
    id,
  )
}

export function updateUserAdminFields(
  db: Db,
  id: string,
  fields: { role?: Role; disabled?: boolean },
  now: string,
): void {
  if (fields.role !== undefined) db.run('UPDATE users SET role = ?, updated_at = ? WHERE id = ?', fields.role, now, id)
  if (fields.disabled !== undefined) {
    db.run('UPDATE users SET disabled = ?, updated_at = ? WHERE id = ?', fromBool(fields.disabled), now, id)
  }
}

export function touchUserLastSeen(db: Db, id: string, now: string): void {
  db.run('UPDATE users SET last_seen_at = ? WHERE id = ?', now, id)
}

export function deleteUser(db: Db, id: string): void {
  db.run('DELETE FROM users WHERE id = ?', id)
}

/**
 * ADMIN_EMAILS'te olup henüz hesabı OLMAYAN adres sayısı. E-posta doğrulaması olmadığı için bu adreslerle ilk
 * kaydolan kişi yönetici olur; sunucu açılışta bunu (adresi değil, sayıyı) uyarı olarak yazar (index.ts).
 */
export function countUnclaimedAdminEmails(db: Db, emails: readonly string[]): number {
  return emails.filter((email) => !findUserByEmail(db, email)).length
}

/** ADMIN_EMAILS listesindeki kullanıcıları yönetici yapar (kimseyi düşürmez). Değişen satır sayısını döndürür. */
export function promoteAdmins(db: Db, emails: readonly string[], now: string): number {
  return db.transaction(() => {
    let changed = 0
    for (const email of emails) {
      changed += db.run(
        "UPDATE users SET role = 'admin', updated_at = ? WHERE email = ? AND role <> 'admin'",
        now,
        email,
      ).changes
    }
    return changed
  })
}
