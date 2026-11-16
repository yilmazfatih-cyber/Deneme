// @vitest-environment node
import { AppError, LOCAL_WORKSPACE_ID, uuidv7 } from '@uygulama/shared'
import { describe, expect, it } from 'vitest'
import {
  createRecord,
  getRecord,
  listRecords,
  removeRecord,
  restoreRecord,
  updateRecord,
  writeRecords,
} from '../../src/lib/store/records.ts'
import { freshDb } from '../helpers/sync.ts'

const WS = 'ws1'
const NOW = new Date('2026-11-16T09:00:00.000Z')

describe('yerel depo: yazma', () => {
  it('yeni kayıt: görünen hâl varsayılanlarla yazılır, değişiklik giden kutusuna girer', async () => {
    const db = freshDb()
    const id = await createRecord(db, WS, 'tasks', { title: '  Süt al  ' }, { now: NOW })
    const record = await getRecord(db, WS, 'tasks', id)
    expect(record?.data).toEqual({
      listId: null,
      title: 'Süt al',
      note: '',
      done: false,
      dueDate: null,
      priority: 'normal',
      order: 0,
    })
    expect(record?.createdAt).toBe(NOW.toISOString()) // UUIDv7 kimliğin zamanı
    const outbox = await db.outbox.toArray()
    expect(outbox).toEqual([
      expect.objectContaining({ mid: 1, op: 'put', workspaceId: WS, collection: 'tasks', recordId: id }),
    ])
    expect((await db.records.get([WS, 'tasks', id]))?.server).toBeNull()
  })

  it('hesapsız alana yazma giden kutusuna girmez', async () => {
    const db = freshDb()
    await createRecord(db, LOCAL_WORKSPACE_ID, 'tasks', { title: 'Yalnız burada' })
    expect(await db.outbox.count()).toBe(0)
    expect(await listRecords(db, LOCAL_WORKSPACE_ID, 'tasks')).toHaveLength(1)
  })

  it('düzenleme yalnız GERÇEKTEN değişen alanları patch olarak gönderir', async () => {
    const db = freshDb()
    const id = await createRecord(db, WS, 'tasks', { title: 'Rapor', note: 'ilk' })
    expect(await updateRecord(db, WS, 'tasks', id, { title: ' Rapor ', note: 'ilk' })).toBe(false)
    expect(await updateRecord(db, WS, 'tasks', id, { title: 'Rapor', done: true, note: undefined })).toBe(true)
    const outbox = await db.outbox.orderBy('mid').toArray()
    expect(outbox).toHaveLength(2)
    expect(outbox[1]).toMatchObject({ op: 'patch', data: { done: true } })
  })

  it('geçersiz düzenleme alan ayrıntısıyla reddedilir ve hiçbir şey değişmez', async () => {
    const db = freshDb()
    const id = await createRecord(db, WS, 'tasks', { title: 'Rapor' })
    const error = await updateRecord(db, WS, 'tasks', id, { title: '   ' }).catch((reason: unknown) => reason)
    expect(error).toBeInstanceOf(AppError)
    expect((error as AppError).code).toBe('validation')
    expect((error as AppError).details).toEqual([{ path: 'title', message: 'Göreve bir başlık yazın.' }])
    expect((await getRecord(db, WS, 'tasks', id))?.data.title).toBe('Rapor')
    expect(await db.outbox.count()).toBe(1)
  })

  it('geçersiz yeni kayıt yazılmaz', async () => {
    const db = freshDb()
    await expect(createRecord(db, WS, 'tasks', { title: '' })).rejects.toMatchObject({ code: 'validation' })
    expect(await db.records.count()).toBe(0)
    expect(await db.outbox.count()).toBe(0)
  })

  it('silme mezar taşı bırakır; geri alma kaydı aynen getirir', async () => {
    const db = freshDb()
    const id = await createRecord(db, WS, 'tasks', { title: 'Geçici', priority: 'high' })
    await removeRecord(db, WS, 'tasks', id)
    expect(await listRecords(db, WS, 'tasks')).toEqual([])
    expect(await listRecords(db, WS, 'tasks', { includeDeleted: true })).toHaveLength(1)
    await restoreRecord(db, WS, 'tasks', id)
    expect((await getRecord(db, WS, 'tasks', id))?.data.priority).toBe('high')
    expect((await db.outbox.toArray()).map((mutation) => mutation.op)).toEqual(['put', 'delete', 'restore'])
  })

  it('silinmiş kaydı düzenlemek etkisizdir; olmayan kaydı düzenlemek not_found verir', async () => {
    const db = freshDb()
    const id = await createRecord(db, WS, 'tasks', { title: 'Silinecek' })
    await removeRecord(db, WS, 'tasks', id)
    expect(await updateRecord(db, WS, 'tasks', id, { title: 'Yeni' })).toBe(false)
    await expect(updateRecord(db, WS, 'tasks', uuidv7(), { title: 'Yok' })).rejects.toMatchObject({
      code: 'not_found',
    })
  })

  it('toplu yazma tek işlemdir: biri geçersizse hiçbiri yazılmaz', async () => {
    const db = freshDb()
    const good = { recordId: uuidv7(), intent: { op: 'put', collection: 'tasks', data: { title: 'İyi' } } } as const
    const bad = { recordId: uuidv7(), intent: { op: 'put', collection: 'tasks', data: { title: '' } } } as const
    await expect(writeRecords(db, WS, [good, bad])).rejects.toBeInstanceOf(AppError)
    expect(await db.records.count()).toBe(0)
    expect(await writeRecords(db, WS, [good])).toBe(1)
    expect(await writeRecords(db, WS, [good])).toBe(0) // aynı veri: değişiklik yok
  })

  it('yerel yazma dinleyicileri yalnız kuyruğa giren yazmada uyarılır', async () => {
    const db = freshDb()
    let calls = 0
    db.onLocalWrite(() => (calls += 1))
    const id = await createRecord(db, WS, 'tasks', { title: 'Bir' })
    await updateRecord(db, WS, 'tasks', id, { title: 'Bir' })
    await createRecord(db, LOCAL_WORKSPACE_ID, 'tasks', { title: 'Yerel' })
    expect(calls).toBe(1)
  })
})

describe('yerel depo: okuma', () => {
  it('eski biçimde saklanmış kayıt okunurken varsayılanlarla tamamlanır', async () => {
    const db = freshDb()
    const id = uuidv7()
    const at = NOW.toISOString()
    // Şemaya sonradan eklenmiş alanlar (note, priority…) eski kayıtta yok.
    await db.records.put({
      workspaceId: WS,
      collection: 'tasks',
      id,
      view: { data: { title: 'Eski kayıt' }, deleted: false },
      server: null,
      createdAt: at,
      updatedAt: at,
    })
    const [record] = await listRecords(db, WS, 'tasks')
    expect(record?.data).toMatchObject({ title: 'Eski kayıt', note: '', priority: 'normal', done: false })
  })

  it('şemaya uymayan kayıt listeden atlanır, uygulama çökmez', async () => {
    const db = freshDb()
    const at = NOW.toISOString()
    const row = { workspaceId: WS, collection: 'tasks', server: null, createdAt: at, updatedAt: at }
    await db.records.put({ ...row, id: uuidv7(), view: { data: { title: 42 }, deleted: false } })
    await db.records.put({ ...row, id: uuidv7(), view: { data: { title: 'Sağlam' }, deleted: false } })
    const warn = console.warn
    console.warn = () => {}
    try {
      expect((await listRecords(db, WS, 'tasks')).map((item) => item.data.title)).toEqual(['Sağlam'])
    } finally {
      console.warn = warn
    }
  })
})
