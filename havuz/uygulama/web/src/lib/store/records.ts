/**
 * Kayıt yazma ve okuma (React'siz çekirdek). Arayüz bunları `hooks.ts` üzerinden kullanır.
 *
 * Yazma kuralı (shared/src/testing/memoryReplica.ts → `write` ile AYNI adımlar):
 *   1. `applyMutation` ile yerelde doğrula ve uygula (geçersiz veri `AppError('validation')` fırlatır),
 *   2. görünen hâli `records` tablosuna yaz,
 *   3. değişikliği giden kutusuna koy (hesapsız alan `local` hariç) — üçü TEK işlem (transaction) içinde.
 *
 * Genişletme: yeni bir yazma türü gerekiyorsa `writeRecord` üstüne ince bir sarmalayıcı yazın; tabloya doğrudan
 * `db.records.put` ile YAZMAYIN (giden kutusu atlanır, değişiklik sunucuya hiç gitmez).
 */
import {
  AppError,
  applyMutation,
  ENTITIES,
  isId,
  issuesToDetails,
  jsonEqual,
  LOCAL_WORKSPACE_ID,
  uuidv7,
  uuidv7Time,
  type CollectionName,
  type DataOf,
  type Doc,
  type InputOf,
  type JsonObject,
  type MutationIntent,
} from '@uygulama/shared'
import type { AppDb, NewMutation, RecordRow } from './db.ts'

/** Arayüze verilen kayıt: şemayla ayrıştırılmış, varsayılanları uygulanmış. */
export interface Rec<C extends CollectionName = CollectionName> {
  readonly id: string
  readonly data: DataOf<C>
  readonly deleted: boolean
  /** İlk oluşturulma anı (ISO). */
  readonly createdAt: string
  /** Görünen hâlin son değiştiği an (ISO). */
  readonly updatedAt: string
}

export interface WriteOptions {
  /** Saat (test için dışarıdan verilebilir). */
  readonly now?: Date
}

function toNewMutation(intent: MutationIntent, workspaceId: string, recordId: string, at: string): NewMutation {
  const base = { workspaceId, collection: intent.collection, recordId, at }
  switch (intent.op) {
    case 'put':
      return { ...base, op: 'put', data: intent.data }
    case 'patch':
      return { ...base, op: 'patch', data: intent.data }
    case 'delete':
      return { ...base, op: 'delete' }
    case 'restore':
      return { ...base, op: 'restore' }
  }
}

/** Değişikliği giden kutusuna koyar. Yalnız bir `rw` işlemi içinden çağrılır. */
export async function enqueueMutation(
  db: AppDb,
  workspaceId: string,
  recordId: string,
  intent: MutationIntent,
  now: Date,
): Promise<void> {
  await db.outbox.add(toNewMutation(intent, workspaceId, recordId, now.toISOString()))
}

/** Kaydın oluşturulma anı: kimlik UUIDv7 ise içindeki zaman (her cihazda aynı çıkar), değilse verilen yedek. */
export function createdAtOf(id: string, fallback: string): string {
  const time = uuidv7Time(id)
  return time === null ? fallback : new Date(time).toISOString()
}

interface WriteResult {
  readonly doc: Doc | null
  /** Görünen hâl değişti mi. */
  readonly changed: boolean
  /** Giden kutusuna bir değişiklik kondu mu (eşitleme tetiklenecek mi). */
  readonly queued: boolean
}

/** Yazmanın çekirdeği. Yalnız `records` + `outbox` tablolarını kapsayan bir `rw` işlemi içinden çağrılır. */
async function writeInTransaction(
  db: AppDb,
  workspaceId: string,
  recordId: string,
  intent: MutationIntent,
  now: Date,
): Promise<WriteResult> {
  if (!isId(recordId)) throw new AppError('validation', 'Geçersiz kimlik')
  const row = await db.records.get([workspaceId, intent.collection, recordId])
  const result = applyMutation(row?.view ?? null, intent)
  if (!result.ok) throw new AppError(result.code, result.message, result.details)
  if (!result.changed || result.doc === null) return { doc: result.doc, changed: false, queued: false }
  const at = now.toISOString()
  await db.records.put({
    workspaceId,
    collection: intent.collection,
    id: recordId,
    view: result.doc,
    server: row?.server ?? null,
    createdAt: row?.createdAt ?? createdAtOf(recordId, at),
    updatedAt: at,
  })
  if (workspaceId === LOCAL_WORKSPACE_ID) return { doc: result.doc, changed: true, queued: false }
  await enqueueMutation(db, workspaceId, recordId, intent, now)
  return { doc: result.doc, changed: true, queued: true }
}

/**
 * Tek bir değişikliği yerelde uygular ve (gerekiyorsa) giden kutusuna koyar.
 * Hiçbir şeyi değiştirmeyen yazma (aynı değer, zaten silinmiş…) kuyruğa konmaz. Dönen değer kaydın yeni hâlidir.
 */
export async function writeRecord(
  db: AppDb,
  workspaceId: string,
  recordId: string,
  intent: MutationIntent,
  options: WriteOptions = {},
): Promise<Doc | null> {
  const now = options.now ?? new Date()
  const result = await db.transaction('rw', db.records, db.outbox, () =>
    writeInTransaction(db, workspaceId, recordId, intent, now),
  )
  if (result.queued) db.notifyLocalWrite()
  return result.doc
}

export interface BatchWrite {
  readonly recordId: string
  readonly intent: MutationIntent
}

/**
 * Birden çok değişikliği TEK işlemde uygular (içe aktarma, hesaba taşıma). Biri geçersizse hiçbiri yazılmaz.
 * Dönen sayı, gerçekten değişiklik yaratan yazma sayısıdır.
 */
export async function writeRecords(
  db: AppDb,
  workspaceId: string,
  writes: readonly BatchWrite[],
  options: WriteOptions = {},
): Promise<number> {
  const now = options.now ?? new Date()
  const results = await db.transaction('rw', db.records, db.outbox, async () => {
    const done: WriteResult[] = []
    for (const write of writes) {
      done.push(await writeInTransaction(db, workspaceId, write.recordId, write.intent, now))
    }
    return done
  })
  if (results.some((result) => result.queued)) db.notifyLocalWrite()
  return results.filter((result) => result.changed).length
}

/** Yeni kayıt açar; kimliğini döndürür. Varsayılanı olan alanlar verilmeyebilir. */
export async function createRecord<C extends CollectionName>(
  db: AppDb,
  workspaceId: string,
  collection: C,
  input: InputOf<C>,
  options: WriteOptions & { readonly id?: string } = {},
): Promise<string> {
  const id = options.id ?? uuidv7((options.now ?? new Date()).getTime())
  await writeRecord(db, workspaceId, id, { op: 'put', collection, data: input }, options)
  return id
}

/**
 * Yalnız GERÇEKTEN değişen alanları bulur (şemadan geçirip karşılaştırır: "  Süt " ile "Süt" aynıdır).
 * Geçersiz değer `AppError('validation')` fırlatır; `details` alan → ileti listesidir.
 */
export function diffPatch(collection: CollectionName, current: JsonObject, changes: JsonObject): JsonObject {
  const defined = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined))
  const parsed = ENTITIES[collection].schema.safeParse({ ...current, ...defined })
  if (!parsed.success) {
    const details = issuesToDetails(parsed.error)
    throw new AppError('validation', details[0]?.message, details)
  }
  const next = parsed.data as JsonObject
  const patch: JsonObject = {}
  for (const key of Object.keys(defined)) {
    if (Object.hasOwn(next, key) && !jsonEqual(next[key], current[key])) patch[key] = next[key]
  }
  return patch
}

/**
 * Var olan kaydı düzenler: yalnız değişen alanlar `patch` olarak gönderilir ki başka cihazda değişen öteki
 * alanlar ezilmesin. Hiçbir alan değişmediyse `false` döner ve hiçbir şey yazılmaz.
 */
export async function updateRecord<C extends CollectionName>(
  db: AppDb,
  workspaceId: string,
  collection: C,
  id: string,
  changes: Partial<InputOf<C>>,
  options: WriteOptions = {},
): Promise<boolean> {
  const now = options.now ?? new Date()
  const result = await db.transaction('rw', db.records, db.outbox, async () => {
    const row = await db.records.get([workspaceId, collection, id])
    if (!row) throw new AppError('not_found')
    if (row.view.deleted) return null
    const patch = diffPatch(collection, row.view.data, changes)
    if (Object.keys(patch).length === 0) return null
    return writeInTransaction(db, workspaceId, id, { op: 'patch', collection, data: patch }, now)
  })
  if (result?.queued === true) db.notifyLocalWrite()
  return result?.changed === true
}

/** Kaydı silinmiş işaretler (geri alınabilir: `restoreRecord`). */
export async function removeRecord(
  db: AppDb,
  workspaceId: string,
  collection: CollectionName,
  id: string,
  options: WriteOptions = {},
): Promise<void> {
  await writeRecord(db, workspaceId, id, { op: 'delete', collection }, options)
}

/** Silinmiş kaydı geri getirir. */
export async function restoreRecord(
  db: AppDb,
  workspaceId: string,
  collection: CollectionName,
  id: string,
  options: WriteOptions = {},
): Promise<void> {
  await writeRecord(db, workspaceId, id, { op: 'restore', collection }, options)
}

// ── Okuma ────────────────────────────────────────────────────────────────────────────────────────

/** Satırı şemayla ayrıştırır (varsayılanlar uygulanır). Şemaya uymayan satır için `null` döner. */
export function parseRow<C extends CollectionName>(collection: C, row: RecordRow): Rec<C> | null {
  const parsed = ENTITIES[collection].schema.safeParse(row.view.data)
  if (!parsed.success) return null
  return {
    id: row.id,
    data: parsed.data as DataOf<C>,
    deleted: row.view.deleted,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/** Bir alan + koleksiyondaki bütün satırlar (silinmişler dahil), kimlik sırasıyla. */
export async function listRows(db: AppDb, workspaceId: string, collection: string): Promise<RecordRow[]> {
  return db.records.where('[workspaceId+collection]').equals([workspaceId, collection]).toArray()
}

/** Bir alan + koleksiyondaki kayıtlar, ayrıştırılmış. Şemaya uymayanlar atlanır (konsola uyarı yazılır). */
export async function listRecords<C extends CollectionName>(
  db: AppDb,
  workspaceId: string,
  collection: C,
  options: { readonly includeDeleted?: boolean } = {},
): Promise<Rec<C>[]> {
  const rows = await listRows(db, workspaceId, collection)
  const records: Rec<C>[] = []
  let unreadable = 0
  for (const row of rows) {
    if (row.view.deleted && options.includeDeleted !== true) continue
    const record = parseRow(collection, row)
    if (record) records.push(record)
    else unreadable += 1
  }
  if (unreadable > 0) console.warn(`${collection}: ${unreadable} kayıt şemaya uymadığı için gösterilmedi.`)
  return records
}

export async function getRecord<C extends CollectionName>(
  db: AppDb,
  workspaceId: string,
  collection: C,
  id: string,
): Promise<Rec<C> | null> {
  const row = await db.records.get([workspaceId, collection, id])
  return row ? parseRow(collection, row) : null
}
