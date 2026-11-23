/**
 * Test sürücüsü: Node'un yerleşik SQLite'ı (`node:sqlite`) ile sql.ts arayüzü. Uygulamadaki expo-sqlite ile AYNI
 * SQL çalışır; böylece depo ve eşitleme testleri telefonsuz ve gerçek bir SQLite motoruyla koşar.
 * `process.getBuiltinModule` kullanılır: Jest'in modül çözücüsü `node:sqlite` adını tanımıyor.
 */
import type { SqlDriver, SqlValue } from '../../src/lib/store/sql.ts'

const sqlite = process.getBuiltinModule('node:sqlite')

/** Bellek içi (ya da verilen dosyadaki) veritabanını açar. */
export function openNodeDriver(path = ':memory:'): SqlDriver {
  const db = new sqlite.DatabaseSync(path)
  const params = (values: readonly SqlValue[] | undefined) => (values ?? []) as SqlValue[]
  return {
    exec: async (source) => {
      db.exec(source)
    },
    run: async (source, values) => {
      const result = db.prepare(source).run(...params(values))
      return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) }
    },
    all: async <T>(source: string, values?: readonly SqlValue[]) => db.prepare(source).all(...params(values)) as T[],
    get: async <T>(source: string, values?: readonly SqlValue[]) =>
      (db.prepare(source).get(...params(values)) as T | undefined) ?? null,
    close: async () => {
      db.close()
    },
  }
}
