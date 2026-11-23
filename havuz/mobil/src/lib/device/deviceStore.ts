/**
 * Cihaz ayarları: oturum kaydı (kim giriş yaptı), karşılama geçildi mi, tema seçimi. Kullanıcı veritabanlarından
 * AYRI küçük bir veritabanında durur (`cihaz.db`, tablo `kv`). Uygulama açılınca hangi kullanıcı
 * veritabanının açılacağını buradan öğrenir. Oturum BELİRTECİ burada DEĞİL, güvenli depodadır (session/tokenStore.ts).
 *
 * Genişletme: yeni bir cihaz ayarı → DEVICE_SCHEMAS ve DEVICE_DEFAULTS'a birer satır (TypeScript eksik olanı gösterir).
 */
import { userSchema } from '@uygulama/shared'
import { z } from 'zod'
import { THEME_CHOICES } from '../../ui/theme.tsx'
import { openLocalDb } from '../store/databases.ts'
import type { LocalDb } from '../store/localDb.ts'
import type { Migration } from '../store/schema.ts'

export const DEVICE_DB_NAME = 'cihaz.db'

export const DEVICE_MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    description: 'cihaz ayarları (anahtar → JSON değer)',
    up: (sql) => sql.exec('CREATE TABLE kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)'),
  },
  // YENİ GÖÇ BURAYA
]

export const storedSessionSchema = z.object({
  userId: z.string(),
  user: userSchema,
  /** Sunucu oturumu geçersiz saydı (401): veri yerinde durur, eşitleme yeniden giriş yapılınca sürer. */
  expired: z.boolean().default(false),
  /** Girişin yapıldığı an (her girişte yeni eşitleme motoru kurulur). */
  since: z.string(),
})
export type StoredSession = z.infer<typeof storedSessionSchema>

const DEVICE_SCHEMAS = {
  session: storedSessionSchema.nullable(),
  welcomeDone: z.boolean(),
  theme: z.enum(THEME_CHOICES),
  // YENİ CİHAZ AYARI BURAYA
} as const

export type DeviceKey = keyof typeof DEVICE_SCHEMAS
export type DeviceValue<K extends DeviceKey> = z.infer<(typeof DEVICE_SCHEMAS)[K]>

const DEVICE_DEFAULTS: { readonly [K in DeviceKey]: DeviceValue<K> } = {
  session: null,
  welcomeDone: false,
  theme: 'system',
}

export function openDeviceDb(): Promise<LocalDb> {
  return openLocalDb(DEVICE_DB_NAME, DEVICE_MIGRATIONS)
}

export async function getDeviceValue<K extends DeviceKey>(db: LocalDb, key: K): Promise<DeviceValue<K>> {
  const row = await db.read((sql) => sql.get<{ value: string }>('SELECT value FROM kv WHERE key = ?', [key]))
  if (row === null) return DEVICE_DEFAULTS[key]
  try {
    const parsed = DEVICE_SCHEMAS[key].safeParse(JSON.parse(row.value))
    return parsed.success ? (parsed.data as DeviceValue<K>) : DEVICE_DEFAULTS[key]
  } catch {
    return DEVICE_DEFAULTS[key]
  }
}

export async function setDeviceValue<K extends DeviceKey>(db: LocalDb, key: K, value: DeviceValue<K>): Promise<void> {
  await db.write((sql) =>
    sql.run('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', [
      key,
      JSON.stringify(value),
    ]),
  )
}

/** Uygulama açılırken gereken bütün cihaz ayarları (tek seferde). */
export async function readDeviceState(db: LocalDb) {
  return {
    session: await getDeviceValue(db, 'session'),
    welcomeDone: await getDeviceValue(db, 'welcomeDone'),
    theme: await getDeviceValue(db, 'theme'),
  }
}
