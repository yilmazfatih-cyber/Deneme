import { describe, expect, it } from 'vitest'
import {
  affectedKeys,
  AppError,
  buildSyncRequest,
  LOCAL_WORKSPACE_ID,
  planReconcile,
  PROTOCOL_VERSION,
  SYNC_LIMITS,
  syncBackoffMs,
  type LocalRecord,
  type Mutation,
  type RecordKey,
  type ServerRecord,
  type SyncResponse,
  type WorkspaceInfo,
} from '../src/index.ts'
import { MemoryReplica, MemoryServer } from '../src/testing/index.ts'

const AT = '2026-01-01T00:00:00.000Z'
const WS = 'ws1'

const full = (data: Record<string, unknown>) => ({
  listId: null,
  title: 'Görev',
  note: '',
  done: false,
  dueDate: null,
  priority: 'normal',
  order: 0,
  ...data,
})

function serverRecord(id: string, rev: number, data: Record<string, unknown> = {}, deleted = false): ServerRecord {
  return {
    workspaceId: WS,
    collection: 'tasks',
    id,
    data: full(data),
    deleted,
    rev,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: 'u1',
  }
}

function patch(mid: number, id: string, data: Record<string, unknown>, workspaceId = WS): Mutation {
  return { mid, workspaceId, collection: 'tasks', recordId: id, at: AT, op: 'patch', data }
}

function put(mid: number, id: string, data: Record<string, unknown>, workspaceId = WS): Mutation {
  return { mid, workspaceId, collection: 'tasks', recordId: id, at: AT, op: 'put', data }
}

const workspace = (id = WS): WorkspaceInfo => ({
  id,
  name: 'Alan',
  kind: 'shared',
  role: 'owner',
  rev: 0,
  memberCount: 1,
})

function response(part: Partial<SyncResponse>): SyncResponse {
  return { lastMutationId: 0, rejected: [], touched: [], workspaces: [workspace()], changes: {}, ...part }
}

function localStore(records: LocalRecord[]) {
  const map = new Map(records.map((record) => [JSON.stringify(record.key), record]))
  return (key: RecordKey) => map.get(JSON.stringify(key))
}

const key = (id: string, workspaceId = WS): RecordKey => ({ workspaceId, collection: 'tasks', id })

describe('buildSyncRequest', () => {
  it('giden kutusunu mid sırasıyla ve sınır kadar alır; yerel alanı göndermez', () => {
    const outbox = [
      ...Array.from({ length: 130 }, (_, index) => patch(130 - index, 'r', { order: index })),
      patch(500, 'x', { done: true }, LOCAL_WORKSPACE_ID),
    ]
    const request = buildSyncRequest({ clientId: 'c1', cursors: { [WS]: 7, [LOCAL_WORKSPACE_ID]: 3 }, outbox })
    expect(request.protocolVersion).toBe(PROTOCOL_VERSION)
    expect(request.mutations).toHaveLength(SYNC_LIMITS.maxMutationsPerRequest)
    expect(request.mutations.map((mutation) => mutation.mid)).toEqual(
      Array.from({ length: 100 }, (_, index) => index + 1),
    )
    expect(request.cursors).toEqual({ [WS]: 7 })
  })
})

describe('planReconcile', () => {
  it('onaylananları giden kutusundan düşer ve sunucu hâlini yazar', () => {
    const outbox = [put(1, 'a', { title: 'Yeni' })]
    const plan = planReconcile({
      response: response({ lastMutationId: 1, touched: [serverRecord('a', 1, { title: 'Yeni' })] }),
      outbox,
      cursors: {},
      knownWorkspaceIds: [WS],
      getLocal: localStore([{ key: key('a'), view: { data: full({ title: 'Yeni' }), deleted: false }, server: null }]),
    })
    expect(plan.ackedMids).toEqual([1])
    expect(plan.removals).toEqual([])
    expect(plan.upserts).toHaveLength(1)
    expect(plan.upserts[0]?.server?.rev).toBe(1)
    expect(plan.upserts[0]?.view).toEqual({ data: full({ title: 'Yeni' }), deleted: false })
  })

  it('görünen hâl = sunucu hâli + hâlâ bekleyen yerel değişiklikler', () => {
    const outbox = [patch(1, 'a', { done: true }), patch(2, 'a', { note: 'yerel' }), patch(3, 'b', { done: true })]
    const plan = planReconcile({
      response: response({
        lastMutationId: 1,
        changes: {
          [WS]: {
            records: [serverRecord('a', 9, { title: 'Başkası değiştirdi', done: true })],
            cursor: 9,
            more: false,
            reset: false,
          },
        },
      }),
      outbox,
      cursors: { [WS]: 4 },
      knownWorkspaceIds: [WS],
      getLocal: localStore([
        {
          key: key('a'),
          view: { data: full({ done: true, note: 'yerel' }), deleted: false },
          server: { ...serverRecord('a', 4), data: full({}) },
        },
      ]),
    })
    expect(plan.ackedMids).toEqual([1])
    expect(plan.upserts.map((record) => record.key.id)).toEqual(['a']) // 'b' etkilenmedi: dokunulmaz
    expect(plan.upserts[0]?.view.data).toEqual(full({ title: 'Başkası değiştirdi', done: true, note: 'yerel' }))
    expect(plan.cursors).toEqual({ [WS]: 9 })
  })

  it('reddedilen put: kayıt sunucuda hiç olmadıysa yerelden kaldırılır', () => {
    const plan = planReconcile({
      response: response({ lastMutationId: 1, rejected: [{ mid: 1, code: 'validation', message: 'x' }] }),
      outbox: [put(1, 'a', { title: 'Reddedilecek' })],
      cursors: {},
      knownWorkspaceIds: [WS],
      getLocal: localStore([{ key: key('a'), view: { data: full({}), deleted: false }, server: null }]),
    })
    expect(plan.removals).toEqual([key('a')])
    expect(plan.upserts).toEqual([])
    expect(plan.rejected).toHaveLength(1)
  })

  it('reddedilen patch: görünen hâl sunucunun son bilinen hâline döner', () => {
    const snapshot = {
      data: full({ title: 'Sunucu' }),
      deleted: false,
      rev: 3,
      createdAt: AT,
      updatedAt: AT,
      updatedBy: 'u1',
    }
    const plan = planReconcile({
      response: response({ lastMutationId: 1, rejected: [{ mid: 1, code: 'forbidden', message: 'x' }] }),
      outbox: [patch(1, 'a', { title: 'Yerel' })],
      cursors: { [WS]: 3 },
      knownWorkspaceIds: [WS],
      getLocal: localStore([
        { key: key('a'), view: { data: full({ title: 'Yerel' }), deleted: false }, server: snapshot },
      ]),
    })
    expect(plan.upserts[0]?.view.data).toEqual(full({ title: 'Sunucu' }))
    expect(plan.upserts[0]?.server).toEqual(snapshot)
  })

  it('geç gelen eski sayfa yeni sunucu hâlini ezmez', () => {
    const plan = planReconcile({
      response: response({
        changes: { [WS]: { records: [serverRecord('a', 2, { title: 'Eski' })], cursor: 2, more: false, reset: false } },
      }),
      outbox: [],
      cursors: { [WS]: 5 },
      knownWorkspaceIds: [WS],
      getLocal: localStore([
        {
          key: key('a'),
          view: { data: full({ title: 'Yeni' }), deleted: false },
          server: { ...serverRecord('a', 5), data: full({ title: 'Yeni' }) },
        },
      ]),
    })
    expect(plan.upserts[0]?.server?.rev).toBe(5)
    expect(plan.upserts[0]?.view.data).toEqual(full({ title: 'Yeni' }))
    expect(plan.cursors[WS]).toBe(5) // imleç geri gitmez
  })

  it('aynı kayıt hem touched hem changes içindeyse yüksek rev kazanır', () => {
    const plan = planReconcile({
      response: response({
        touched: [serverRecord('a', 7, { title: 'Son' })],
        changes: {
          [WS]: { records: [serverRecord('a', 6, { title: 'Önceki' })], cursor: 6, more: true, reset: false },
        },
      }),
      outbox: [],
      cursors: {},
      knownWorkspaceIds: [WS],
      getLocal: () => undefined,
    })
    expect(plan.upserts[0]?.view.data).toEqual(full({ title: 'Son' }))
    expect(plan.more).toBe(true)
  })

  it('silinmiş kayıt mezar taşı olarak saklanır', () => {
    const plan = planReconcile({
      response: response({
        changes: { [WS]: { records: [serverRecord('a', 3, {}, true)], cursor: 3, more: false, reset: false } },
      }),
      outbox: [],
      cursors: {},
      knownWorkspaceIds: [WS],
      getLocal: () => undefined,
    })
    expect(plan.upserts[0]?.view.deleted).toBe(true)
    expect(plan.removals).toEqual([])
  })

  it('erişimi kalkan alan düşürülür; o alanın kayıtları ve bekleyenleri plana girmez; yerel alan hiç düşmez', () => {
    const plan = planReconcile({
      response: response({
        workspaces: [workspace('kalan')],
        touched: [{ ...serverRecord('a', 1), workspaceId: 'giden' }],
      }),
      outbox: [patch(1, 'a', { done: true }, 'giden'), patch(2, 'b', { done: true }, 'kalan')],
      cursors: { giden: 4, kalan: 2 },
      knownWorkspaceIds: ['giden', 'kalan', LOCAL_WORKSPACE_ID],
      getLocal: () => undefined,
    })
    expect(plan.droppedWorkspaceIds).toEqual(['giden'])
    expect(plan.upserts).toEqual([])
    expect(plan.cursors).toEqual({ kalan: 2 })
  })

  it('reset bildirilen alanda imleç değişmez ve alan işaretlenir', () => {
    const plan = planReconcile({
      response: response({ changes: { [WS]: { records: [], cursor: 40, more: false, reset: true } } }),
      outbox: [],
      cursors: { [WS]: 40 },
      knownWorkspaceIds: [WS],
      getLocal: () => undefined,
    })
    expect(plan.resetWorkspaceIds).toEqual([WS])
    expect(plan.cursors).toEqual({ [WS]: 40 })
  })

  it('affectedKeys: onaylanan değişikliklerin ve gelen kayıtların anahtarları (yinelenmeden)', () => {
    const keys = affectedKeys(
      response({
        lastMutationId: 2,
        touched: [serverRecord('a', 1)],
        changes: {
          [WS]: { records: [serverRecord('a', 1), serverRecord('c', 2)], cursor: 2, more: false, reset: false },
        },
      }),
      [patch(1, 'a', {}), patch(2, 'b', {}), patch(3, 'z', {}), patch(1, 'yerel', {}, LOCAL_WORKSPACE_ID)],
    )
    expect(keys.map((item) => item.id).toSorted()).toEqual(['a', 'b', 'c'])
  })
})

describe('MemoryReplica', () => {
  it('geçersiz yerel yazma hata fırlatır ve hiçbir şeyi değiştirmez', () => {
    const replica = new MemoryReplica()
    expect(() => replica.write(WS, 'a', { op: 'put', collection: 'tasks', data: { title: '' } })).toThrow(AppError)
    expect(replica.pendingCount()).toBe(0)
    expect(replica.list(WS, 'tasks')).toEqual([])
  })

  it('değişiklik yaratmayan yazma kuyruğa girmez; yerel alan hiç kuyruğa girmez', () => {
    const replica = new MemoryReplica()
    replica.write(WS, 'a', { op: 'put', collection: 'tasks', data: { title: 'Bir' } })
    replica.write(WS, 'a', { op: 'patch', collection: 'tasks', data: { title: 'Bir' } })
    replica.write(WS, 'yok', { op: 'delete', collection: 'tasks' })
    expect(replica.pendingCount()).toBe(1)
    replica.write(LOCAL_WORKSPACE_ID, 'b', { op: 'put', collection: 'tasks', data: { title: 'Yerel' } })
    expect(replica.pendingCount()).toBe(1)
    expect(replica.list(LOCAL_WORKSPACE_ID, 'tasks')).toHaveLength(1)
  })

  it('yanıt yolda kaybolursa yeniden gönderim çift uygulanmaz', async () => {
    const server = new MemoryServer()
    const { userId, personalWorkspaceId: ws } = server.createUser()
    const replica = new MemoryReplica()
    replica.write(ws, 'a', { op: 'put', collection: 'tasks', data: { title: 'Bir kez' } })
    server.sync(userId, replica.buildRequest()) // sunucu işledi ama yanıt istemciye ulaşmadı
    expect(replica.pendingCount()).toBe(1)
    await replica.syncUntilSettled((request) => server.sync(userId, request))
    expect(replica.pendingCount()).toBe(0)
    expect(server.recordsOf(ws)).toHaveLength(1)
    expect(server.recordsOf(ws)[0]?.rev).toBe(1)
  })

  it('reddedilen değişiklik geri alınır ve kayda geçer', async () => {
    const server = new MemoryServer()
    const owner = server.createUser('Sahip')
    const guest = server.createUser('Konuk')
    const shared = server.createWorkspace(owner.userId, 'Ortak')
    server.setMember(shared, guest.userId, 'editor')
    const ownerReplica = new MemoryReplica()
    const guestReplica = new MemoryReplica()
    ownerReplica.write(shared, 'a', { op: 'put', collection: 'tasks', data: { title: 'Ortak görev' } })
    await ownerReplica.syncUntilSettled((request) => server.sync(owner.userId, request))
    await guestReplica.syncUntilSettled((request) => server.sync(guest.userId, request))

    server.setMember(shared, guest.userId, 'viewer') // konuk çevrimdışıyken yetkisi düşürüldü
    guestReplica.write(shared, 'a', { op: 'patch', collection: 'tasks', data: { title: 'Konuk değiştirdi' } })
    expect(guestReplica.list(shared, 'tasks')[0]?.data).toMatchObject({ title: 'Konuk değiştirdi' })
    await guestReplica.syncUntilSettled((request) => server.sync(guest.userId, request))
    expect(guestReplica.list(shared, 'tasks')[0]?.data).toMatchObject({ title: 'Ortak görev' })
    expect(guestReplica.rejected.map((item) => item.code)).toEqual(['forbidden'])
  })

  it('alandan çıkarılınca yerel kayıtlar ve bekleyenler silinir', async () => {
    const server = new MemoryServer()
    const owner = server.createUser('Sahip')
    const guest = server.createUser('Konuk')
    const shared = server.createWorkspace(owner.userId, 'Ortak')
    server.setMember(shared, guest.userId, 'editor')
    const replica = new MemoryReplica()
    replica.write(shared, 'a', { op: 'put', collection: 'tasks', data: { title: 'Konuğun görevi' } })
    await replica.syncUntilSettled((request) => server.sync(guest.userId, request))
    replica.write(shared, 'a', { op: 'patch', collection: 'tasks', data: { done: true } })
    server.setMember(shared, guest.userId, null)
    await replica.syncUntilSettled((request) => server.sync(guest.userId, request))
    expect(replica.list(shared, 'tasks', { includeDeleted: true })).toEqual([])
    expect(replica.pendingCount()).toBe(0)
    expect(replica.workspaces.map((item) => item.id)).toEqual([guest.personalWorkspaceId])
    expect(Object.keys(replica.cursors)).toEqual([guest.personalWorkspaceId])
  })

  it('sunucu eski yedeğe dönünce: "buradakini gönder" kayıpları geri yükler', async () => {
    const server = new MemoryServer()
    const { userId, personalWorkspaceId: ws } = server.createUser()
    const send = (request: Parameters<MemoryServer['sync']>[1]) => server.sync(userId, request)
    const replica = new MemoryReplica()
    replica.write(ws, 'a', { op: 'put', collection: 'tasks', data: { title: 'Eski' } })
    await replica.syncUntilSettled(send)
    replica.write(ws, 'b', { op: 'put', collection: 'tasks', data: { title: 'Yedekten sonra' } })
    replica.write(ws, 'a', { op: 'patch', collection: 'tasks', data: { done: true } })
    await replica.syncUntilSettled(send)

    server.rollback(ws, 1)
    await replica.syncOnce(send)
    expect(replica.resetWorkspaceIds).toEqual([ws])
    expect(replica.list(ws, 'tasks')).toHaveLength(2) // hiçbir şey kendiliğinden silinmez

    replica.resolveReset(ws, 'push')
    await replica.syncUntilSettled(send)
    expect(replica.resetWorkspaceIds).toEqual([])
    expect(
      server
        .recordsOf(ws)
        .map((record) => record.id)
        .toSorted(),
    ).toEqual(['a', 'b'])
    expect(server.recordsOf(ws).find((record) => record.id === 'a')?.data).toMatchObject({ done: true })
  })

  it('sunucu eski yedeğe dönünce: "sunucudakini al" yereli sunucuya eşitler', async () => {
    const server = new MemoryServer()
    const { userId, personalWorkspaceId: ws } = server.createUser()
    const send = (request: Parameters<MemoryServer['sync']>[1]) => server.sync(userId, request)
    const replica = new MemoryReplica()
    replica.write(ws, 'a', { op: 'put', collection: 'tasks', data: { title: 'Eski' } })
    await replica.syncUntilSettled(send)
    replica.write(ws, 'b', { op: 'put', collection: 'tasks', data: { title: 'Kaybolacak' } })
    await replica.syncUntilSettled(send)
    server.rollback(ws, 1)
    await replica.syncOnce(send)
    replica.resolveReset(ws, 'pull')
    await replica.syncUntilSettled(send)
    expect(replica.list(ws, 'tasks').map((item) => item.id)).toEqual(['a'])
    expect(replica.cursors[ws]).toBe(1)
  })
})

describe('syncBackoffMs', () => {
  it('üstel artar, 60 saniyede durur, titreme payı %50–100 arasıdır', () => {
    expect(syncBackoffMs(1, () => 1)).toBe(1000)
    expect(syncBackoffMs(2, () => 1)).toBe(2000)
    expect(syncBackoffMs(5, () => 1)).toBe(16_000)
    expect(syncBackoffMs(30, () => 1)).toBe(60_000)
    expect(syncBackoffMs(3, () => 0)).toBe(2000)
    expect(syncBackoffMs(0, () => 1)).toBe(1000)
  })
})
