/**
 * Üst veri: veritabanı başına tutulan küçük değerler (cihaz kimliği, imleçler, alanlar…).
 * Her anahtarın şeması ve varsayılanı aşağıdadır; okurken şemayla doğrulanır, bozuksa varsayılan döner.
 *
 * Genişletme: yeni bir değer için META_SCHEMAS ve META_DEFAULTS'a birer satır ekleyin (TypeScript eksik olanı gösterir).
 */
import { errorBodySchema, uuidv7, workspaceInfoSchema } from '@uygulama/shared'
import { z } from 'zod'
import type { AppDb } from './db.ts'

/** Sunucunun reddettiği bir değişikliğin kaydı (Ayarlar → Eşitleme ekranında gösterilir). */
export const rejectionSchema = z.object({
  at: z.string(),
  code: errorBodySchema.shape.error.shape.code,
  message: z.string(),
  workspaceId: z.string(),
  collection: z.string(),
  recordId: z.string(),
  op: z.string(),
})
export type Rejection = z.infer<typeof rejectionSchema>

const META_SCHEMAS = {
  /** Bu veritabanının (cihazın) kimliği. İlk açılışta üretilir, hiç değişmez. */
  clientId: z.string().nullable(),
  /** Alan kimliği → görülen son `rev`. */
  cursors: z.record(z.string(), z.number().int().nonnegative()),
  /** Kullanıcının üyesi olduğu alanlar (son eşitlemedeki hâliyle). */
  workspaces: z.array(workspaceInfoSchema),
  /** Sunucusu eski yedeğe dönmüş alanlar: kullanıcı karar verene dek eşitleme durur. */
  resetWorkspaceIds: z.array(z.string()),
  /** Arayüzde seçili alan; `null` ise kişisel alan kullanılır. */
  currentWorkspaceId: z.string().nullable(),
  /** Son başarılı eşitlemenin zamanı (ISO). */
  lastSyncedAt: z.string().nullable(),
  /** Reddedilen son değişiklikler (en yenisi sonda, en çok 20). */
  rejections: z.array(rejectionSchema),
  /** Çok sekmede eşitleme kilidinin yedeği (Web Locks yoksa): kim tutuyor, ne zamana dek. */
  syncLease: z.object({ owner: z.string(), until: z.number() }).nullable(),
  /** "Bu cihazdaki kayıtları hesabıma taşı" önerisi bu hesapta bir kez kapatıldı mı. */
  migrationDismissed: z.boolean(),
  // YENİ ÜST VERİ BURAYA
} as const

export type MetaKey = keyof typeof META_SCHEMAS
export type MetaValue<K extends MetaKey> = z.infer<(typeof META_SCHEMAS)[K]>

const META_DEFAULTS: { readonly [K in MetaKey]: MetaValue<K> } = {
  clientId: null,
  cursors: {},
  workspaces: [],
  resetWorkspaceIds: [],
  currentWorkspaceId: null,
  lastSyncedAt: null,
  rejections: [],
  syncLease: null,
  migrationDismissed: false,
}

export const MAX_REJECTIONS = 20

export async function getMeta<K extends MetaKey>(db: AppDb, key: K): Promise<MetaValue<K>> {
  const row = await db.meta.get(key)
  if (row === undefined) return META_DEFAULTS[key]
  const parsed = META_SCHEMAS[key].safeParse(row.value)
  return parsed.success ? (parsed.data as MetaValue<K>) : META_DEFAULTS[key]
}

export async function setMeta<K extends MetaKey>(db: AppDb, key: K, value: MetaValue<K>): Promise<void> {
  await db.meta.put({ key, value })
}

/** Cihaz kimliğini döndürür; yoksa üretir. İki sekme aynı anda açılırsa ikisi de aynı kimliği görür (tek işlem). */
export async function ensureClientId(db: AppDb): Promise<string> {
  return db.transaction('rw', db.meta, async () => {
    const existing = await getMeta(db, 'clientId')
    if (existing !== null) return existing
    const created = uuidv7()
    await setMeta(db, 'clientId', created)
    return created
  })
}
