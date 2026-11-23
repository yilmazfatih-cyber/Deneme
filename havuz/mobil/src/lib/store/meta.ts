/**
 * Üst veri: veritabanı başına tutulan küçük değerler (cihaz kimliği, imleçler, alanlar…), `meta` tablosunda JSON.
 * Her anahtarın şeması ve varsayılanı aşağıdadır; okurken şemayla doğrulanır, bozuksa varsayılan döner.
 * Okuma/yazma bir `sql` yürütücüsüyle yapılır ki eşitleme işleminin İÇİNDE de kullanılabilsin.
 *
 * Genişletme: yeni bir değer için META_SCHEMAS ve META_DEFAULTS'a birer satır ekleyin (TypeScript eksik olanı gösterir).
 */
import { errorBodySchema, uuidv7, workspaceInfoSchema } from '@uygulama/shared'
import { z } from 'zod'
import type { LocalDb } from './localDb.ts'
import type { SqlExecutor } from './sql.ts'

/** Sunucunun reddettiği bir değişikliğin kaydı (Ayarlar → Eşitleme bölümünde gösterilir). */
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
}

export const MAX_REJECTIONS = 20

export async function getMeta<K extends MetaKey>(sql: SqlExecutor, key: K): Promise<MetaValue<K>> {
  const row = await sql.get<{ value: string }>('SELECT value FROM meta WHERE key = ?', [key])
  if (row === null) return META_DEFAULTS[key]
  let raw: unknown
  try {
    raw = JSON.parse(row.value)
  } catch {
    return META_DEFAULTS[key]
  }
  const parsed = META_SCHEMAS[key].safeParse(raw)
  return parsed.success ? (parsed.data as MetaValue<K>) : META_DEFAULTS[key]
}

export async function setMeta<K extends MetaKey>(sql: SqlExecutor, key: K, value: MetaValue<K>): Promise<void> {
  await sql.run('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', [
    key,
    JSON.stringify(value),
  ])
}

/** Cihaz kimliğini döndürür; yoksa üretir ve saklar (tek işlemde). */
export async function ensureClientId(db: LocalDb): Promise<string> {
  const existing = await db.read((sql) => getMeta(sql, 'clientId'))
  if (existing !== null) return existing
  return db.write(async (sql) => {
    const again = await getMeta(sql, 'clientId')
    if (again !== null) return again
    const created = uuidv7()
    await setMeta(sql, 'clientId', created)
    return created
  })
}
