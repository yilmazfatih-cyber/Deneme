/**
 * SQL sürücüsü arayüzü: yerel depo SQLite'a YALNIZ bu ince arayüzden ulaşır.
 *   - Uygulamada: expo-sqlite (expoDriver.ts; telefonda dosya, web'de OPFS).
 *   - Testlerde: Node'un yerleşik `node:sqlite`'ı (test/support/nodeDriver.ts).
 * Böylece depo ve eşitleme mantığı telefonsuz, hızlı ve gerçek bir SQLite motoruyla sınanır.
 *
 * Kural: SQL her zaman PARAMETRELİ yazılır (`?`); değer metne eklenmez. `exec` yalnız sabit SQL içindir (göçler).
 * Genişletme: yeni bir sürücü (ör. başka bir SQLite kütüphanesi) bu arayüzü gerçekleyen bir dosyadır.
 */

export type SqlValue = string | number | null

export interface SqlRunResult {
  /** Değişen satır sayısı. */
  readonly changes: number
  /** Son eklenen satırın kimliği (AUTOINCREMENT sütunu). */
  readonly lastInsertRowId: number
}

/** Tek bağlantı üstünde SQL çalıştırır. */
export interface SqlExecutor {
  /** Sabit SQL (birden çok deyim olabilir). Parametre almaz; kullanıcı verisi buraya KONMAZ. */
  exec(source: string): Promise<void>
  run(source: string, params?: readonly SqlValue[]): Promise<SqlRunResult>
  all<T>(source: string, params?: readonly SqlValue[]): Promise<T[]>
  get<T>(source: string, params?: readonly SqlValue[]): Promise<T | null>
}

export interface SqlDriver extends SqlExecutor {
  close(): Promise<void>
}

/** Bir SQL deyiminin yazdığı tablo (`INSERT INTO x`, `UPDATE x`, `DELETE FROM x`, `REPLACE INTO x`); okumaysa null. */
export function writtenTable(source: string): string | null {
  const match =
    /^\s*(?:INSERT(?:\s+OR\s+\w+)?\s+INTO|REPLACE\s+INTO|UPDATE(?:\s+OR\s+\w+)?|DELETE\s+FROM)\s+"?(\w+)"?/i.exec(
      source,
    )
  return match?.[1] ?? null
}
