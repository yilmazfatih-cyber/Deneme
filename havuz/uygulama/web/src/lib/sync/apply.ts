/**
 * Eşitlemenin veritabanı adımları: isteği kur, yanıtı TEK işlemde uygula, "reset" kararını uygula.
 * Mantığın kendisi `@uygulama/shared` içindedir (buildSyncRequest → affectedKeys → planReconcile); burası onu
 * Dexie tablolarına bağlar. Başvuru gerçeklemesi: shared/src/testing/memoryReplica.ts — ikisi adım adım aynı
 * sonucu verir (kanıtı: test/sync/equivalence.test.ts).
 *
 * Genişletme: eşitleme davranışını değiştirecekseniz önce shared'daki mantığı ve testlerini değiştirin; burada
 * yalnız "oku → planla → yaz" sırası durur.
 */
import Dexie from 'dexie'
import {
  affectedKeys,
  buildSyncRequest,
  jsonEqual,
  keyString,
  planReconcile,
  SYNC_LIMITS,
  type LocalRecord,
  type MutationIntent,
  type ReconcilePlan,
  type SyncRequest,
  type SyncResponse,
} from '@uygulama/shared'
import { rowKey, toLocalRecord, toPrimaryKey, type AppDb, type RecordRow } from '../store/db.ts'
import { ensureClientId, getMeta, MAX_REJECTIONS, setMeta, type Rejection } from '../store/meta.ts'
import { createdAtOf, enqueueMutation } from '../store/records.ts'

/** Giden kutusunun başından en çok `maxMutations` değişikliği alıp isteği kurar. */
export async function readSyncRequest(
  db: AppDb,
  maxMutations: number = SYNC_LIMITS.maxMutationsPerRequest,
): Promise<SyncRequest> {
  const clientId = await ensureClientId(db)
  return db.transaction('r', db.outbox, db.meta, async () => {
    const cursors = await getMeta(db, 'cursors')
    const outbox = await db.outbox.orderBy('mid').limit(maxMutations).toArray()
    return buildSyncRequest({ clientId, cursors, outbox })
  })
}

/** Bir alanın bütün kayıt satırları (bütün koleksiyonlar). */
function workspaceRows(db: AppDb, workspaceId: string) {
  return db.records.where('[workspaceId+collection]').between([workspaceId, Dexie.minKey], [workspaceId, Dexie.maxKey])
}

/** Yerelde izi olan alanlar: imleci, kaydı ya da bekleyen değişikliği olanlar. */
async function knownWorkspaceIds(db: AppDb, cursors: Readonly<Record<string, number>>): Promise<string[]> {
  const ids = new Set<string>(Object.keys(cursors))
  for (const workspace of await getMeta(db, 'workspaces')) ids.add(workspace.id)
  for (const key of await db.records.orderBy('[workspaceId+collection]').uniqueKeys()) {
    if (Array.isArray(key) && typeof key[0] === 'string') ids.add(key[0])
  }
  for (const key of await db.outbox.orderBy('workspaceId').uniqueKeys()) {
    if (typeof key === 'string') ids.add(key)
  }
  return [...ids]
}

function toRow(record: LocalRecord, previous: RecordRow | undefined, now: string): RecordRow {
  const unchanged =
    previous !== undefined &&
    previous.view.deleted === record.view.deleted &&
    jsonEqual(previous.view.data, record.view.data)
  return {
    ...record.key,
    view: record.view,
    server: record.server,
    createdAt: previous?.createdAt ?? createdAtOf(record.key.id, record.server?.createdAt ?? now),
    updatedAt: unchanged ? previous.updatedAt : (record.server?.updatedAt ?? now),
  }
}

export interface ApplyOutcome {
  readonly plan: ReconcilePlan
  /** Reddedilen değişikliklerin ayrıntısı (kullanıcıya bildirilir). */
  readonly rejections: Rejection[]
  /** Erişimi kalkan alanlar (adlarıyla; bildirim için). */
  readonly dropped: { readonly id: string; readonly name: string }[]
  /** Uygulamadan sonra giden kutusunda kalan değişiklik sayısı. */
  readonly pending: number
}

/**
 * Sunucu yanıtını yerel durumla uzlaştırır: planı çıkarır ve TEK işlemde uygular.
 * İstek gönderilirken yapılan yeni yerel yazmalar kaybolmaz: plan, giden kutusunun O ANKİ hâline göre çıkar.
 */
export async function applySyncResponse(
  db: AppDb,
  response: SyncResponse,
  now: Date = new Date(),
): Promise<ApplyOutcome> {
  return db.transaction('rw', db.records, db.outbox, db.meta, async () => {
    const outbox = await db.outbox.toArray()
    const cursors = await getMeta(db, 'cursors')
    const previousWorkspaces = await getMeta(db, 'workspaces')

    const keys = affectedKeys(response, outbox)
    const rows = await db.records.bulkGet(keys.map(toPrimaryKey))
    const local = new Map<string, RecordRow>()
    for (const row of rows) if (row) local.set(keyString(rowKey(row)), row)

    const plan = planReconcile({
      response,
      outbox,
      cursors,
      knownWorkspaceIds: await knownWorkspaceIds(db, cursors),
      getLocal: (key) => {
        const row = local.get(keyString(key))
        return row && toLocalRecord(row)
      },
    })

    const rejections: Rejection[] = []
    for (const rejected of plan.rejected) {
      const mutation = outbox.find((item) => item.mid === rejected.mid)
      if (!mutation) continue
      rejections.push({
        at: now.toISOString(),
        code: rejected.code,
        message: rejected.message,
        workspaceId: mutation.workspaceId,
        collection: mutation.collection,
        recordId: mutation.recordId,
        op: mutation.op,
      })
    }

    // Planı uygulama sırası shared/src/replica.ts → planReconcile açıklamasındaki gibidir.
    await db.outbox.bulkDelete(plan.ackedMids)
    for (const workspaceId of plan.droppedWorkspaceIds) {
      await workspaceRows(db, workspaceId).delete()
      await db.outbox.where('workspaceId').equals(workspaceId).delete()
    }
    await db.records.bulkDelete(plan.removals.map(toPrimaryKey))
    const at = now.toISOString()
    await db.records.bulkPut(plan.upserts.map((record) => toRow(record, local.get(keyString(record.key)), at)))
    await setMeta(db, 'cursors', plan.cursors)
    await setMeta(db, 'workspaces', plan.workspaces)
    await setMeta(db, 'resetWorkspaceIds', plan.resetWorkspaceIds)
    await setMeta(db, 'lastSyncedAt', at)
    if (rejections.length > 0) {
      const log = [...(await getMeta(db, 'rejections')), ...rejections].slice(-MAX_REJECTIONS)
      await setMeta(db, 'rejections', log)
    }
    const current = await getMeta(db, 'currentWorkspaceId')
    if (current !== null && plan.droppedWorkspaceIds.includes(current)) await setMeta(db, 'currentWorkspaceId', null)

    const dropped = plan.droppedWorkspaceIds.map((id) => ({
      id,
      name: previousWorkspaces.find((workspace) => workspace.id === id)?.name ?? '',
    }))
    return { plan, rejections, dropped, pending: await db.outbox.count() }
  })
}

/**
 * Sunucu eski bir yedeğe dönmüşse (reset) kullanıcının seçimini uygular
 * (shared/src/testing/memoryReplica.ts → `resolveReset` ile aynı):
 *  - 'push': buradaki bütün kayıtlar sunucuya yeniden gönderilir (buradaki kazanır),
 *  - 'pull': buradaki kayıtlar ve bekleyen değişiklikler atılır (sunucudaki kazanır).
 * İki durumda da imleç sıfırlanır; sonraki eşitleme alanı baştan alır.
 */
export async function resolveReset(
  db: AppDb,
  workspaceId: string,
  choice: 'push' | 'pull',
  now: Date = new Date(),
): Promise<void> {
  await db.transaction('rw', db.records, db.outbox, db.meta, async () => {
    if (choice === 'push') {
      for (const row of await workspaceRows(db, workspaceId).toArray()) {
        const intent: MutationIntent = row.view.deleted
          ? { op: 'delete', collection: row.collection }
          : { op: 'put', collection: row.collection, data: row.view.data }
        await enqueueMutation(db, workspaceId, row.id, intent, now)
      }
    } else {
      await workspaceRows(db, workspaceId).delete()
      await db.outbox.where('workspaceId').equals(workspaceId).delete()
    }
    await setMeta(db, 'cursors', { ...(await getMeta(db, 'cursors')), [workspaceId]: 0 })
    const resets = await getMeta(db, 'resetWorkspaceIds')
    await setMeta(
      db,
      'resetWorkspaceIds',
      resets.filter((id) => id !== workspaceId),
    )
  })
  db.notifyLocalWrite()
}
