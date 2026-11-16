/**
 * Bellek içi BAŞVURU SUNUCUSU: eşitleme protokolünün çalışan tanımı.
 * Gerçek API (api/) birebir bu davranışı göstermek zorundadır; ikisi de aynı uygunluk testlerinden geçer
 * (bkz. conformance.ts). Web testleri de ağ yerine bunu kullanır.
 *
 * Yalnız test ve gösterim içindir: kalıcılık, kimlik doğrulama ve eşzamanlılık denetimi yoktur.
 *
 * Genişletme: protokol davranışını değiştirecekseniz ÖNCE conformance.ts'e senaryo ekleyin, sonra burayı ve
 * api/src/modules/sync'i birlikte güncelleyin.
 */
import { canWrite, type WorkspaceInfo, type WorkspaceKind, type WorkspaceRole } from '../api.ts'
import { ENTITIES, type EntityRegistry } from '../entities/index.ts'
import { AppError, ERROR_MESSAGES_TR } from '../errors.ts'
import { uuidv7 } from '../ids.ts'
import {
  applyMutation,
  keyString,
  mutationKey,
  PROTOCOL_VERSION,
  SYNC_LIMITS,
  syncRequestSchema,
  type RecordKey,
  type RejectedMutation,
  type ServerRecord,
  type SyncResponse,
  type WorkspaceChanges,
} from '../sync.ts'

interface WorkspaceState {
  readonly id: string
  name: string
  readonly kind: WorkspaceKind
  rev: number
  readonly members: Map<string, { role: WorkspaceRole; joinedAt: string }>
}

export interface MemoryServerOptions {
  readonly now?: () => Date
  readonly registry?: EntityRegistry
  /** Alan başına sayfa boyutu (testte küçük verilip sayfalama denenir). */
  readonly pageSize?: number
}

export class MemoryServer {
  private readonly now: () => Date
  private readonly registry: EntityRegistry
  private readonly pageSize: number
  private readonly users = new Map<string, { id: string; name: string }>()
  private readonly workspaces = new Map<string, WorkspaceState>()
  private readonly records = new Map<string, ServerRecord>()
  private readonly clients = new Map<string, { userId: string; lastMutationId: number }>()

  constructor(options: MemoryServerOptions = {}) {
    this.now = options.now ?? (() => new Date())
    this.registry = options.registry ?? ENTITIES
    this.pageSize = options.pageSize ?? SYNC_LIMITS.maxChangesPerWorkspace
  }

  /** Kullanıcı açar; gerçek API'deki gibi kişisel alanı da birlikte açılır. */
  createUser(name = 'Kullanıcı'): { userId: string; personalWorkspaceId: string } {
    const userId = uuidv7()
    this.users.set(userId, { id: userId, name })
    const personalWorkspaceId = this.createWorkspace(userId, 'Kişisel', 'personal')
    return { userId, personalWorkspaceId }
  }

  createWorkspace(ownerId: string, name: string, kind: WorkspaceKind = 'shared'): string {
    this.requireUser(ownerId)
    const id = uuidv7()
    const members = new Map<string, { role: WorkspaceRole; joinedAt: string }>([
      [ownerId, { role: 'owner', joinedAt: this.now().toISOString() }],
    ])
    this.workspaces.set(id, { id, name, kind, rev: 0, members })
    return id
  }

  /** Üye ekler, rolünü değiştirir ya da (`role: null`) çıkarır. */
  setMember(workspaceId: string, userId: string, role: WorkspaceRole | null): void {
    this.requireUser(userId)
    const workspace = this.workspaces.get(workspaceId)
    if (!workspace) throw new AppError('not_found')
    if (role === null) workspace.members.delete(userId)
    else {
      const joinedAt = workspace.members.get(userId)?.joinedAt ?? this.now().toISOString()
      workspace.members.set(userId, { role, joinedAt })
    }
  }

  /** `POST /api/sync` karşılığı. Hatalı istekte `AppError` fırlatır. */
  sync(userId: string, rawRequest: unknown): SyncResponse {
    this.requireUser(userId)
    const parsed = syncRequestSchema.safeParse(rawRequest)
    if (!parsed.success) throw new AppError('validation', parsed.error.issues[0]?.message)
    const request = parsed.data
    if (request.protocolVersion !== PROTOCOL_VERSION) throw new AppError('upgrade_required')

    let client = this.clients.get(request.clientId)
    if (client && client.userId !== userId) throw new AppError('forbidden')
    if (!client) {
      client = { userId, lastMutationId: 0 }
      this.clients.set(request.clientId, client)
    }

    let previousMid = 0
    for (const mutation of request.mutations) {
      if (mutation.mid <= previousMid)
        throw new AppError('validation', 'Değişiklikler artan sıra numarasıyla gönderilmeli.')
      previousMid = mutation.mid
    }

    const rejected: RejectedMutation[] = []
    for (const mutation of request.mutations) {
      if (mutation.mid <= client.lastMutationId) continue // daha önce işlendi (yanıt yolda kaybolmuş, yeniden gelmiş)
      client.lastMutationId = mutation.mid // reddedilse de ilerler: reddedilen değişiklik yeniden denenmez
      const workspace = this.workspaces.get(mutation.workspaceId)
      const role = workspace?.members.get(userId)?.role
      if (!workspace || !role || !canWrite(role)) {
        rejected.push({ mid: mutation.mid, code: 'forbidden', message: ERROR_MESSAGES_TR.forbidden })
        continue
      }
      const id = keyString(mutationKey(mutation))
      const existing = this.records.get(id)
      const result = applyMutation(
        existing ? { data: existing.data, deleted: existing.deleted } : null,
        mutation,
        this.registry,
      )
      if (!result.ok) {
        rejected.push({ mid: mutation.mid, code: result.code, message: result.message })
        continue
      }
      if (!result.changed || result.doc === null) continue
      workspace.rev += 1
      const at = this.now().toISOString()
      this.records.set(id, {
        workspaceId: mutation.workspaceId,
        collection: mutation.collection,
        id: mutation.recordId,
        data: result.doc.data,
        deleted: result.doc.deleted,
        rev: workspace.rev,
        createdAt: existing?.createdAt ?? at,
        updatedAt: at,
        updatedBy: userId,
      })
    }

    const memberWorkspaces = [...this.workspaces.values()].filter((workspace) => workspace.members.has(userId))

    const touched = new Map<string, ServerRecord>()
    for (const mutation of request.mutations) {
      const key: RecordKey = mutationKey(mutation)
      const record = this.records.get(keyString(key))
      if (record && this.workspaces.get(key.workspaceId)?.members.has(userId)) touched.set(keyString(key), record)
    }

    const changes: Record<string, WorkspaceChanges> = {}
    for (const workspace of memberWorkspaces) {
      const cursor = request.cursors[workspace.id] ?? 0
      if (cursor > workspace.rev) {
        changes[workspace.id] = { records: [], cursor, more: false, reset: true }
        continue
      }
      const newer = this.recordsOf(workspace.id).filter((record) => record.rev > cursor)
      const page = newer.slice(0, this.pageSize)
      changes[workspace.id] = {
        records: page,
        cursor: page.at(-1)?.rev ?? cursor,
        more: newer.length > page.length,
        reset: false,
      }
    }

    return {
      lastMutationId: client.lastMutationId,
      rejected,
      touched: [...touched.values()],
      workspaces: memberWorkspaces.map((workspace) => this.infoFor(workspace, userId)),
      changes,
    }
  }

  /** Bir alandaki bütün kayıtlar (silinmişler dahil), `rev` sırasıyla. */
  recordsOf(workspaceId: string): ServerRecord[] {
    return [...this.records.values()]
      .filter((record) => record.workspaceId === workspaceId)
      .toSorted((a, b) => a.rev - b.rev)
  }

  /**
   * "Sunucu eski bir yedeğe döndü" durumunu taklit eder: `toRev`'den sonra değişen kayıtlar yok olur,
   * alanın sayacı geri sarılır. (Gerçek bir yedekte o kayıtların eski hâli kalırdı; test için bu kadarı yeter.)
   */
  rollback(workspaceId: string, toRev: number): void {
    const workspace = this.workspaces.get(workspaceId)
    if (!workspace) throw new AppError('not_found')
    for (const [id, record] of this.records) {
      if (record.workspaceId === workspaceId && record.rev > toRev) this.records.delete(id)
    }
    workspace.rev = Math.min(workspace.rev, toRev)
  }

  private infoFor(workspace: WorkspaceState, userId: string): WorkspaceInfo {
    const role = workspace.members.get(userId)?.role
    if (!role) throw new AppError('forbidden')
    return {
      id: workspace.id,
      name: workspace.name,
      kind: workspace.kind,
      role,
      rev: workspace.rev,
      memberCount: workspace.members.size,
    }
  }

  private requireUser(userId: string): void {
    if (!this.users.has(userId)) throw new AppError('unauthorized')
  }
}
