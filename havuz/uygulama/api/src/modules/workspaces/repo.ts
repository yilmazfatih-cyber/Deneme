/**
 * Çalışma alanı ve üyelik tablolarının (workspaces, members) SQL'i. Kimlik (kişisel alan açma), eşitleme
 * (üyesi olunan alanlar), hesap silme ve davet modülleri de bunu kullanır.
 *
 * Genişletme: alana yeni bir özellik (ör. renk) eklemek için yeni migrasyon + `WorkspaceRow` alanı + gerekiyorsa
 * shared → workspaceInfoSchema. Sıralama hep oluşturulma sırasıdır (`rowid`).
 */
import type { Member, WorkspaceInfo, WorkspaceKind, WorkspaceRole } from '@uygulama/shared'
import type { Db } from '../../db/database.ts'

export interface WorkspaceRow {
  id: string
  name: string
  kind: WorkspaceKind
  rev: number
  created_by: string | null
  created_at: string
  updated_at: string
}

interface WorkspaceInfoRow {
  id: string
  name: string
  kind: WorkspaceKind
  rev: number
  role: WorkspaceRole
  member_count: number
}

function toInfo(row: WorkspaceInfoRow): WorkspaceInfo {
  return { id: row.id, name: row.name, kind: row.kind, role: row.role, rev: row.rev, memberCount: row.member_count }
}

const INFO_SELECT = `SELECT w.id, w.name, w.kind, w.rev, m.role,
  (SELECT count(*) FROM members AS c WHERE c.workspace_id = w.id) AS member_count
  FROM members AS m JOIN workspaces AS w ON w.id = m.workspace_id`

export function insertWorkspace(
  db: Db,
  input: { id: string; name: string; kind: WorkspaceKind; createdBy: string; now: string },
): void {
  db.run(
    'INSERT INTO workspaces (id, name, kind, rev, created_by, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?, ?)',
    input.id,
    input.name,
    input.kind,
    input.createdBy,
    input.now,
    input.now,
  )
}

export function insertMember(
  db: Db,
  input: { workspaceId: string; userId: string; role: WorkspaceRole; now: string },
): void {
  db.run(
    'INSERT INTO members (workspace_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)',
    input.workspaceId,
    input.userId,
    input.role,
    input.now,
  )
}

export function findWorkspace(db: Db, id: string): WorkspaceRow | undefined {
  return db.get<WorkspaceRow>('SELECT * FROM workspaces WHERE id = ?', id)
}

export function findRole(db: Db, workspaceId: string, userId: string): WorkspaceRole | undefined {
  return db.get<{ role: WorkspaceRole }>(
    'SELECT role FROM members WHERE workspace_id = ? AND user_id = ?',
    workspaceId,
    userId,
  )?.role
}

/** Kullanıcının üyesi olduğu alanlar, oluşturulma sırasıyla. */
export function listUserWorkspaces(db: Db, userId: string): WorkspaceInfo[] {
  return db.all<WorkspaceInfoRow>(`${INFO_SELECT} WHERE m.user_id = ? ORDER BY w.rowid`, userId).map(toInfo)
}

export function workspaceInfoFor(db: Db, workspaceId: string, userId: string): WorkspaceInfo | undefined {
  const row = db.get<WorkspaceInfoRow>(`${INFO_SELECT} WHERE m.user_id = ? AND w.id = ?`, userId, workspaceId)
  return row ? toInfo(row) : undefined
}

/** Kullanıcının alan → rol eşlemesi (eşitleme bir kez okur). */
export function userRoles(db: Db, userId: string): Map<string, WorkspaceRole> {
  const rows = db.all<{ workspace_id: string; role: WorkspaceRole }>(
    'SELECT workspace_id, role FROM members WHERE user_id = ?',
    userId,
  )
  return new Map(rows.map((row) => [row.workspace_id, row.role]))
}

export function renameWorkspace(db: Db, id: string, name: string, now: string): void {
  db.run('UPDATE workspaces SET name = ?, updated_at = ? WHERE id = ?', name, now, id)
}

/** Alanı siler; üyelikler, davetler ve kayıtlar yabancı anahtarla (ON DELETE CASCADE) birlikte gider. */
export function deleteWorkspace(db: Db, id: string): void {
  db.run('DELETE FROM workspaces WHERE id = ?', id)
}

interface MemberRow {
  user_id: string
  name: string
  email: string
  role: WorkspaceRole
  joined_at: string
}

const MEMBER_SELECT = `SELECT m.user_id, u.name, u.email, m.role, m.joined_at
  FROM members AS m JOIN users AS u ON u.id = m.user_id`

function toMember(row: MemberRow): Member {
  return { userId: row.user_id, name: row.name, email: row.email, role: row.role, joinedAt: row.joined_at }
}

/** Üyeler, katılma sırasıyla (eşitlikte kullanıcı kimliğine göre). */
export function listMembers(db: Db, workspaceId: string): Member[] {
  return db
    .all<MemberRow>(`${MEMBER_SELECT} WHERE m.workspace_id = ? ORDER BY m.joined_at, m.user_id`, workspaceId)
    .map(toMember)
}

export function findMember(db: Db, workspaceId: string, userId: string): Member | undefined {
  const row = db.get<MemberRow>(`${MEMBER_SELECT} WHERE m.workspace_id = ? AND m.user_id = ?`, workspaceId, userId)
  return row ? toMember(row) : undefined
}

export function memberUserIds(db: Db, workspaceId: string): string[] {
  return db
    .all<{ user_id: string }>('SELECT user_id FROM members WHERE workspace_id = ?', workspaceId)
    .map((row) => row.user_id)
}

export function countOwners(db: Db, workspaceId: string): number {
  return (
    db.get<{ total: number }>(
      "SELECT count(*) AS total FROM members WHERE workspace_id = ? AND role = 'owner'",
      workspaceId,
    )?.total ?? 0
  )
}

export function updateMemberRole(db: Db, workspaceId: string, userId: string, role: WorkspaceRole): void {
  db.run('UPDATE members SET role = ? WHERE workspace_id = ? AND user_id = ?', role, workspaceId, userId)
}

export function deleteMember(db: Db, workspaceId: string, userId: string): void {
  db.run('DELETE FROM members WHERE workspace_id = ? AND user_id = ?', workspaceId, userId)
}

/** `userId` dışındaki en eski üye (sahiplik devri için). */
export function oldestOtherMember(db: Db, workspaceId: string, userId: string): string | undefined {
  return db.get<{ user_id: string }>(
    'SELECT user_id FROM members WHERE workspace_id = ? AND user_id <> ? ORDER BY joined_at, user_id LIMIT 1',
    workspaceId,
    userId,
  )?.user_id
}
