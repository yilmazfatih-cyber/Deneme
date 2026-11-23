/**
 * Tablo satırları ↔ uygulama nesneleri: `records` ve `outbox` tablolarının okuma/yazma yardımcıları.
 * Hepsi bir `sql` yürütücüsü alır; çağıran `db.read`/`db.write` işinin içindedir. SQL her zaman parametrelidir.
 *
 * Bu dosyayı ekranlardan KULLANMAYIN: yazma için records.ts (`writeRecord`…), okuma için hooks.ts.
 * Genişletme: records tablosuna sütun eklemek göç ister (schema.ts) ve buradaki dönüştürücülerin güncellenmesini.
 */
import type { Doc, JsonObject, Mutation, MutationIntent, RecordKey, ServerSnapshot } from '@uygulama/shared'
import type { SqlExecutor } from './sql.ts'

/** `records` tablosundaki bir satır. */
export interface RecordRow {
  readonly workspaceId: string
  readonly collection: string
  readonly id: string
  /** Arayüzün gördüğü hâl (sunucu hâli + bekleyen yerel değişiklikler). */
  readonly view: Doc
  /** Sunucunun son bilinen hâli; kayıt henüz sunucuya ulaşmadıysa `null`. */
  readonly server: ServerSnapshot | null
  /** Kaydın ilk oluşturulduğu an (ISO). */
  readonly createdAt: string
  /** Görünen hâlin en son değiştiği an (ISO). */
  readonly updatedAt: string
}

interface RecordSqlRow {
  readonly workspace_id: string
  readonly collection: string
  readonly id: string
  readonly view_data: string
  readonly view_deleted: number
  readonly server: string | null
  readonly created_at: string
  readonly updated_at: string
}

const RECORD_COLUMNS = 'workspace_id, collection, id, view_data, view_deleted, server, created_at, updated_at'

function toRecordRow(row: RecordSqlRow): RecordRow {
  return {
    workspaceId: row.workspace_id,
    collection: row.collection,
    id: row.id,
    view: { data: JSON.parse(row.view_data) as JsonObject, deleted: row.view_deleted === 1 },
    server: row.server === null ? null : (JSON.parse(row.server) as ServerSnapshot),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function rowKey(row: Pick<RecordRow, 'workspaceId' | 'collection' | 'id'>): RecordKey {
  return { workspaceId: row.workspaceId, collection: row.collection, id: row.id }
}

export async function getRow(sql: SqlExecutor, key: RecordKey): Promise<RecordRow | null> {
  const row = await sql.get<RecordSqlRow>(
    `SELECT ${RECORD_COLUMNS} FROM records WHERE workspace_id = ? AND collection = ? AND id = ?`,
    [key.workspaceId, key.collection, key.id],
  )
  return row && toRecordRow(row)
}

/** Bir alan + koleksiyondaki bütün satırlar (silinmişler dahil), kimlik sırasıyla. */
export async function listRows(sql: SqlExecutor, workspaceId: string, collection: string): Promise<RecordRow[]> {
  const rows = await sql.all<RecordSqlRow>(
    `SELECT ${RECORD_COLUMNS} FROM records WHERE workspace_id = ? AND collection = ? ORDER BY id`,
    [workspaceId, collection],
  )
  return rows.map(toRecordRow)
}

/** Bir alanın bütün satırları (bütün koleksiyonlar). */
export async function workspaceRows(sql: SqlExecutor, workspaceId: string): Promise<RecordRow[]> {
  const rows = await sql.all<RecordSqlRow>(
    `SELECT ${RECORD_COLUMNS} FROM records WHERE workspace_id = ? ORDER BY collection, id`,
    [workspaceId],
  )
  return rows.map(toRecordRow)
}

export async function putRow(sql: SqlExecutor, row: RecordRow): Promise<void> {
  await sql.run(`INSERT OR REPLACE INTO records (${RECORD_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
    row.workspaceId,
    row.collection,
    row.id,
    JSON.stringify(row.view.data),
    row.view.deleted ? 1 : 0,
    row.server === null ? null : JSON.stringify(row.server),
    row.createdAt,
    row.updatedAt,
  ])
}

export async function deleteRow(sql: SqlExecutor, key: RecordKey): Promise<void> {
  await sql.run('DELETE FROM records WHERE workspace_id = ? AND collection = ? AND id = ?', [
    key.workspaceId,
    key.collection,
    key.id,
  ])
}

// ── Giden kutusu ─────────────────────────────────────────────────────────────────────────────────

interface OutboxSqlRow {
  readonly mid: number
  readonly workspace_id: string
  readonly collection: string
  readonly record_id: string
  readonly op: string
  readonly data: string | null
  readonly at: string
}

function toMutation(row: OutboxSqlRow): Mutation {
  const base = { mid: row.mid, workspaceId: row.workspace_id, collection: row.collection, recordId: row.record_id }
  const at = row.at
  const data = row.data === null ? {} : (JSON.parse(row.data) as JsonObject)
  switch (row.op) {
    case 'put':
      return { ...base, at, op: 'put', data }
    case 'patch':
      return { ...base, at, op: 'patch', data }
    case 'delete':
      return { ...base, at, op: 'delete' }
    case 'restore':
      return { ...base, at, op: 'restore' }
    default:
      throw new Error(`Giden kutusunda bilinmeyen işlem: ${row.op}`)
  }
}

/** Değişikliği giden kutusuna koyar; verilen sıra numarasını (`mid`) döndürür. Yalnız `db.write` içinden. */
export async function enqueueMutation(
  sql: SqlExecutor,
  workspaceId: string,
  recordId: string,
  intent: MutationIntent,
  now: Date,
): Promise<number> {
  const data = intent.op === 'put' || intent.op === 'patch' ? JSON.stringify(intent.data) : null
  const result = await sql.run(
    'INSERT INTO outbox (workspace_id, collection, record_id, op, data, at) VALUES (?, ?, ?, ?, ?, ?)',
    [workspaceId, intent.collection, recordId, intent.op, data, now.toISOString()],
  )
  return result.lastInsertRowId
}

/** Giden kutusu, `mid` artan sırada (`limit` verilirse baştan o kadar). */
export async function listOutbox(sql: SqlExecutor, limit?: number): Promise<Mutation[]> {
  const rows =
    limit === undefined
      ? await sql.all<OutboxSqlRow>('SELECT * FROM outbox ORDER BY mid')
      : await sql.all<OutboxSqlRow>('SELECT * FROM outbox ORDER BY mid LIMIT ?', [limit])
  return rows.map(toMutation)
}

export async function countOutbox(sql: SqlExecutor): Promise<number> {
  return (await sql.get<{ n: number }>('SELECT COUNT(*) AS n FROM outbox'))?.n ?? 0
}

/** Verilen sıra numaralarını giden kutusundan siler (parçalar hâlinde; SQLite değişken sınırına takılmasın). */
export async function deleteOutbox(sql: SqlExecutor, mids: readonly number[]): Promise<void> {
  for (let start = 0; start < mids.length; start += 200) {
    const chunk = mids.slice(start, start + 200)
    await sql.run(`DELETE FROM outbox WHERE mid IN (${chunk.map(() => '?').join(', ')})`, chunk)
  }
}

/** Yerelde izi olan alanlar: kaydı ya da bekleyen değişikliği olanlar (imleç/alan listesi ayrıca eklenir). */
export async function storedWorkspaceIds(sql: SqlExecutor): Promise<string[]> {
  const rows = await sql.all<{ workspace_id: string }>(
    'SELECT DISTINCT workspace_id FROM records UNION SELECT DISTINCT workspace_id FROM outbox',
  )
  return rows.map((row) => row.workspace_id)
}

/** Bir alanın bütün kayıtlarını ve bekleyen değişikliklerini siler (erişim kaybı, "sunucudakini al"). */
export async function dropWorkspace(sql: SqlExecutor, workspaceId: string): Promise<void> {
  await sql.run('DELETE FROM records WHERE workspace_id = ?', [workspaceId])
  await sql.run('DELETE FROM outbox WHERE workspace_id = ?', [workspaceId])
}
