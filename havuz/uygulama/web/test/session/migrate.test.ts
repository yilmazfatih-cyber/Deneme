/**
 * @vitest-environment node
 * Hesapsız kullanımdan hesaba taşıma: kayıtlar kişisel alana put olarak aktarılır, kimlikler (ve görev → liste
 * bağı) korunur, eşitlenince sunucuda görünür; yeniden çalıştırmak güvenlidir.
 */
import { LOCAL_WORKSPACE_ID } from '@uygulama/shared'
import { MemoryServer } from '@uygulama/shared/testing'
import { describe, expect, it } from 'vitest'
import { countLocalRecords, migrateLocalToAccount, totalCount } from '../../src/lib/session/migrate.ts'
import { pickWorkspace } from '../../src/lib/session/workspace.ts'
import { createRecord, listRecords, removeRecord } from '../../src/lib/store/records.ts'
import { SyncEngine } from '../../src/lib/sync/engine.ts'
import { fakeNetwork, freshDb } from '../helpers/sync.ts'

describe('yerel kayıtları hesaba taşıma', () => {
  it('kayıtlar kişisel alana taşınır, eşitlenir; silinenler taşınmaz; yerel alan boşalır', async () => {
    const localDb = freshDb()
    const listId = await createRecord(localDb, LOCAL_WORKSPACE_ID, 'lists', { name: 'Market' })
    const taskId = await createRecord(localDb, LOCAL_WORKSPACE_ID, 'tasks', { title: 'Ekmek', listId })
    const gone = await createRecord(localDb, LOCAL_WORKSPACE_ID, 'tasks', { title: 'Silinen' })
    await removeRecord(localDb, LOCAL_WORKSPACE_ID, 'tasks', gone)
    expect(await countLocalRecords(localDb)).toEqual({ tasks: 1, lists: 1 })
    expect(await localDb.outbox.count()).toBe(0) // hesapsız yazmalar hiç kuyruğa girmez

    const server = new MemoryServer()
    const user = server.createUser('Ayşe')
    const userDb = freshDb()
    expect(await migrateLocalToAccount(localDb, userDb, user.personalWorkspaceId)).toBe(2)
    expect(totalCount(await countLocalRecords(localDb))).toBe(0)
    expect((await userDb.outbox.toArray()).map((mutation) => mutation.op)).toEqual(['put', 'put'])

    const engine = new SyncEngine({
      db: userDb,
      send: fakeNetwork(server, user.userId).send,
      lock: { useWebLocks: false },
    })
    await engine.syncNow()
    const onServer = server.recordsOf(user.personalWorkspaceId)
    expect(onServer.map((record) => record.id).toSorted()).toEqual([listId, taskId].toSorted())
    expect(onServer.find((record) => record.id === taskId)?.data).toMatchObject({ title: 'Ekmek', listId })
  })

  it('yeniden çalıştırmak çift kayıt üretmez', async () => {
    const localDb = freshDb()
    const userDb = freshDb()
    await createRecord(localDb, LOCAL_WORKSPACE_ID, 'tasks', { title: 'Bir kez' })
    const rows = await localDb.records.toArray()
    await migrateLocalToAccount(localDb, userDb, 'kisisel')
    await localDb.records.bulkPut(rows) // kesinti sonrası kaynak hâlâ duruyormuş gibi
    expect(await migrateLocalToAccount(localDb, userDb, 'kisisel')).toBe(1)
    expect(await listRecords(userDb, 'kisisel', 'tasks')).toHaveLength(1)
    expect(await userDb.outbox.count()).toBe(1) // aynı veri ikinci kez değişiklik yaratmadı
  })
})

describe('alan seçimi', () => {
  const ws = (id: string, kind: 'personal' | 'shared') => ({
    id,
    name: id,
    kind,
    role: 'owner' as const,
    rev: 0,
    memberCount: 1,
  })
  it('seçili alan yoksa kişisel alan, o da yoksa ilk alan', () => {
    const list = [ws('ortak', 'shared'), ws('kisisel', 'personal')]
    expect(pickWorkspace(list, 'ortak')?.id).toBe('ortak')
    expect(pickWorkspace(list, 'silinmis')?.id).toBe('kisisel')
    expect(pickWorkspace([ws('ortak', 'shared')], null)?.id).toBe('ortak')
    expect(pickWorkspace([], null)).toBeNull()
  })
})
