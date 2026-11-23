/**
 * Eşitlemenin veritabanı adımları: isteği kur, yanıtı TEK işlemde uygula, "reset" kararını uygula.
 * Mantığın kendisi `@uygulama/shared` içindedir (buildSyncRequest → affectedKeys → planReconcile); burası onu
 * SQLite tablolarına bağlar. Başvuru gerçeklemesi: shared/testing/memoryReplica.ts — ikisi adım adım aynı
 * sonucu verir (kanıtı: test/sync/equivalence.test.ts). Web'deki karşılığı: uygulama/web/src/lib/sync/apply.ts.
 *
 * Genişletme: eşitleme davranışını değiştirecekseniz önce uygulama/shared'daki mantığı ve testlerini değiştirin,
 * kopyayı yenileyin (npm run shared:sync); burada yalnız "oku → planla → yaz" sırası durur.
 */
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
import type { LocalDb } from '../store/localDb.ts'
import { ensureClientId, getMeta, MAX_REJECTIONS, setMeta, type Rejection } from '../store/meta.ts'
import { createdAtOf } from '../store/records.ts'
import {
  countOutbox,
  deleteOutbox,
  deleteRow,
  dropWorkspace,
  enqueueMutation,
  getRow,
  listOutbox,
  putRow,
  rowKey,
  storedWorkspaceIds,
  workspaceRows,
  type RecordRow,
} from '../store/rows.ts'

/** Giden kutusunun başından en çok `maxMutations` değişikliği alıp isteği kurar. */
export async function readSyncRequest(
  db: LocalDb,
  maxMutations: number = SYNC_LIMITS.maxMutationsPerRequest,
): Promise<SyncRequest> {
  const clientId = await ensureClientId(db)
  return db.read(async (sql) => {
    const cursors = await getMeta(sql, 'cursors')
    const outbox = await listOutbox(sql, maxMutations)
    return buildSyncRequest({ clientId, cursors, outbox })
  })
}

function toLocalRecord(row: RecordRow): LocalRecord {
  return { key: rowKey(row), view: row.view, server: row.server }
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
 * İstek yoldayken yapılan yeni yerel yazmalar kaybolmaz: plan, giden kutusunun O ANKİ hâline göre çıkar.
 */
export async function applySyncResponse(
  db: LocalDb,
  response: SyncResponse,
  now: Date = new Date(),
): Promise<ApplyOutcome> {
  return db.write(async (sql) => {
    const outbox = await listOutbox(sql)
    const cursors = await getMeta(sql, 'cursors')
    const previousWorkspaces = await getMeta(sql, 'workspaces')

    const local = new Map<string, RecordRow>()
    for (const key of affectedKeys(response, outbox)) {
      const row = await getRow(sql, key)
      if (row) local.set(keyString(key), row)
    }
    const known = new Set([...Object.keys(cursors), ...previousWorkspaces.map((ws) => ws.id)])
    for (const id of await storedWorkspaceIds(sql)) known.add(id)

    const plan = planReconcile({
      response,
      outbox,
      cursors,
      knownWorkspaceIds: [...known],
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

    // Planı uygulama sırası shared/replica.ts → planReconcile açıklamasındaki gibidir.
    await deleteOutbox(sql, plan.ackedMids)
    for (const workspaceId of plan.droppedWorkspaceIds) await dropWorkspace(sql, workspaceId)
    for (const key of plan.removals) await deleteRow(sql, key)
    const at = now.toISOString()
    for (const record of plan.upserts) await putRow(sql, toRow(record, local.get(keyString(record.key)), at))
    await setMeta(sql, 'cursors', plan.cursors)
    await setMeta(sql, 'workspaces', plan.workspaces)
    await setMeta(sql, 'resetWorkspaceIds', plan.resetWorkspaceIds)
    await setMeta(sql, 'lastSyncedAt', at)
    if (rejections.length > 0) {
      const log = [...(await getMeta(sql, 'rejections')), ...rejections].slice(-MAX_REJECTIONS)
      await setMeta(sql, 'rejections', log)
    }
    const current = await getMeta(sql, 'currentWorkspaceId')
    if (current !== null && plan.droppedWorkspaceIds.includes(current)) await setMeta(sql, 'currentWorkspaceId', null)

    const dropped = plan.droppedWorkspaceIds.map((id) => ({
      id,
      name: previousWorkspaces.find((workspace) => workspace.id === id)?.name ?? '',
    }))
    return { plan, rejections, dropped, pending: await countOutbox(sql) }
  })
}

/**
 * Sunucu eski bir yedeğe dönmüşse (reset) kullanıcının seçimini uygular
 * (shared/testing/memoryReplica.ts → `resolveReset` ile aynı):
 *  - 'push': buradaki bütün kayıtlar sunucuya yeniden gönderilir (buradaki kazanır),
 *  - 'pull': buradaki kayıtlar ve bekleyen değişiklikler atılır (sunucudaki kazanır).
 * İki durumda da imleç sıfırlanır; sonraki eşitleme alanı baştan alır.
 */
export async function resolveReset(
  db: LocalDb,
  workspaceId: string,
  choice: 'push' | 'pull',
  now: Date = new Date(),
): Promise<void> {
  await db.write(async (sql) => {
    if (choice === 'push') {
      for (const row of await workspaceRows(sql, workspaceId)) {
        const intent: MutationIntent = row.view.deleted
          ? { op: 'delete', collection: row.collection }
          : { op: 'put', collection: row.collection, data: row.view.data }
        await enqueueMutation(sql, workspaceId, row.id, intent, now)
      }
    } else {
      await dropWorkspace(sql, workspaceId)
    }
    await setMeta(sql, 'cursors', { ...(await getMeta(sql, 'cursors')), [workspaceId]: 0 })
    const resets = await getMeta(sql, 'resetWorkspaceIds')
    await setMeta(
      sql,
      'resetWorkspaceIds',
      resets.filter((id) => id !== workspaceId),
    )
  })
  db.notifyLocalWrite()
}
