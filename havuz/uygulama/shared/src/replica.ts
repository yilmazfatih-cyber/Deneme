/**
 * İstemci tarafı eşitleme mantığı (saf işlevler; depolama ve ağ yok).
 * Web uygulaması bunları Dexie (IndexedDB) ile, testler bellek içi kopya ile kullanır:
 *
 *   1. buildSyncRequest → gönderilecek isteği kurar
 *   2. affectedKeys     → yanıtın dokunacağı kayıtların anahtarları (depodan önce bunlar okunur)
 *   3. planReconcile    → yanıtı yerel durumla uzlaştıran PLANI çıkarır (ne silinecek, ne yazılacak)
 *   4. plan, tek bir veritabanı işlemi (transaction) içinde uygulanır
 *
 * Değişmez kural: yerelde görünen hâl = sunucunun son bilinen hâli + henüz onaylanmamış kendi değişikliklerim.
 *
 * Genişletme: buradaki işlevler yan etkisizdir ve shared/test/replica.test.ts + convergence.test.ts ile korunur.
 * Davranış değiştirirseniz önce testini yazın.
 */
import { LOCAL_WORKSPACE_ID, type WorkspaceInfo } from './api.ts'
import { ENTITIES, type EntityRegistry } from './entities/index.ts'
import {
  keyString,
  mutationKey,
  PROTOCOL_VERSION,
  rebase,
  SYNC_LIMITS,
  type Doc,
  type Mutation,
  type RecordKey,
  type RejectedMutation,
  type ServerRecord,
  type SyncRequest,
  type SyncResponse,
} from './sync.ts'

/** Sunucunun bir kayıt için bildirdiği son hâl (yerelde saklanır; yeniden tabanlamanın tabanıdır). */
export interface ServerSnapshot extends Doc {
  readonly rev: number
  readonly createdAt: string
  readonly updatedAt: string
  readonly updatedBy: string | null
}

/** Yerel depodaki bir kayıt. */
export interface LocalRecord {
  readonly key: RecordKey
  /** Arayüzün gördüğü hâl (sunucu hâli + bekleyen yerel değişiklikler). */
  readonly view: Doc
  /** Sunucunun son bilinen hâli; kayıt henüz sunucuya ulaşmadıysa `null`. */
  readonly server: ServerSnapshot | null
}

export function snapshotOf(record: ServerRecord): ServerSnapshot {
  return {
    data: record.data,
    deleted: record.deleted,
    rev: record.rev,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    updatedBy: record.updatedBy,
  }
}

function recordKeyOf(record: ServerRecord): RecordKey {
  return { workspaceId: record.workspaceId, collection: record.collection, id: record.id }
}

function isSendable(mutation: Mutation): boolean {
  return mutation.workspaceId !== LOCAL_WORKSPACE_ID
}

/** Giden kutusundan (mid sırasıyla) en çok bir istekliği alıp isteği kurar. Yerel alan hiç gönderilmez. */
export function buildSyncRequest(input: {
  readonly clientId: string
  readonly cursors: Readonly<Record<string, number>>
  readonly outbox: readonly Mutation[]
}): SyncRequest {
  const mutations = input.outbox
    .filter(isSendable)
    .toSorted((a, b) => a.mid - b.mid)
    .slice(0, SYNC_LIMITS.maxMutationsPerRequest)
  const cursors: Record<string, number> = {}
  for (const [workspaceId, cursor] of Object.entries(input.cursors)) {
    if (workspaceId !== LOCAL_WORKSPACE_ID) cursors[workspaceId] = cursor
  }
  return { protocolVersion: PROTOCOL_VERSION, clientId: input.clientId, cursors, mutations }
}

/** Sunucunun onayladığı (ya da reddettiği) değişiklikler: artık giden kutusundan çıkarılacak olanlar. */
function isAcked(mutation: Mutation, response: SyncResponse): boolean {
  return isSendable(mutation) && mutation.mid <= response.lastMutationId
}

/**
 * Yanıt uygulanırken yerel hâli yeniden hesaplanacak kayıtların anahtarları.
 * Depo (Dexie) bu anahtarları önceden okur ve `planReconcile`'a `getLocal` ile verir.
 */
export function affectedKeys(response: SyncResponse, outbox: readonly Mutation[]): RecordKey[] {
  const keys = new Map<string, RecordKey>()
  const add = (key: RecordKey) => keys.set(keyString(key), key)
  for (const mutation of outbox) if (isAcked(mutation, response)) add(mutationKey(mutation))
  for (const record of response.touched) add(recordKeyOf(record))
  for (const changes of Object.values(response.changes)) for (const record of changes.records) add(recordKeyOf(record))
  return [...keys.values()]
}

export interface ReconcileInput {
  readonly response: SyncResponse
  /** Giden kutusunun TAMAMI (gönderilmiş olanlar dahil). */
  readonly outbox: readonly Mutation[]
  readonly cursors: Readonly<Record<string, number>>
  /** Yerelde izi olan alanlar (imleci, kaydı ya da bekleyen değişikliği olanlar). */
  readonly knownWorkspaceIds: readonly string[]
  /** `affectedKeys` ile bulunan kayıtların yerel hâli. */
  readonly getLocal: (key: RecordKey) => LocalRecord | undefined
  readonly registry?: EntityRegistry
}

export interface ReconcilePlan {
  /** Giden kutusundan silinecek sıra numaraları. */
  readonly ackedMids: number[]
  /** Yerel depoya yazılacak kayıtlar (yenisiyle değiştir). */
  readonly upserts: LocalRecord[]
  /** Yerel depodan silinecek kayıtlar (sunucuda hiç var olmamış, bekleyeni de kalmamış). */
  readonly removals: RecordKey[]
  /** Yeni imleçler (yalnız üye olunan alanlar). Eskisinin YERİNE yazılır. */
  readonly cursors: Record<string, number>
  readonly workspaces: WorkspaceInfo[]
  /** Artık erişilemeyen alanlar: bunların yerel kayıtları VE bekleyen değişiklikleri silinir. */
  readonly droppedWorkspaceIds: string[]
  /** Sunucusu eski yedeğe dönmüş alanlar: eşitleme durur, kullanıcıya sorulur (bkz. docs/ESITLEME.md). */
  readonly resetWorkspaceIds: string[]
  /** Reddedilen değişiklikler: kullanıcıya bildirilir. */
  readonly rejected: RejectedMutation[]
  /** Sunucuda alınacak kayıt kaldı: hemen yeniden eşitle. */
  readonly more: boolean
}

/**
 * Sunucu yanıtını yerel durumla uzlaştıran planı çıkarır. Hiçbir şeyi değiştirmez.
 *
 * Planı uygulama sırası (tek işlem içinde):
 *   1. `ackedMids` giden kutusundan silinir
 *   2. `droppedWorkspaceIds` alanlarının kayıtları ve bekleyen değişiklikleri silinir
 *   3. `removals` silinir, `upserts` yazılır
 *   4. `cursors` ve `workspaces` saklanır
 */
export function planReconcile(input: ReconcileInput): ReconcilePlan {
  const { response, outbox, cursors, getLocal } = input
  const registry = input.registry ?? ENTITIES

  const memberIds = new Set(response.workspaces.map((workspace) => workspace.id))
  const droppedWorkspaceIds = input.knownWorkspaceIds.filter((id) => id !== LOCAL_WORKSPACE_ID && !memberIds.has(id))
  const dropped = new Set(droppedWorkspaceIds)

  const ackedMids = outbox.filter((mutation) => isAcked(mutation, response)).map((mutation) => mutation.mid)
  const remaining = outbox
    .filter((mutation) => !isAcked(mutation, response) && !dropped.has(mutation.workspaceId))
    .toSorted((a, b) => a.mid - b.mid)

  // Gelen kayıtlar: aynı kayıt hem `touched` hem `changes` içinde olabilir; en yüksek rev kazanır.
  const incoming = new Map<string, ServerRecord>()
  const consider = (record: ServerRecord) => {
    if (dropped.has(record.workspaceId)) return
    const id = keyString(recordKeyOf(record))
    const previous = incoming.get(id)
    if (!previous || record.rev >= previous.rev) incoming.set(id, record)
  }
  response.touched.forEach(consider)
  for (const changes of Object.values(response.changes)) changes.records.forEach(consider)

  const upserts: LocalRecord[] = []
  const removals: RecordKey[] = []
  for (const key of affectedKeys(response, outbox)) {
    if (dropped.has(key.workspaceId)) continue
    const id = keyString(key)
    const local = getLocal(key)
    const arrived = incoming.get(id)
    let server = local?.server ?? null
    // Eski bir sayfa geç gelirse (rev daha küçükse) yok sayılır.
    if (arrived && (server === null || arrived.rev >= server.rev)) server = snapshotOf(arrived)
    const pending = remaining.filter((mutation) => keyString(mutationKey(mutation)) === id)
    const view = rebase(server && { data: server.data, deleted: server.deleted }, pending, registry)
    if (view === null) removals.push(key)
    else upserts.push({ key, view, server })
  }

  const nextCursors: Record<string, number> = {}
  const resetWorkspaceIds: string[] = []
  let more = false
  for (const workspace of response.workspaces) {
    const previous = cursors[workspace.id] ?? 0
    const changes = response.changes[workspace.id]
    if (changes?.reset) {
      resetWorkspaceIds.push(workspace.id)
      nextCursors[workspace.id] = previous
      continue
    }
    nextCursors[workspace.id] = changes ? Math.max(previous, changes.cursor) : previous
    if (changes?.more) more = true
  }

  return {
    ackedMids,
    upserts,
    removals,
    cursors: nextCursors,
    workspaces: response.workspaces,
    droppedWorkspaceIds,
    resetWorkspaceIds,
    rejected: response.rejected,
    more,
  }
}

/**
 * Eşitleme başarısız olunca yeniden denemeden önce beklenecek süre (ms): üstel artış + rastgele titreme.
 * `failures` art arda başarısız deneme sayısıdır (1'den başlar). En çok ~60 sn.
 */
export function syncBackoffMs(failures: number, random: () => number = Math.random): number {
  const base = Math.min(60_000, 1000 * 2 ** Math.max(0, failures - 1))
  return Math.round(base * (0.5 + random() * 0.5))
}
