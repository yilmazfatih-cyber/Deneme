/**
 * Eşitleme tablolarının (records, clients) SQL'i. Bütün varlıklar tek `records` tablosunda JSON olarak durur;
 * anahtar (alan, koleksiyon, kimlik), sıra `rev` (alan içinde benzersiz, records_workspace_rev dizini).
 *
 * Genişletme: bu dosya protokolün depolama yüzüdür; değiştirmeden önce shared/src/testing/conformance.ts'e
 * senaryo ekleyin ve `npm run test -w @uygulama/api` ile uygunluk testlerini koşun.
 */
import type { ServerRecord } from '@uygulama/shared'
import { fromBool, toBool, type Db } from '../../db/database.ts'

export interface RecordRow {
  workspace_id: string
  collection: string
  id: string
  data: string
  deleted: number
  rev: number
  created_at: string
  updated_at: string
  updated_by: string | null
}

export function toServerRecord(row: RecordRow): ServerRecord {
  return {
    workspaceId: row.workspace_id,
    collection: row.collection,
    id: row.id,
    data: JSON.parse(row.data) as Record<string, unknown>,
    deleted: toBool(row.deleted),
    rev: row.rev,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  }
}

export function findRecord(db: Db, workspaceId: string, collection: string, id: string): RecordRow | undefined {
  return db.get<RecordRow>(
    'SELECT * FROM records WHERE workspace_id = ? AND collection = ? AND id = ?',
    workspaceId,
    collection,
    id,
  )
}

export function upsertRecord(db: Db, record: ServerRecord): void {
  db.run(
    `INSERT INTO records (workspace_id, collection, id, data, deleted, rev, created_at, updated_at, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (workspace_id, collection, id) DO UPDATE SET
       data = excluded.data, deleted = excluded.deleted, rev = excluded.rev,
       updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    record.workspaceId,
    record.collection,
    record.id,
    JSON.stringify(record.data),
    fromBool(record.deleted),
    record.rev,
    record.createdAt,
    record.updatedAt,
    record.updatedBy,
  )
}

/** Alanın sayacını bir artırır ve yeni değeri döndürür (işlem içinde çağrılır). */
export function bumpWorkspaceRev(db: Db, workspaceId: string, now: string): number {
  const row = db.get<{ rev: number }>(
    'UPDATE workspaces SET rev = rev + 1, updated_at = ? WHERE id = ? RETURNING rev',
    now,
    workspaceId,
  )
  if (!row) throw new Error(`Alan bulunamadı: ${workspaceId}`)
  return row.rev
}

/** İmleçten sonraki kayıtlar, rev sırasıyla, en çok `limit` tane. */
export function recordsSince(db: Db, workspaceId: string, cursor: number, limit: number): RecordRow[] {
  return db.all<RecordRow>(
    'SELECT * FROM records WHERE workspace_id = ? AND rev > ? ORDER BY rev LIMIT ?',
    workspaceId,
    cursor,
    limit,
  )
}

export interface ClientRow {
  id: string
  user_id: string
  last_mutation_id: number
}

export function findClient(db: Db, clientId: string): ClientRow | undefined {
  return db.get<ClientRow>('SELECT id, user_id, last_mutation_id FROM clients WHERE id = ?', clientId)
}

export function insertClient(db: Db, clientId: string, userId: string, now: string): void {
  db.run(
    'INSERT INTO clients (id, user_id, last_mutation_id, created_at, last_seen_at) VALUES (?, ?, 0, ?, ?)',
    clientId,
    userId,
    now,
    now,
  )
}

export function updateClient(db: Db, clientId: string, lastMutationId: number, now: string): void {
  db.run('UPDATE clients SET last_mutation_id = ?, last_seen_at = ? WHERE id = ?', lastMutationId, now, clientId)
}
