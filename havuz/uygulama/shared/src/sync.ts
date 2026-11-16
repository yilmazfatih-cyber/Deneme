/**
 * Eşitleme protokolü (sürüm 1): şemalar ve "bir değişikliği bir kayda uygula" saf mantığı.
 *
 * Fikir (ayrıntı: docs/ESITLEME.md):
 *  - İstemci her yazmayı önce yerelde uygular, sonra "değişiklik" (mutation) olarak giden kutusuna koyar.
 *  - `POST /api/sync` tek uçtur: bekleyen değişiklikleri gönderir, imleçten (cursor) sonraki kayıtları alır.
 *  - Sunucu değişiklikleri VARIŞ SIRASIYLA uygular; her alan için son yazan kazanır (alan düzeyinde LWW).
 *  - Kayıt silinmez, `deleted` işaretlenir (mezar taşı); böylece silme öteki cihazlara da ulaşır ve geri alınabilir.
 *
 * `applyMutation` hem sunucuda hem istemcide AYNI koddur; iki taraf aynı sonuca böyle varır.
 *
 * Genişletme: yeni bir işlem türü (op) eklemek protokol değişikliğidir → PROTOCOL_VERSION artırılır, hem
 * `mutationSchema` hem `applyMutation` hem de testler (shared/test/sync.test.ts, testing/conformance.ts) güncellenir.
 */
import { z } from 'zod'
import { workspaceInfoSchema } from './api.ts'
import { ENTITIES, getEntity, type EntityRegistry } from './entities/index.ts'
import { collectionNameSchema } from './entity.ts'
import { ERROR_CODES, ERROR_MESSAGES_TR, issuesToDetails, type ErrorCode } from './errors.ts'
import { idSchema } from './ids.ts'

export const PROTOCOL_VERSION = 1

export const SYNC_LIMITS = {
  /** Tek istekte gönderilebilecek değişiklik sayısı. Fazlası sonraki isteğe kalır. */
  maxMutationsPerRequest: 100,
  /** Tek yanıtta alan başına dönen kayıt sayısı. Fazlası için yanıtta `more: true` gelir. */
  maxChangesPerWorkspace: 500,
  /** Bir kaydın JSON boyutu sınırı (bayt). */
  maxRecordBytes: 64 * 1024,
} as const

export type JsonObject = Record<string, unknown>

const jsonObjectSchema = z.record(z.string(), z.unknown())

// ── Değişiklik (mutation) ────────────────────────────────────────────────────────────────────────

const mutationBase = {
  /** Giden kutusu sıra numarası: her cihazda 1'den başlar, hep artar. Sunucu yinelenen gönderimi bununla ayıklar. */
  mid: z.number().int().positive(),
  workspaceId: idSchema,
  collection: collectionNameSchema,
  recordId: idSchema,
  /** İstemci saati; yalnız bilgi içindir. Sıra, sunucuya varış sırasıdır. */
  at: z.iso.datetime(),
}

export const mutationSchema = z.discriminatedUnion('op', [
  /** Kaydı bütünüyle yaz (oluştur ya da üzerine yaz). Silinmiş kaydı da geri getirir. */
  z.object({ ...mutationBase, op: z.literal('put'), data: jsonObjectSchema }),
  /** Yalnız verilen alanları değiştir. Düzenlemelerde HEP bu kullanılır ki öteki alanlar ezilmesin. */
  z.object({ ...mutationBase, op: z.literal('patch'), data: jsonObjectSchema }),
  /** Kaydı silinmiş işaretle. */
  z.object({ ...mutationBase, op: z.literal('delete') }),
  /** Silmeyi geri al. */
  z.object({ ...mutationBase, op: z.literal('restore') }),
])
export type Mutation = z.infer<typeof mutationSchema>

/** Bir değişikliğin "ne yapılacak" kısmı (kime/ne zaman bilgisi olmadan). `Mutation` buna atanabilir. */
export type MutationIntent =
  | { readonly op: 'put'; readonly collection: string; readonly data: JsonObject }
  | { readonly op: 'patch'; readonly collection: string; readonly data: JsonObject }
  | { readonly op: 'delete'; readonly collection: string }
  | { readonly op: 'restore'; readonly collection: string }

// ── Kayıt ────────────────────────────────────────────────────────────────────────────────────────

/** Bir kaydın içeriği: alanlar + silinmiş mi. */
export interface Doc {
  readonly data: JsonObject
  readonly deleted: boolean
}

export const serverRecordSchema = z.object({
  workspaceId: idSchema,
  collection: collectionNameSchema,
  id: idSchema,
  data: jsonObjectSchema,
  deleted: z.boolean(),
  /** Alanın bu kayıt en son değiştiğindeki değişiklik numarası. Alan içinde benzersizdir ve hep artar. */
  rev: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  updatedBy: idSchema.nullable(),
})
export type ServerRecord = z.infer<typeof serverRecordSchema>

export interface RecordKey {
  readonly workspaceId: string
  readonly collection: string
  readonly id: string
}

/** Kaydın tek dizgilik anahtarı (Map anahtarı olarak). Kimlikler `/` içeremediği için çakışmaz. */
export function keyString(key: RecordKey): string {
  return `${key.workspaceId}/${key.collection}/${key.id}`
}

export function mutationKey(mutation: Pick<Mutation, 'workspaceId' | 'collection' | 'recordId'>): RecordKey {
  return { workspaceId: mutation.workspaceId, collection: mutation.collection, id: mutation.recordId }
}

// ── İstek ve yanıt ───────────────────────────────────────────────────────────────────────────────

export const syncRequestSchema = z.object({
  protocolVersion: z.number().int(),
  /** Bu cihazın (yerel veritabanının) kimliği. İlk açılışta üretilir, hiç değişmez. */
  clientId: idSchema,
  /** Alan kimliği → istemcinin gördüğü son `rev`. Bilinmeyen alan 0 sayılır (hepsi istenir). */
  cursors: z.record(idSchema, z.number().int().nonnegative()),
  /** Bekleyen değişiklikler, `mid` artan sırada. */
  mutations: z.array(mutationSchema).max(SYNC_LIMITS.maxMutationsPerRequest),
})
export type SyncRequest = z.infer<typeof syncRequestSchema>

export const rejectedMutationSchema = z.object({
  mid: z.number().int().positive(),
  code: z.enum(ERROR_CODES),
  message: z.string(),
})
export type RejectedMutation = z.infer<typeof rejectedMutationSchema>

export const workspaceChangesSchema = z.object({
  /** `rev` artan sırada, imleçten sonraki kayıtlar (silinmişler dahil). */
  records: z.array(serverRecordSchema),
  /** İstemcinin bu alan için saklayacağı yeni imleç. */
  cursor: z.number().int().nonnegative(),
  /** Daha kayıt var; istemci yeniden eşitlemeli. */
  more: z.boolean(),
  /**
   * İstemcinin imleci sunucunun bildiğinden İLERİDE (sunucu eski bir yedeğe dönmüş). Kayıt dönmez, imleç
   * değişmez; istemci kullanıcıya sorar: "buradakini gönder" mi "sunucudakini al" mı (bkz. docs/ESITLEME.md).
   */
  reset: z.boolean(),
})
export type WorkspaceChanges = z.infer<typeof workspaceChangesSchema>

export const syncResponseSchema = z.object({
  /** Bu cihazdan işlenen son `mid`. İstemci bu numaraya kadar olanları giden kutusundan siler. */
  lastMutationId: z.number().int().nonnegative(),
  /** Kalıcı olarak reddedilenler (geçersiz veri, yetki yok…). Yeniden denenmez. */
  rejected: z.array(rejectedMutationSchema),
  /** İstekteki değişikliklerin dokunduğu kayıtların SON hâli (sayfalamadan bağımsız, hemen gelir). */
  touched: z.array(serverRecordSchema),
  /** Kullanıcının şu an üyesi olduğu alanlar. Listede olmayan alan artık erişilemezdir. */
  workspaces: z.array(workspaceInfoSchema),
  /** Alan kimliği → o alandaki yeni kayıtlar. */
  changes: z.record(idSchema, workspaceChangesSchema),
})
export type SyncResponse = z.infer<typeof syncResponseSchema>

// ── Saf mantık: değişikliği uygula ───────────────────────────────────────────────────────────────

export type ApplyResult =
  | { readonly ok: true; readonly doc: Doc | null; readonly changed: boolean }
  | { readonly ok: false; readonly code: ErrorCode; readonly message: string; readonly details?: unknown }

function fail(code: ErrorCode, message?: string, details?: unknown): ApplyResult {
  return { ok: false, code, message: message ?? ERROR_MESSAGES_TR[code], ...(details === undefined ? {} : { details }) }
}

const encoder = new TextEncoder()

/** JSON değerleri için derin eşitlik. Anahtar sırası önemsizdir; `undefined` değerli anahtar yok sayılır. */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((item, index) => jsonEqual(item, b[index]))
  }
  const objA = a as JsonObject
  const objB = b as JsonObject
  const keysA = Object.keys(objA).filter((key) => objA[key] !== undefined)
  const keysB = Object.keys(objB).filter((key) => objB[key] !== undefined)
  if (keysA.length !== keysB.length) return false
  return keysA.every((key) => Object.hasOwn(objB, key) && jsonEqual(objA[key], objB[key]))
}

function writeData(current: Doc | null, raw: JsonObject, collection: string, registry: EntityRegistry): ApplyResult {
  const entity = getEntity(collection, registry)
  if (!entity) return fail('unknown_collection')
  const parsed = entity.schema.safeParse(raw)
  if (!parsed.success) {
    const details = issuesToDetails(parsed.error)
    return fail('validation', details[0]?.message, details)
  }
  const data = parsed.data as JsonObject
  if (encoder.encode(JSON.stringify(data)).length > SYNC_LIMITS.maxRecordBytes) return fail('payload_too_large')
  const changed = current === null || current.deleted || !jsonEqual(current.data, data)
  return { ok: true, doc: { data, deleted: false }, changed }
}

/**
 * Bir değişikliği bir kaydın şimdiki hâline uygular ve yeni hâli döndürür. Yan etkisi yoktur.
 *
 * Kurallar:
 *  - put     → veriyi şemayla doğrular, kaydı bütünüyle yazar; silinmiş kaydı geri getirir.
 *  - patch   → kayıt yoksa `not_found`; silinmişse hiçbir şey yapmaz; değilse alanları birleştirip
 *              BÜTÜN kaydı şemayla yeniden doğrular.
 *  - delete  → kayıt yoksa ya da zaten silinmişse hiçbir şey yapmaz; değilse silinmiş işaretler.
 *  - restore → kayıt yoksa `not_found`; silinmişse geri getirir.
 * `changed: false` ise sunucu `rev` artırmaz.
 *
 * Not: patch için `schema.partial()` KULLANILMAZ; Zod 4'te eksik alanlara varsayılan değer yazar ve
 * dokunulmayan alanları sıfırlar. Birleştir-sonra-bütününü-doğrula yolu bu tuzağa düşmez.
 */
export function applyMutation(
  current: Doc | null,
  mutation: MutationIntent,
  registry: EntityRegistry = ENTITIES,
): ApplyResult {
  if (!getEntity(mutation.collection, registry)) return fail('unknown_collection')
  switch (mutation.op) {
    case 'put':
      return writeData(current, mutation.data, mutation.collection, registry)
    case 'patch':
      if (current === null) return fail('not_found')
      if (current.deleted) return { ok: true, doc: current, changed: false }
      return writeData(current, { ...current.data, ...mutation.data }, mutation.collection, registry)
    case 'delete':
      if (current === null || current.deleted) return { ok: true, doc: current, changed: false }
      return { ok: true, doc: { data: current.data, deleted: true }, changed: true }
    case 'restore':
      if (current === null) return fail('not_found')
      if (!current.deleted) return { ok: true, doc: current, changed: false }
      return { ok: true, doc: { data: current.data, deleted: false }, changed: true }
  }
}

/**
 * Sunucudaki hâlin üstüne bekleyen yerel değişiklikleri sırayla yeniden uygular ("yeniden tabanlama").
 * İstemcide görünen hâl her zaman budur: sunucu hâli + henüz onaylanmamış kendi değişikliklerim.
 * Uygulanamayan değişiklik (ör. sunucu hâli değiştiği için artık geçersiz) atlanır; sunucu da onu reddedecektir.
 */
export function rebase(
  server: Doc | null,
  pending: readonly MutationIntent[],
  registry: EntityRegistry = ENTITIES,
): Doc | null {
  let doc = server
  for (const mutation of pending) {
    const result = applyMutation(doc, mutation, registry)
    if (result.ok) doc = result.doc
  }
  return doc
}
