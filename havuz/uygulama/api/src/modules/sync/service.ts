/**
 * `POST /api/sync`'in kalbi: shared/src/testing/memoryServer.ts → `MemoryServer.sync` ile BİREBİR aynı davranış,
 * kalıcı depolamayla ve TEK BİR `BEGIN IMMEDIATE` işlemi içinde. Uygunluk testleri iki sunucuyu aynı senaryolarla
 * sınar (test/sync.conformance.test.ts).
 *
 * Akış: isteği doğrula → sürüm → cihaz kimliği bu kullanıcının mı → mid sırası → her değişikliği (daha önce
 * işlenmediyse) yetki + applyMutation ile uygula, değiştiyse alanın rev'ini bir artırıp kaydı yaz → cihazın son
 * mid'ini sakla → üyesi olunan alanları, dokunulan kayıtları ve imleçten sonraki sayfayı döndür.
 *
 * Eşzamanlılık: işlem yazma kilidini BAŞTA alır; aynı anda gelen iki eşitleme (başka bağlantılardan bile) sıraya
 * girer, rev'ler çakışmaz (test/concurrency.test.ts). İşlem içinde `await` yoktur.
 *
 * Genişletme: protokol değişikliği önce shared'da (sync.ts + conformance.ts), sonra burada yapılır.
 */
import {
  AppError,
  applyMutation,
  canWrite,
  ERROR_MESSAGES_TR,
  issuesToDetails,
  keyString,
  mutationKey,
  PROTOCOL_VERSION,
  syncRequestSchema,
  type EntityRegistry,
  type RejectedMutation,
  type ServerRecord,
  type SyncResponse,
  type WorkspaceChanges,
} from '@uygulama/shared'
import { toBool, type Db } from '../../db/database.ts'
import type { Clock } from '../../lib/random.ts'
import { MESSAGES } from '../../messages.ts'
import { listUserWorkspaces, userRoles } from '../workspaces/repo.ts'
import {
  bumpWorkspaceRev,
  findClient,
  findRecord,
  insertClient,
  recordsSince,
  toServerRecord,
  updateClient,
  upsertRecord,
} from './repo.ts'

/** Eşitlemenin ihtiyaç duyduğu en küçük bağımlılık kümesi (eşzamanlılık testi işçi iş parçacığında da kurar). */
export interface SyncDeps {
  readonly db: Db
  readonly clock: Clock
  readonly registry: EntityRegistry
  readonly pageSize: number
}

export interface SyncOutcome {
  readonly response: SyncResponse
  /** Bu istekte değişen alanlar → son rev (dürtme göndermek için). */
  readonly changed: ReadonlyMap<string, number>
  /** İsteği yapan cihaz (dürtmede "bunu ben yaptım" bilgisi). */
  readonly clientId: string
}

function parseRequest(raw: unknown) {
  const parsed = syncRequestSchema.safeParse(raw)
  if (!parsed.success) {
    const details = issuesToDetails(parsed.error)
    throw new AppError('validation', details[0]?.message, details)
  }
  if (parsed.data.protocolVersion !== PROTOCOL_VERSION) throw new AppError('upgrade_required')
  return parsed.data
}

export function runSync(deps: SyncDeps, userId: string, raw: unknown): SyncOutcome {
  const request = parseRequest(raw)
  const { db } = deps
  return db.transaction(() => {
    const client = findClient(db, request.clientId)
    if (client && client.user_id !== userId) throw new AppError('forbidden')
    let previousMid = 0
    for (const mutation of request.mutations) {
      if (mutation.mid <= previousMid) throw new AppError('validation', MESSAGES.mutationsOutOfOrder)
      previousMid = mutation.mid
    }
    const now = deps.clock.now().toISOString()
    if (!client) insertClient(db, request.clientId, userId, now)

    let lastMutationId = client?.last_mutation_id ?? 0
    const roles = userRoles(db, userId)
    const rejected: RejectedMutation[] = []
    const changed = new Map<string, number>()
    for (const mutation of request.mutations) {
      if (mutation.mid <= lastMutationId) continue // daha önce işlendi (yanıt yolda kaybolmuş, yeniden gelmiş)
      lastMutationId = mutation.mid // reddedilse de ilerler: reddedilen değişiklik yeniden denenmez
      const role = roles.get(mutation.workspaceId)
      if (!role || !canWrite(role)) {
        rejected.push({ mid: mutation.mid, code: 'forbidden', message: ERROR_MESSAGES_TR.forbidden })
        continue
      }
      const existing = findRecord(db, mutation.workspaceId, mutation.collection, mutation.recordId)
      const current = existing
        ? { data: JSON.parse(existing.data) as Record<string, unknown>, deleted: toBool(existing.deleted) }
        : null
      const result = applyMutation(current, mutation, deps.registry)
      if (!result.ok) {
        rejected.push({ mid: mutation.mid, code: result.code, message: result.message })
        continue
      }
      if (!result.changed || result.doc === null) continue
      const rev = bumpWorkspaceRev(db, mutation.workspaceId, now)
      upsertRecord(db, {
        workspaceId: mutation.workspaceId,
        collection: mutation.collection,
        id: mutation.recordId,
        data: result.doc.data,
        deleted: result.doc.deleted,
        rev,
        createdAt: existing?.created_at ?? now,
        updatedAt: now,
        updatedBy: userId,
      })
      changed.set(mutation.workspaceId, rev)
    }
    updateClient(db, request.clientId, lastMutationId, now)

    const workspaces = listUserWorkspaces(db, userId)
    const memberOf = new Set(workspaces.map((workspace) => workspace.id))

    const touched = new Map<string, ServerRecord>()
    for (const mutation of request.mutations) {
      const key = keyString(mutationKey(mutation))
      if (touched.has(key) || !memberOf.has(mutation.workspaceId)) continue
      const row = findRecord(db, mutation.workspaceId, mutation.collection, mutation.recordId)
      if (row) touched.set(key, toServerRecord(row))
    }

    const changes: Record<string, WorkspaceChanges> = {}
    for (const workspace of workspaces) {
      const cursor = request.cursors[workspace.id] ?? 0
      if (cursor > workspace.rev) {
        changes[workspace.id] = { records: [], cursor, more: false, reset: true }
        continue
      }
      const rows = recordsSince(db, workspace.id, cursor, deps.pageSize + 1)
      const page = rows.slice(0, deps.pageSize).map(toServerRecord)
      changes[workspace.id] = {
        records: page,
        cursor: page.at(-1)?.rev ?? cursor,
        more: rows.length > deps.pageSize,
        reset: false,
      }
    }

    const response: SyncResponse = { lastMutationId, rejected, touched: [...touched.values()], workspaces, changes }
    return { response, changed, clientId: request.clientId }
  })
}
