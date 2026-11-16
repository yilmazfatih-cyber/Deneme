/**
 * Davet tablosunun (invites) SQL'i. Davet belirtecinin kendisi değil SHA-256 özeti saklanır; belirteç yalnız
 * oluşturulduğu anda sahibine döner ve bağlantıyla paylaşılır.
 *
 * Genişletme: "bekleyen davetleri listele / iptal et" gerekirse `listActiveInvites` / `deleteInvite` buraya.
 */
import type { InviteRole } from '@uygulama/shared'
import type { Db } from '../../db/database.ts'

export interface InviteRow {
  token_hash: string
  workspace_id: string
  role: InviteRole
  created_by: string | null
  created_at: string
  expires_at: string
  used_at: string | null
  used_by: string | null
}

export function insertInvite(
  db: Db,
  input: {
    tokenHash: string
    workspaceId: string
    role: InviteRole
    createdBy: string
    now: string
    expiresAt: string
  },
): void {
  db.run(
    'INSERT INTO invites (token_hash, workspace_id, role, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
    input.tokenHash,
    input.workspaceId,
    input.role,
    input.createdBy,
    input.now,
    input.expiresAt,
  )
}

export function findInvite(db: Db, tokenHash: string): InviteRow | undefined {
  return db.get<InviteRow>('SELECT * FROM invites WHERE token_hash = ?', tokenHash)
}

export function markInviteUsed(db: Db, tokenHash: string, userId: string, now: string): void {
  db.run('UPDATE invites SET used_at = ?, used_by = ? WHERE token_hash = ?', now, userId, tokenHash)
}
