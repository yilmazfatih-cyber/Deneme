/**
 * Yerel veritabanının ŞEMA GÖÇLERİ (migrations). Sürüm `PRAGMA user_version` içinde tutulur.
 * Kayıtların alanları burada tanımlanmaz (onlar shared/entities içindedir ve JSON olarak saklanır); burada yalnız
 * tablolar ve dizinler durur. Bu yüzden yeni varlık ya da alan eklemek göç GEREKTİRMEZ.
 *
 * Tablolar (web'deki Dexie deposuyla aynı üç tablo):
 *   records  görünen hâl (view_*) + sunucunun son bilinen hâli (server, JSON)       anahtar: alan + koleksiyon + kimlik
 *   outbox   gönderilmeyi bekleyen değişiklikler; `mid` AUTOINCREMENT → silinse de HİÇ geri gitmez (protokol şartı)
 *   meta     küçük değerler (cihaz kimliği, imleçler, alanlar…) JSON olarak
 *
 * Genişletme: yeni tablo/dizin gerekiyorsa listenin SONUNA yeni bir göç ekleyin (`npm run gen -- migration <ad>`
 * YOKTUR; elle: sürüm = son + 1). Yayınlanmış bir göçü DEĞİŞTİRMEYİN. Örnek ve test: test/store/schema.test.ts.
 */
import type { LocalDb } from './localDb.ts'
import type { SqlExecutor } from './sql.ts'

export interface Migration {
  readonly version: number
  /** Göçün kısa açıklaması (kural testi boş olmasını engeller). */
  readonly description: string
  readonly up: (sql: SqlExecutor) => Promise<void>
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    description: 'kayıtlar, giden kutusu, üst veri',
    up: async (sql) => {
      await sql.exec(`
        CREATE TABLE records (
          workspace_id TEXT NOT NULL,
          collection TEXT NOT NULL,
          id TEXT NOT NULL,
          view_data TEXT NOT NULL,
          view_deleted INTEGER NOT NULL DEFAULT 0,
          server TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (workspace_id, collection, id)
        );
        CREATE TABLE outbox (
          mid INTEGER PRIMARY KEY AUTOINCREMENT,
          workspace_id TEXT NOT NULL,
          collection TEXT NOT NULL,
          record_id TEXT NOT NULL,
          op TEXT NOT NULL,
          data TEXT,
          at TEXT NOT NULL
        );
        CREATE INDEX outbox_workspace ON outbox (workspace_id);
        CREATE TABLE meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
      `)
    },
  },
  // YENİ GÖÇ BURAYA: { version: 2, description: '…', up: async (sql) => { await sql.exec('ALTER TABLE …') } },
]

export class SchemaTooNewError extends Error {
  constructor(found: number, known: number) {
    super(`Veritabanı şeması (${found}) bu uygulamanın bildiğinden (${known}) yeni. Uygulamayı güncelleyin.`)
    this.name = 'SchemaTooNewError'
  }
}

/**
 * Eksik göçleri sırayla uygular. Her göç ve sürüm numarası TEK işlemdedir: göç yarıda hata verirse veritabanı
 * önceki sürümde kalır. Dönen değer son sürümdür.
 */
export async function migrate(db: LocalDb, migrations: readonly Migration[] = MIGRATIONS): Promise<number> {
  const latest = migrations.at(-1)?.version ?? 0
  const current = await db.read(
    async (sql) => (await sql.get<{ user_version: number }>('PRAGMA user_version'))?.user_version ?? 0,
  )
  if (current > latest) throw new SchemaTooNewError(current, latest)
  for (const migration of migrations) {
    if (migration.version <= current) continue
    await db.write(async (sql) => {
      await migration.up(sql)
      // PRAGMA parametre almaz; sürüm koddan gelen bir tam sayıdır (kullanıcı verisi değil).
      await sql.exec(`PRAGMA user_version = ${String(Math.trunc(migration.version))}`)
    })
  }
  return latest
}
