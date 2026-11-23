/**
 * Yerel veritabanı bağlantısı: bütün okuma/yazmaları SIRAYA koyar ve yazmaları işlem (transaction) içinde yapar.
 *
 * Neden sıra? expo-sqlite'ta aynı bağlantıda açık bir işlem varken başka yerden gelen sorgu O İŞLEME KATILIR
 * (yarım yazmayı görür ya da geri alınınca kaybolur). Burada her iş bir öncekinin bitmesini bekler; böylece
 * her okuma tutarlı bir anlık görüntü görür ve her yazma ya bütünüyle olur ya hiç olmaz.
 *
 *   await db.read((sql) => sql.all('SELECT …', [a]))
 *   await db.write(async (sql) => { await sql.run('INSERT …', [a]); … })   // BEGIN … COMMIT / ROLLBACK
 *
 * Değişiklik bildirimi: yazma bitince (COMMIT'ten sonra) değişen tabloların adları dinleyicilere iletilir;
 * canlı okuma kancaları (hooks.ts) bununla yenilenir. Tablolar SQL'den kendiliğinden bulunur (sql.ts → writtenTable).
 *
 * TUZAK: `read`/`write` içinden YENİDEN `db.read`/`db.write` çağırmayın — sıra kendini bekler ve kilitlenir.
 * İşlem içinde verilen `sql` nesnesini kullanın (ör. `getMeta(sql, 'cursors')`).
 */
import type { SqlDriver, SqlExecutor, SqlRunResult, SqlValue } from './sql.ts'
import { writtenTable } from './sql.ts'

export type ChangeListener = (tables: ReadonlySet<string>) => void

/** Yazmaları izleyen sarmalayıcı: hangi tabloda satır değişti? Okuma işinde yazma denenirse hata verir. */
function tracking(driver: SqlExecutor, changed: Set<string> | null): SqlExecutor {
  return {
    exec: async (source) => {
      if (changed === null) throw new Error('db.read içinde yazılamaz: db.write kullanın.')
      await driver.exec(source)
      changed.add('*')
    },
    run: async (source: string, params?: readonly SqlValue[]): Promise<SqlRunResult> => {
      const table = writtenTable(source)
      if (table !== null && changed === null) throw new Error('db.read içinde yazılamaz: db.write kullanın.')
      const result = await driver.run(source, params)
      if (table !== null && result.changes > 0) changed?.add(table)
      return result
    },
    all: (source, params) => driver.all(source, params),
    get: (source, params) => driver.get(source, params),
  }
}

export class LocalDb {
  readonly name: string
  private readonly driver: SqlDriver
  private tail: Promise<unknown> = Promise.resolve()
  private readonly changeListeners = new Set<ChangeListener>()
  private readonly writeListeners = new Set<() => void>()
  private closed = false

  constructor(name: string, driver: SqlDriver) {
    this.name = name
    this.driver = driver
  }

  /** Okuma: sıradaki işler bitince çalışır; içinden yazma yapılamaz. */
  read<T>(task: (sql: SqlExecutor) => Promise<T>): Promise<T> {
    return this.enqueue(() => task(tracking(this.driver, null)))
  }

  /** Yazma: tek işlem (BEGIN … COMMIT). Hata olursa her şey geri alınır (ROLLBACK) ve hata yeniden fırlatılır. */
  write<T>(task: (sql: SqlExecutor) => Promise<T>): Promise<T> {
    return this.enqueue(async () => {
      const changed = new Set<string>()
      await this.driver.exec('BEGIN IMMEDIATE')
      let result: T
      try {
        result = await task(tracking(this.driver, changed))
        await this.driver.exec('COMMIT')
      } catch (error) {
        await this.driver.exec('ROLLBACK').catch(() => undefined)
        throw error
      }
      if (changed.size > 0) this.emit(changed)
      return result
    })
  }

  /** Tablo değişikliklerini dinler (yazma işlemi bittikten sonra). Dönen işlev aboneliği bitirir. */
  subscribe(listener: ChangeListener): () => void {
    this.changeListeners.add(listener)
    return () => this.changeListeners.delete(listener)
  }

  /** Bu cihazda yapılan ve sunucuya gidecek her yerel yazmadan sonra çağrılır (eşitleme bununla tetiklenir). */
  onLocalWrite(listener: () => void): () => void {
    this.writeListeners.add(listener)
    return () => this.writeListeners.delete(listener)
  }

  notifyLocalWrite(): void {
    for (const listener of this.writeListeners) listener()
  }

  /** Bağlantıyı kapatır (sıradaki işler bittikten sonra). Kapalı bağlantıya gelen iş hata verir. */
  close(): Promise<void> {
    return this.enqueue(async () => {
      this.closed = true
      this.changeListeners.clear()
      this.writeListeners.clear()
      await this.driver.close()
    })
  }

  get isClosed(): boolean {
    return this.closed
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      if (this.closed) throw new Error(`Veritabanı kapalı: ${this.name}`)
      return task()
    }
    const result = this.tail.then(run, run)
    this.tail = result.catch(() => undefined)
    return result
  }

  private emit(tables: ReadonlySet<string>): void {
    for (const listener of this.changeListeners) {
      try {
        listener(tables)
      } catch (error) {
        console.error('Veritabanı dinleyicisi hata verdi:', error)
      }
    }
  }
}
