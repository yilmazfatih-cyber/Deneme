/**
 * Veritabanı sarmalayıcısı: Node'un yerleşik `node:sqlite` (DatabaseSync) sürücüsünün ince bir katmanı.
 * Bütün SQL buradan geçer; sürücü ileride değişirse yalnız bu dosya değişir.
 *
 * Kurallar:
 *  - SQL HER ZAMAN parametreli yazılır: `db.get('... WHERE id = ?', id)`. Metne değer eklemek (`${id}`) YASAKTIR.
 *  - Birden çok yazma içeren iş `db.transaction(() => { ... })` içinde yapılır; hata olursa hepsi geri alınır.
 *  - İşlem (transaction) işlevi EŞZAMANLIDIR: içinde `await` kullanılamaz (sarmalayıcı yakalar ve hata verir).
 *  - Mantıksal değerler 0/1 olarak saklanır (`node:sqlite` true/false bağlamaz).
 *
 * Genişletme: yeni bir sürücü özelliği gerekiyorsa `Db` arayüzüne yöntem ekleyin ve testini
 * test/db.test.ts içine yazın.
 */
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync, type StatementSync } from 'node:sqlite'

/** SQL parametresi olarak bağlanabilecek değerler. */
export type SqlValue = string | number | bigint | null | Uint8Array

export interface RunResult {
  readonly changes: number
  readonly lastInsertRowid: number
}

export interface Db {
  /** Dosya yolu; bellek içi veritabanında ':memory:'. */
  readonly path: string
  /** Tek satır döndürür; yoksa `undefined`. */
  get<T>(sql: string, ...params: SqlValue[]): T | undefined
  /** Bütün satırları döndürür. */
  all<T>(sql: string, ...params: SqlValue[]): T[]
  /** INSERT / UPDATE / DELETE çalıştırır. */
  run(sql: string, ...params: SqlValue[]): RunResult
  /** Parametresiz, çok deyimli SQL (migrasyonlar). Kullanıcı girdisiyle ASLA kullanılmaz. */
  exec(sql: string): void
  /**
   * `fn` bir işlem içinde koşar: başarıyla biterse kaydedilir, hata fırlatırsa geri alınır.
   * Dış işlem `BEGIN IMMEDIATE` ile açılır (yazma kilidi baştan alınır; eşzamanlı yazmalar sıraya girer).
   * İç içe çağrılar SAVEPOINT kullanır.
   */
  transaction<T>(fn: () => T): T
  readonly inTransaction: boolean
  close(): void
}

export interface OpenOptions {
  /** Kilit bekleme süresi (ms). Başka bağlantı yazarken bu kadar beklenir, sonra SQLITE_BUSY. */
  readonly busyTimeoutMs?: number
}

function isPromiseLike(value: unknown): boolean {
  return typeof value === 'object' && value !== null && typeof (value as { then?: unknown }).then === 'function'
}

class SqliteDb implements Db {
  readonly path: string
  private readonly raw: DatabaseSync
  private readonly statements = new Map<string, StatementSync>()
  private depth = 0

  constructor(path: string, options: OpenOptions) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.path = path
    this.raw = new DatabaseSync(path)
    // WAL: okuyucular yazanı beklemez. NORMAL: WAL ile güvenli ve hızlı (güç kesilirse son işlem kaybolabilir,
    // veritabanı bozulmaz). foreign_keys: SQLite'ta varsayılan KAPALIDIR, her bağlantıda açılmalıdır.
    this.raw.exec('PRAGMA journal_mode = WAL')
    this.raw.exec('PRAGMA synchronous = NORMAL')
    this.raw.exec('PRAGMA foreign_keys = ON')
    this.raw.exec(`PRAGMA busy_timeout = ${Math.trunc(options.busyTimeoutMs ?? 5000)}`)
  }

  get inTransaction(): boolean {
    return this.raw.isTransaction
  }

  private statement(sql: string): StatementSync {
    let statement = this.statements.get(sql)
    if (!statement) {
      statement = this.raw.prepare(sql)
      this.statements.set(sql, statement)
    }
    return statement
  }

  get<T>(sql: string, ...params: SqlValue[]): T | undefined {
    return this.statement(sql).get(...params) as T | undefined
  }

  all<T>(sql: string, ...params: SqlValue[]): T[] {
    return this.statement(sql).all(...params) as T[]
  }

  run(sql: string, ...params: SqlValue[]): RunResult {
    const result = this.statement(sql).run(...params)
    return { changes: Number(result.changes), lastInsertRowid: Number(result.lastInsertRowid) }
  }

  exec(sql: string): void {
    this.raw.exec(sql)
  }

  transaction<T>(fn: () => T): T {
    const nested = this.depth > 0
    const savepoint = `sp_${this.depth}`
    this.raw.exec(nested ? `SAVEPOINT ${savepoint}` : 'BEGIN IMMEDIATE')
    this.depth += 1
    try {
      const result = fn()
      if (isPromiseLike(result)) {
        throw new Error(
          'db.transaction içinde await/Promise kullanılamaz: işlem eşzamanlı olmalı. Ağ/e-posta işini işlemden sonra yapın.',
        )
      }
      this.raw.exec(nested ? `RELEASE ${savepoint}` : 'COMMIT')
      return result
    } catch (error) {
      if (nested) {
        this.raw.exec(`ROLLBACK TO ${savepoint}`)
        this.raw.exec(`RELEASE ${savepoint}`)
      } else if (this.raw.isTransaction) {
        this.raw.exec('ROLLBACK')
      }
      throw error
    } finally {
      this.depth -= 1
    }
  }

  close(): void {
    this.statements.clear()
    if (this.raw.isOpen) this.raw.close()
  }
}

/** Veritabanını açar (dosya yoksa oluşturur, klasörünü de açar). Testlerde `':memory:'` verilir. */
export function openDatabase(path: string, options: OpenOptions = {}): Db {
  return new SqliteDb(path, options)
}

/** 0/1 → boolean. SQLite mantıksal değeri tamsayı saklar. */
export function toBool(value: number | bigint): boolean {
  return Number(value) === 1
}

/** boolean → 0/1. */
export function fromBool(value: boolean): number {
  return value ? 1 : 0
}
