/**
 * Veritabanlarını açar, göçlerini uygular ve siler. Her veritabanı adı için TEK bağlantı açılır.
 *
 *   hesapsız kullanım  → `<APP.id>.yerel.db`             (alan `local`; sunucuya hiç gitmez)
 *   her kullanıcı      → `<APP.id>.kullanici.<id>.db`    (kayıtlar, giden kutusu, üst veri)
 *   cihaz ayarları     → `<APP.id>.cihaz.db`             (oturum kaydı, tema, karşılama; bkz. lib/device)
 *
 * Böylece aynı telefonda iki kişi birbirinin verisini görmez ve çıkışta veri karışmaz.
 * Testler sürücüyü değiştirir: `configureDrivers({ open: nodeDriver, remove: … })` (test/support/db.ts).
 *
 * Genişletme: yeni bir veritabanı türü gerekiyorsa adını burada üretin ve kendi göç listesini verin.
 */
import { APP } from '../../config.ts'
import { deleteExpoDatabase, openExpoDriver } from './expoDriver.ts'
import { LocalDb } from './localDb.ts'
import { migrate, MIGRATIONS, type Migration } from './schema.ts'
import type { SqlDriver } from './sql.ts'

export const LOCAL_DB_NAME = `${APP.id}.yerel.db`

/** Bir kullanıcının veritabanı. Kimlik `ID_PATTERN`'e uyduğu için ad güvenlidir. */
export function userDbName(userId: string): string {
  return `${APP.id}.kullanici.${userId}.db`
}

export interface Drivers {
  readonly open: (name: string) => Promise<SqlDriver>
  readonly remove: (name: string) => Promise<void>
}

let drivers: Drivers = { open: openExpoDriver, remove: deleteExpoDatabase }

/** Sürücüyü değiştirir (yalnız testler). */
export function configureDrivers(next: Drivers): void {
  drivers = next
}

const opened = new Map<string, Promise<LocalDb>>()

/** Veritabanını açar ve göçlerini uygular; aynı ad için hep aynı bağlantıyı döndürür. */
export function openLocalDb(name: string, migrations: readonly Migration[] = MIGRATIONS): Promise<LocalDb> {
  let pending = opened.get(name)
  if (!pending) {
    pending = (async () => {
      const db = new LocalDb(name, await drivers.open(name))
      await migrate(db, migrations)
      return db
    })()
    pending.catch(() => opened.delete(name))
    opened.set(name, pending)
  }
  return pending
}

/** Bağlantıyı kapatır ve dosyayı siler ("bu cihazdaki veriyi de sil"). */
export async function deleteLocalDb(name: string): Promise<void> {
  const pending = opened.get(name)
  opened.delete(name)
  if (pending) {
    const db = await pending.catch(() => null)
    await db?.close().catch(() => undefined)
  }
  await drivers.remove(name)
}

/** Açık bütün bağlantıları kapatır (testler ve uygulama kapanışı). */
export async function closeAllDbs(): Promise<void> {
  const all = [...opened.values()]
  opened.clear()
  for (const pending of all) {
    const db = await pending.catch(() => null)
    await db?.close().catch(() => undefined)
  }
}
