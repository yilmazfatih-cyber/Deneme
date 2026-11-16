/**
 * Bellek içi İSTEMCİ KOPYASI: bir cihazın yerel deposunun (kayıtlar + giden kutusu + imleçler) en yalın hâli.
 * Web uygulamasının Dexie tabanlı deposu (web/src/lib/store) bununla AYNI adımları izler; orayı yazarken ya da
 * değiştirirken başvuru olarak bunu okuyun. Yakınsama testleri (shared/test/convergence.test.ts) bununla koşar.
 *
 * Genişletme: yerel depoya yeni bir davranış eklenecekse önce burada deneyin ve testini yazın.
 */
import { LOCAL_WORKSPACE_ID, type WorkspaceInfo } from '../api.ts'
import { ENTITIES, type EntityRegistry } from '../entities/index.ts'
import { AppError } from '../errors.ts'
import { uuidv7 } from '../ids.ts'
import { buildSyncRequest, planReconcile, type LocalRecord, type ReconcilePlan } from '../replica.ts'
import {
  applyMutation,
  keyString,
  type Doc,
  type JsonObject,
  type Mutation,
  type MutationIntent,
  type RecordKey,
  type RejectedMutation,
  type SyncRequest,
  type SyncResponse,
} from '../sync.ts'

export type SyncSender = (request: SyncRequest) => SyncResponse | Promise<SyncResponse>

export interface MemoryReplicaOptions {
  readonly clientId?: string
  readonly now?: () => Date
  readonly registry?: EntityRegistry
}

function toMutation(
  intent: MutationIntent,
  meta: { mid: number; workspaceId: string; recordId: string; at: string },
): Mutation {
  const base = { ...meta, collection: intent.collection }
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

export class MemoryReplica {
  readonly clientId: string
  cursors: Record<string, number> = {}
  workspaces: WorkspaceInfo[] = []
  resetWorkspaceIds: string[] = []
  readonly rejected: RejectedMutation[] = []

  private readonly records = new Map<string, LocalRecord>()
  private outbox: Mutation[] = []
  private nextMid = 1
  private readonly now: () => Date
  private readonly registry: EntityRegistry

  constructor(options: MemoryReplicaOptions = {}) {
    this.clientId = options.clientId ?? uuidv7()
    this.now = options.now ?? (() => new Date())
    this.registry = options.registry ?? ENTITIES
  }

  /**
   * Yerel yazma. Önce doğrular ve yerelde uygular, sonra giden kutusuna koyar.
   * Geçersiz veri `AppError('validation')` fırlatır ve hiçbir şey değişmez.
   * Hiçbir şeyi değiştirmeyen yazma (aynı değer, zaten silinmiş…) kuyruğa konmaz.
   */
  write(workspaceId: string, recordId: string, intent: MutationIntent): Doc | null {
    const key: RecordKey = { workspaceId, collection: intent.collection, id: recordId }
    const local = this.records.get(keyString(key))
    const result = applyMutation(local?.view ?? null, intent, this.registry)
    if (!result.ok) throw new AppError(result.code, result.message, result.details)
    if (!result.changed || result.doc === null) return result.doc
    this.records.set(keyString(key), { key, view: result.doc, server: local?.server ?? null })
    if (workspaceId !== LOCAL_WORKSPACE_ID) this.enqueue(intent, workspaceId, recordId)
    return result.doc
  }

  buildRequest(): SyncRequest {
    return buildSyncRequest({ clientId: this.clientId, cursors: this.cursors, outbox: this.outbox })
  }

  /** Sunucu yanıtını yerel durumla uzlaştırır (plan çıkar + uygula). */
  applyResponse(response: SyncResponse): ReconcilePlan {
    const plan = planReconcile({
      response,
      outbox: this.outbox,
      cursors: this.cursors,
      knownWorkspaceIds: this.knownWorkspaceIds(),
      getLocal: (key) => this.records.get(keyString(key)),
      registry: this.registry,
    })
    const acked = new Set(plan.ackedMids)
    const dropped = new Set(plan.droppedWorkspaceIds)
    this.outbox = this.outbox.filter((mutation) => !acked.has(mutation.mid) && !dropped.has(mutation.workspaceId))
    for (const [id, record] of this.records) if (dropped.has(record.key.workspaceId)) this.records.delete(id)
    for (const key of plan.removals) this.records.delete(keyString(key))
    for (const record of plan.upserts) this.records.set(keyString(record.key), record)
    this.cursors = plan.cursors
    this.workspaces = plan.workspaces
    this.resetWorkspaceIds = plan.resetWorkspaceIds
    this.rejected.push(...plan.rejected)
    return plan
  }

  /** Tek gidiş-dönüş. */
  async syncOnce(send: SyncSender): Promise<ReconcilePlan> {
    return this.applyResponse(await send(this.buildRequest()))
  }

  /** Giden kutusu boşalana ve sunucuda alınacak kayıt kalmayana dek eşitler. */
  async syncUntilSettled(send: SyncSender, maxRounds = 200): Promise<void> {
    for (let round = 0; round < maxRounds; round++) {
      const plan = await this.syncOnce(send)
      if (!plan.more && this.pendingCount() === 0) return
    }
    throw new Error(`Eşitleme ${maxRounds} turda durulmadı.`)
  }

  /**
   * Sunucu eski yedeğe dönmüşse (reset) kullanıcının seçimi uygulanır:
   *  - 'push': buradaki bütün kayıtlar sunucuya yeniden gönderilir (buradaki kazanır),
   *  - 'pull': buradaki kayıtlar ve bekleyen değişiklikler atılır (sunucudaki kazanır).
   * İki durumda da imleç sıfırlanır; sonraki eşitleme alanı baştan alır.
   */
  resolveReset(workspaceId: string, choice: 'push' | 'pull'): void {
    const local = [...this.records.values()].filter((record) => record.key.workspaceId === workspaceId)
    if (choice === 'push') {
      for (const record of local) {
        const intent: MutationIntent = record.view.deleted
          ? { op: 'delete', collection: record.key.collection }
          : { op: 'put', collection: record.key.collection, data: record.view.data }
        this.enqueue(intent, workspaceId, record.key.id)
      }
    } else {
      for (const record of local) this.records.delete(keyString(record.key))
      this.outbox = this.outbox.filter((mutation) => mutation.workspaceId !== workspaceId)
    }
    this.cursors = { ...this.cursors, [workspaceId]: 0 }
    this.resetWorkspaceIds = this.resetWorkspaceIds.filter((id) => id !== workspaceId)
  }

  /** Sunucuya gönderilmeyi bekleyen değişiklik sayısı. */
  pendingCount(): number {
    return this.outbox.filter((mutation) => mutation.workspaceId !== LOCAL_WORKSPACE_ID).length
  }

  get(key: RecordKey): LocalRecord | undefined {
    return this.records.get(keyString(key))
  }

  /** Bir alan + koleksiyondaki kayıtlar, kimlik sırasıyla. Silinmişler istenmedikçe gelmez. */
  list(
    workspaceId: string,
    collection: string,
    options: { includeDeleted?: boolean } = {},
  ): { id: string; data: JsonObject; deleted: boolean }[] {
    return [...this.records.values()]
      .filter((record) => record.key.workspaceId === workspaceId && record.key.collection === collection)
      .filter((record) => options.includeDeleted === true || !record.view.deleted)
      .map((record) => ({ id: record.key.id, data: record.view.data, deleted: record.view.deleted }))
      .toSorted((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  }

  private enqueue(intent: MutationIntent, workspaceId: string, recordId: string): void {
    const mutation = toMutation(intent, { mid: this.nextMid, workspaceId, recordId, at: this.now().toISOString() })
    this.nextMid += 1
    this.outbox.push(mutation)
  }

  private knownWorkspaceIds(): string[] {
    const ids = new Set<string>(Object.keys(this.cursors))
    for (const workspace of this.workspaces) ids.add(workspace.id)
    for (const record of this.records.values()) ids.add(record.key.workspaceId)
    for (const mutation of this.outbox) ids.add(mutation.workspaceId)
    return [...ids]
  }
}
