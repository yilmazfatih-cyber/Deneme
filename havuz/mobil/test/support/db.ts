/**
 * Test veritabanları: her test kendi boş, göçleri uygulanmış veritabanını açar (node:sqlite, bellekte).
 * Uygulamanın veritabanı kaydı (databases.ts) da node sürücüsüne yönlendirilir (ekran testleri için).
 */
import { uuidv7 } from '@uygulama/shared'
import { configureDrivers, openLocalDb } from '../../src/lib/store/databases.ts'
import type { LocalDb } from '../../src/lib/store/localDb.ts'
import type { Migration } from '../../src/lib/store/schema.ts'
import { openNodeDriver } from './nodeDriver.ts'

configureDrivers({ open: async () => openNodeDriver(), remove: async () => undefined })

/** Her çağrıda yeni, boş bir veritabanı. */
export function freshDb(migrations?: readonly Migration[]): Promise<LocalDb> {
  return openLocalDb(`test-${uuidv7()}.db`, migrations)
}

/** JSON gidiş-dönüşü: ağdaki gibi derin kopya ve yalnız JSON'a uygun değerler. */
export function viaJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
