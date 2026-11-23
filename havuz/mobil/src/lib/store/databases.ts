/**
 * Veritabanlarını açar, göçlerini uygular ve siler. Her veritabanı adı için TEK bağlantı açılır.
 *
 *   hesapsız kullanım  → `yerel.db`                    (alan `local`; sunucuya hiç gitmez)
 *   her kullanıcı      → `kullanici-<kimlik>.db`       (kayıtlar, giden kutusu, üst veri)
 *   cihaz ayarları     → `cihaz.db`                    (oturum kaydı, tema, karşılama; bkz. lib/device)
 *
 * Böylece aynı telefonda iki kişi birbirinin verisini görmez ve çıkışta veri karışmaz. Adlar KISADIR: web'deki
 * SQLite (wa-sqlite) yolu en çok 64 karakter kabul eder ve "-journal" eki de sığmalıdır (kural testi: MAX_DB_NAME).
 * Telefonda her uygulamanın kendi klasörü olduğu için ada uygulama öneki gerekmez.
 * Testler sürücüyü değiştirir: `configureDrivers({ open: nodeDriver, remove: … })` (test/support/db.ts).
 *
 * Genişletme: yeni bir veritabanı türü gerekiyorsa adını burada üretin ve kendi göç listesini verin.
 */
import { deleteExpoDatabase, openExpoDriver } from './expoDriver.ts'
import { LocalDb } from './localDb.ts'
import { migrate, MIGRATIONS, type Migration } from './schema.ts'
import type { SqlDriver } from './sql.ts'

export const LOCAL_DB_NAME = 'yerel.db'

/** Veritabanı adının en çok uzunluğu: "/" + ad + "-journal" ≤ 64 (wa-sqlite mxPathname). */
export const MAX_DB_NAME = 64 - 1 - '-journal'.length

/** 64 bitlik FNV-1a özeti (16 onaltılık hane): uzun kimlikten kısa, kararlı ad üretir. */
function fnv1a64(text: string): string {
  let hash = 0xcbf29ce484222325n
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= BigInt(byte)
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn
  }
  return hash.toString(16).padStart(16, '0')
}

/** Bir kullanıcının veritabanı. UUID tirelerden arındırılır (32 hane); çok uzun kimlik özetlenir. */
export function userDbName(userId: string): string {
  const compact = userId.replaceAll('-', '')
  return `kullanici-${compact.length <= 32 ? compact : fnv1a64(userId)}.db`
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

/**
 * Bağlantıyı kapatır (dosya kalır). Kullanılmayan veritabanı açık bırakılmaz: web'de (OPFS) aynı anda açık
 * dosya sayısı sınırlıdır (expo-sqlite AccessHandlePoolVFS: 6 dosya); telefonda da bellek ve dosya tutamağı boşalır.
 */
export async function closeLocalDb(name: string): Promise<void> {
  const pending = opened.get(name)
  if (!pending) return
  opened.delete(name)
  const db = await pending.catch(() => null)
  await db?.close().catch(() => undefined)
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
