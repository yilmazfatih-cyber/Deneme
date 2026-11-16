/**
 * Migrasyon koşucusu: `api/migrations/NNNN_ad.sql` dosyalarını numara sırasıyla, her birini AYRI bir işlemde uygular.
 * Uygulananlar `_migrations` tablosunda (numara, ad, içerik özeti) tutulur; ikinci koşuda yeniden uygulanmaz.
 * Yarıda hata veren dosya bütünüyle geri alınır ve kaydedilmez.
 *
 * Kurallar (kural testi: test/rules.test.ts):
 *  - Ad biçimi `0001_kucuk_harf.sql`; numaralar 1'den başlar ve kesintisizdir.
 *  - Uygulanmış dosya DEĞİŞTİRİLMEZ (özet tutmazsa sunucu başlamaz); değişiklik için yeni dosya açılır.
 *  - Dosyada BEGIN/COMMIT yazılmaz; VACUUM ve `PRAGMA journal_mode` gibi işlem dışı komutlar kullanılmaz.
 *
 * Genişletme: yeni tablo için TARIFLER.md → "Yeni tablo / migrasyon ekle".
 */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Db } from './database.ts'

export const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations/', import.meta.url))

export const MIGRATION_FILE_PATTERN = /^(\d{4})_([a-z0-9_]+)\.sql$/

export interface MigrationFile {
  readonly version: number
  readonly file: string
  readonly sql: string
  readonly checksum: string
}

export class MigrationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'MigrationError'
  }
}

function checksumOf(sql: string): string {
  return createHash('sha256').update(sql.replaceAll('\r\n', '\n')).digest('hex')
}

/** Klasördeki migrasyon dosyalarını okur, adlarını ve sıralarını denetler. */
export function loadMigrations(dir: string = MIGRATIONS_DIR): MigrationFile[] {
  const files = readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .toSorted()
  const migrations: MigrationFile[] = []
  for (const file of files) {
    const match = MIGRATION_FILE_PATTERN.exec(file)
    if (!match) {
      throw new MigrationError(
        `Migrasyon dosya adı geçersiz: "${file}". Biçim: 0005_kisa_ad.sql (dört haneli numara, küçük harf, alt çizgi).`,
      )
    }
    const sql = readFileSync(join(dir, file), 'utf8')
    if (/^\s*(BEGIN|COMMIT|END|ROLLBACK)\b/im.test(sql)) {
      throw new MigrationError(
        `${file}: BEGIN/COMMIT yazmayın; koşucu her dosyayı zaten tek bir işlem içinde çalıştırır.`,
      )
    }
    migrations.push({ version: Number(match[1]), file, sql, checksum: checksumOf(sql) })
  }
  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new MigrationError(
        `Migrasyon numaraları kesintisiz olmalı: ${String(index + 1).padStart(4, '0')} bekleniyordu, "${migration.file}" bulundu.`,
      )
    }
  })
  return migrations
}

interface AppliedRow {
  version: number
  name: string
  checksum: string
}

export interface MigrateResult {
  /** Bu koşuda uygulanan dosyalar. */
  readonly applied: string[]
  /** Veritabanının son migrasyon numarası. */
  readonly version: number
}

/** Bekleyen migrasyonları uygular. Uygulanmış bir dosya değişmişse ya da eksikse hata verir. */
export function runMigrations(db: Db, options: { migrations?: MigrationFile[]; now?: () => Date } = {}): MigrateResult {
  const migrations = options.migrations ?? loadMigrations()
  const now = options.now ?? (() => new Date())
  db.exec(
    'CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TEXT NOT NULL) STRICT',
  )
  const appliedRows = db.all<AppliedRow>('SELECT version, name, checksum FROM _migrations ORDER BY version')
  const byVersion = new Map(migrations.map((migration) => [migration.version, migration]))
  for (const row of appliedRows) {
    const file = byVersion.get(row.version)
    if (!file) {
      throw new MigrationError(
        `Veritabanında uygulanmış "${row.name}" migrasyonu kod klasöründe yok. Veritabanı bu koddan daha yeni bir sürüme ait olabilir.`,
      )
    }
    if (file.checksum !== row.checksum) {
      throw new MigrationError(
        `"${file.file}" uygulandıktan sonra değiştirilmiş. Uygulanmış migrasyonu geri alın; değişikliği yeni numaralı bir dosyaya yazın.`,
      )
    }
  }
  const current = appliedRows.at(-1)?.version ?? 0
  const applied: string[] = []
  for (const migration of migrations) {
    if (migration.version <= current) continue
    try {
      db.transaction(() => {
        db.exec(migration.sql)
        db.run(
          'INSERT INTO _migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)',
          migration.version,
          migration.file,
          migration.checksum,
          now().toISOString(),
        )
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new MigrationError(`"${migration.file}" uygulanamadı ve geri alındı: ${reason}`, { cause: error })
    }
    applied.push(migration.file)
  }
  return { applied, version: migrations.at(-1)?.version ?? current }
}
