import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { MIGRATIONS } from './schema.ts'

export type DB = DatabaseSync
export type Param = SQLInputValue | boolean | undefined

/** Veritabanını açar, SQLite ayarlarını yapar ve bekleyen şema sürümlerini uygular. */
export function openDb(path: string): DB {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;')
  migrate(db)
  return db
}

export function migrate(db: DB): number {
  const current = Number((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version)
  for (let v = current; v < MIGRATIONS.length; v++) {
    tx(db, () => {
      db.exec(MIGRATIONS[v]!)
      db.exec(`PRAGMA user_version = ${v + 1}`)
    })
  }
  return MIGRATIONS.length
}

const norm = (params: Param[]): SQLInputValue[] =>
  params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? (p ? 1 : 0) : p))

export function all<T>(db: DB, sql: string, ...params: Param[]): T[] {
  return db.prepare(sql).all(...norm(params)) as T[]
}

export function get<T>(db: DB, sql: string, ...params: Param[]): T | undefined {
  return db.prepare(sql).get(...norm(params)) as T | undefined
}

export function run(db: DB, sql: string, ...params: Param[]): { changes: number; id: number } {
  const r = db.prepare(sql).run(...norm(params))
  return { changes: Number(r.changes), id: Number(r.lastInsertRowid) }
}

/** Nesne alanlarından INSERT üretir; undefined alanlar atlanır. Yeni satırın id'sini döner. */
export function insert(db: DB, table: string, row: Record<string, Param>): number {
  const keys = Object.keys(row).filter((k) => row[k] !== undefined)
  const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
  return run(db, sql, ...keys.map((k) => row[k])).id
}

/** Yalnız izin verilen alanları günceller. */
export function update(db: DB, table: string, id: number, patch: Record<string, Param>, allowed: string[]): number {
  const keys = Object.keys(patch).filter((k) => allowed.includes(k) && patch[k] !== undefined)
  if (keys.length === 0) return 0
  const sql = `UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`
  return run(db, sql, ...keys.map((k) => patch[k]), id).changes
}

const depth = new WeakMap<DB, number>()

/** Eşzamanlı (senkron) işlem bloğu. İç içe çağrılar SAVEPOINT kullanır. fn içinde await kullanılmaz. */
export function tx<T>(db: DB, fn: () => T): T {
  const d = depth.get(db) ?? 0
  const sp = `sp_${d}`
  db.exec(d === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${sp}`)
  depth.set(db, d + 1)
  try {
    const result = fn()
    if (result instanceof Promise) throw new Error('tx() içinde async fonksiyon kullanılamaz')
    db.exec(d === 0 ? 'COMMIT' : `RELEASE ${sp}`)
    return result
  } catch (err) {
    db.exec(d === 0 ? 'ROLLBACK' : `ROLLBACK TO ${sp}; RELEASE ${sp}`)
    throw err
  } finally {
    depth.set(db, d)
  }
}

export function audit(
  db: DB,
  e: {
    orgId: number | null
    userId?: number | null
    action: string
    entity?: string
    entityId?: number
    detail?: unknown
  },
) {
  insert(db, 'audit_log', {
    org_id: e.orgId,
    user_id: e.userId ?? null,
    action: e.action,
    entity: e.entity,
    entity_id: e.entityId,
    detail: e.detail === undefined ? null : typeof e.detail === 'string' ? e.detail : JSON.stringify(e.detail),
  })
}
