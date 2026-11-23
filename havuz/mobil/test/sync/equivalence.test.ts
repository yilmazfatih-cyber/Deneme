/**
 * EŞDEĞERLİK KANITI: SQLite tabanlı yerel depo (src/lib/sync/apply.ts + src/lib/store) ile başvuru gerçeklemesi
 * MemoryReplica (shared/testing/memoryReplica.ts) aynı adımlarda AYNI durumu üretir.
 *
 * Yöntem: iki "ikiz" cihaz aynı cihaz kimliğini taşır. Her adımda ikisine aynı yerel yazma yapılır; eşitlemede
 * ikisinin kurduğu istek karşılaştırılır, sunucuya biri gönderilir ve AYNI yanıt ikisine de uygulanır.
 * Bu sırada başka bir cihaz ortak alanı değiştirir, yetkiler değişir, yanıtlar kaybolur, sunucu yedeğe döner.
 * Başarısız olursa iletideki tohumla birebir yeniden üretilir. Kaynak: uygulama/web/test/sync/equivalence.test.ts.
 */
import { ENTITIES, isAppError, uuidv7, type Mutation, type MutationIntent, type SyncRequest } from '@uygulama/shared'
import { createRng, MemoryReplica, MemoryServer, type Rng } from '@uygulama/shared/testing'
import type { LocalDb } from '../../src/lib/store/localDb.ts'
import { getMeta, setMeta } from '../../src/lib/store/meta.ts'
import { writeRecord } from '../../src/lib/store/records.ts'
import { countOutbox } from '../../src/lib/store/rows.ts'
import { applySyncResponse, readSyncRequest, resolveReset } from '../../src/lib/sync/apply.ts'
import { freshDb, viaJson } from '../support/db.ts'

const NOW = new Date('2026-11-16T09:00:00.000Z')

/** Senaryoların gerçekten zor durumlardan geçtiğinin sayacı (sonda denetlenir). */
const seen = { syncs: 0, rejected: 0, dropped: 0, resets: 0, resolved: 0, more: 0 }

function randomIntent(rng: Rng, exists: boolean): MutationIntent {
  const roll = rng.next()
  const collection = rng.chance(0.8) ? 'tasks' : 'lists'
  if (!exists || roll < 0.25) {
    if (collection === 'lists')
      return { op: 'put', collection, data: { name: rng.chance(0.1) ? '' : `Liste ${rng.int(9)}` } }
    return { op: 'put', collection, data: rng.chance(0.1) ? { title: '' } : { title: `Görev ${rng.int(1000)}` } }
  }
  if (roll < 0.7) {
    if (collection === 'lists') return { op: 'patch', collection, data: { color: rng.pick(['red', 'green', 'mor']) } }
    const field = rng.pick(['title', 'done', 'note', 'priority'] as const) ?? 'done'
    const values = {
      title: `Başlık ${rng.int(99)}`,
      done: rng.chance(0.5),
      note: `not ${rng.int(9)}`,
      priority: 'high',
    }
    return { op: 'patch', collection, data: { [field]: rng.chance(0.1) ? 12 : values[field] } }
  }
  return { op: roll < 0.88 ? 'delete' : 'restore', collection }
}

/** Mutasyonların anlamsal karşılaştırması: aynı sıra numaraları, kayıt başına aynı işlem sırası. */
function normalize(request: SyncRequest) {
  const byRecord = new Map<string, Omit<Mutation, 'mid'>[]>()
  for (const { mid: _mid, ...body } of request.mutations) {
    const key = `${body.workspaceId}/${body.collection}/${body.recordId}`
    byRecord.set(key, [...(byRecord.get(key) ?? []), body])
  }
  return {
    clientId: request.clientId,
    cursors: request.cursors,
    mids: request.mutations.map((mutation) => mutation.mid),
    byRecord: Object.fromEntries([...byRecord.entries()].toSorted(([a], [b]) => (a < b ? -1 : 1))),
  }
}

interface SqlRow {
  workspace_id: string
  collection: string
  id: string
  view_data: string
  view_deleted: number
  server: string | null
}

async function expectSameState(memory: MemoryReplica, db: LocalDb, label: string): Promise<void> {
  expect([label, await db.read((sql) => getMeta(sql, 'cursors'))]).toEqual([label, memory.cursors])
  expect([label, await db.read((sql) => getMeta(sql, 'workspaces'))]).toEqual([label, memory.workspaces])
  expect([label, await db.read((sql) => getMeta(sql, 'resetWorkspaceIds'))]).toEqual([label, memory.resetWorkspaceIds])
  expect([label, await db.read(countOutbox)]).toEqual([label, memory.pendingCount()])
  const rows = await db.read((sql) => sql.all<SqlRow>('SELECT * FROM records'))
  const workspaceIds = new Set([...rows.map((row) => row.workspace_id), ...memory.workspaces.map((ws) => ws.id)])
  for (const workspaceId of workspaceIds) {
    for (const collection of Object.keys(ENTITIES)) {
      const expected = memory.list(workspaceId, collection, { includeDeleted: true }).map((item) => ({
        ...item,
        server: memory.get({ workspaceId, collection, id: item.id })?.server ?? null,
      }))
      const actual = rows
        .filter((row) => row.workspace_id === workspaceId && row.collection === collection)
        .map((row) => ({
          id: row.id,
          data: JSON.parse(row.view_data) as unknown,
          deleted: row.view_deleted === 1,
          server: row.server === null ? null : (JSON.parse(row.server) as unknown),
        }))
        .toSorted((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      expect([`${label}: ${workspaceId}/${collection}`, actual]).toEqual([
        `${label}: ${workspaceId}/${collection}`,
        expected,
      ])
    }
  }
}

async function scenario(seed: number): Promise<void> {
  const rng = createRng(seed)
  const server = new MemoryServer({ pageSize: 4, now: () => NOW })
  const ayse = server.createUser('Ayşe')
  const burak = server.createUser('Burak')
  const shared = server.createWorkspace(ayse.userId, 'Ortak')
  server.setMember(shared, burak.userId, 'editor')

  const clientId = uuidv7()
  const memory = new MemoryReplica({ clientId, now: () => NOW })
  const db = await freshDb()
  await db.write((sql) => setMeta(sql, 'clientId', clientId))
  const other = new MemoryReplica()
  const recordIds = Array.from({ length: 10 }, () => uuidv7())
  const workspaces = [burak.personalWorkspaceId, shared]

  for (let step = 0; step < 220; step++) {
    const label = `tohum ${seed}, adım ${step}`
    const action = rng.next()
    if (action < 0.45) {
      const workspaceId = rng.pick(workspaces) ?? shared
      const recordId = rng.pick(recordIds) ?? recordIds[0]!
      const intent = randomIntent(rng, rng.chance(0.7))
      let memoryError: string | null = null
      try {
        memory.write(workspaceId, recordId, intent)
      } catch (error) {
        memoryError = isAppError(error) ? error.code : String(error)
      }
      const sqliteError = await writeRecord(db, workspaceId, recordId, intent, { now: NOW }).then(
        () => null,
        (error: unknown) => (isAppError(error) ? error.code : String(error)),
      )
      expect([label, sqliteError]).toEqual([label, memoryError])
    } else if (action < 0.75) {
      const request = memory.buildRequest()
      expect([label, normalize(await readSyncRequest(db))]).toEqual([label, normalize(request)])
      const response = server.sync(burak.userId, viaJson(request))
      if (rng.chance(0.2)) continue // yanıt yolda kayboldu: iki ikiz de görmedi
      const plan = memory.applyResponse(viaJson(response))
      await applySyncResponse(db, viaJson(response), NOW)
      seen.syncs += 1
      seen.rejected += plan.rejected.length
      seen.dropped += plan.droppedWorkspaceIds.length
      seen.resets += plan.resetWorkspaceIds.length
      seen.more += plan.more ? 1 : 0
      await expectSameState(memory, db, label)
    } else if (action < 0.9) {
      const recordId = rng.pick(recordIds) ?? recordIds[0]!
      try {
        other.write(shared, recordId, randomIntent(rng, true))
      } catch {
        // Geçersiz yazma (olmayan kayda patch vb.) beklenen bir durum.
      }
      await other.syncOnce((request) => server.sync(ayse.userId, viaJson(request)))
    } else if (action < 0.96) {
      const role = rng.pick(['viewer', 'editor', 'remove', 'editor'] as const) ?? 'editor'
      server.setMember(shared, burak.userId, role === 'remove' ? null : role)
    } else if (memory.resetWorkspaceIds.length > 0) {
      const workspaceId = memory.resetWorkspaceIds[0]!
      const choice = rng.chance(0.5) ? 'push' : 'pull'
      memory.resolveReset(workspaceId, choice)
      await resolveReset(db, workspaceId, choice, NOW)
      seen.resolved += 1
      await expectSameState(memory, db, `${label}: reset ${choice}`)
    } else {
      const workspaceId = rng.pick(workspaces) ?? shared
      const rev = server.recordsOf(workspaceId).at(-1)?.rev ?? 0
      server.rollback(workspaceId, Math.max(0, rev - 1 - rng.int(3)))
    }
  }
  await expectSameState(memory, db, `tohum ${seed}, son`)
}

describe('SQLite deposu ile MemoryReplica eşdeğerliği', () => {
  afterAll(() => {
    // Senaryo üreteci bozulup kolay durumlara düşerse test anlamsızlaşır; bunu yakalar.
    for (const [name, count] of Object.entries(seen)) expect([name, count > 0]).toEqual([name, true])
  })

  it.each(Array.from({ length: 12 }, (_, index) => index + 1))('tohum %i', async (seed) => {
    await scenario(seed)
  })
})
