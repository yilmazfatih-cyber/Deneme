/**
 * Yerel depo (SQLite): yazma kuralları, giden kutusu, okuma. Kaynak: uygulama/web/test/store/records.test.ts.
 */
import { AppError, LOCAL_WORKSPACE_ID, uuidv7 } from '@uygulama/shared'
import {
  createRecord,
  getRecord,
  listRecords,
  removeRecord,
  restoreRecord,
  updateRecord,
  writeRecords,
} from '../../src/lib/store/records.ts'
import { countOutbox, deleteOutbox, getRow, listOutbox, putRow } from '../../src/lib/store/rows.ts'
import { freshDb } from '../support/db.ts'

const WS = 'ws1'
const NOW = new Date('2026-11-16T09:00:00.000Z')

describe('yerel depo: yazma', () => {
  it('yeni kayıt: görünen hâl varsayılanlarla yazılır, değişiklik giden kutusuna girer', async () => {
    const db = await freshDb()
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
    expect(await db.read((sql) => listOutbox(sql))).toEqual([
      expect.objectContaining({ mid: 1, op: 'put', workspaceId: WS, collection: 'tasks', recordId: id }),
    ])
    expect((await db.read((sql) => getRow(sql, { workspaceId: WS, collection: 'tasks', id })))?.server).toBeNull()
  })

  it('hesapsız alana yazma giden kutusuna girmez', async () => {
    const db = await freshDb()
    await createRecord(db, LOCAL_WORKSPACE_ID, 'tasks', { title: 'Yalnız burada' })
    expect(await db.read(countOutbox)).toBe(0)
    expect(await listRecords(db, LOCAL_WORKSPACE_ID, 'tasks')).toHaveLength(1)
  })

  it('düzenleme yalnız GERÇEKTEN değişen alanları patch olarak gönderir', async () => {
    const db = await freshDb()
    const id = await createRecord(db, WS, 'tasks', { title: 'Rapor', note: 'ilk' })
    expect(await updateRecord(db, WS, 'tasks', id, { title: ' Rapor ', note: 'ilk' })).toBe(false)
    expect(await updateRecord(db, WS, 'tasks', id, { title: 'Rapor', done: true, note: undefined })).toBe(true)
    const outbox = await db.read((sql) => listOutbox(sql))
    expect(outbox).toHaveLength(2)
    expect(outbox[1]).toMatchObject({ op: 'patch', data: { done: true } })
  })

  it('geçersiz düzenleme alan ayrıntısıyla reddedilir ve hiçbir şey değişmez', async () => {
    const db = await freshDb()
    const id = await createRecord(db, WS, 'tasks', { title: 'Rapor' })
    const error = await updateRecord(db, WS, 'tasks', id, { title: '   ' }).catch((reason: unknown) => reason)
    expect(error).toBeInstanceOf(AppError)
    expect((error as AppError).code).toBe('validation')
    expect((error as AppError).details).toEqual([{ path: 'title', message: 'Göreve bir başlık yazın.' }])
    expect((await getRecord(db, WS, 'tasks', id))?.data.title).toBe('Rapor')
    expect(await db.read(countOutbox)).toBe(1)
  })

  it('geçersiz yeni kayıt yazılmaz (ne kayıt ne giden kutusu)', async () => {
    const db = await freshDb()
    await expect(createRecord(db, WS, 'tasks', { title: '' })).rejects.toMatchObject({ code: 'validation' })
    expect(await listRecords(db, WS, 'tasks', { includeDeleted: true })).toEqual([])
    expect(await db.read(countOutbox)).toBe(0)
  })

  it('silme mezar taşı bırakır; geri alma kaydı aynen getirir', async () => {
    const db = await freshDb()
    const id = await createRecord(db, WS, 'tasks', { title: 'Geçici', priority: 'high' })
    await removeRecord(db, WS, 'tasks', id)
    expect(await listRecords(db, WS, 'tasks')).toEqual([])
    expect(await listRecords(db, WS, 'tasks', { includeDeleted: true })).toHaveLength(1)
    await restoreRecord(db, WS, 'tasks', id)
    expect((await getRecord(db, WS, 'tasks', id))?.data.priority).toBe('high')
    expect((await db.read((sql) => listOutbox(sql))).map((mutation) => mutation.op)).toEqual([
      'put',
      'delete',
      'restore',
    ])
  })

  it('silinmiş kaydı düzenlemek etkisizdir; olmayan kaydı düzenlemek not_found verir', async () => {
    const db = await freshDb()
    const id = await createRecord(db, WS, 'tasks', { title: 'Silinecek' })
    await removeRecord(db, WS, 'tasks', id)
    expect(await updateRecord(db, WS, 'tasks', id, { title: 'Yeni' })).toBe(false)
    await expect(updateRecord(db, WS, 'tasks', uuidv7(), { title: 'Yok' })).rejects.toMatchObject({
      code: 'not_found',
    })
  })

  it('toplu yazma tek işlemdir: biri geçersizse hiçbiri yazılmaz', async () => {
    const db = await freshDb()
    const good = { recordId: uuidv7(), intent: { op: 'put', collection: 'tasks', data: { title: 'İyi' } } } as const
    const bad = { recordId: uuidv7(), intent: { op: 'put', collection: 'tasks', data: { title: '' } } } as const
    await expect(writeRecords(db, WS, [good, bad])).rejects.toBeInstanceOf(AppError)
    expect(await listRecords(db, WS, 'tasks')).toEqual([])
    expect(await writeRecords(db, WS, [good])).toBe(1)
    expect(await writeRecords(db, WS, [good])).toBe(0) // aynı veri: değişiklik yok
  })

  it('yerel yazma dinleyicileri yalnız kuyruğa giren yazmada uyarılır', async () => {
    const db = await freshDb()
    let calls = 0
    db.onLocalWrite(() => (calls += 1))
    const id = await createRecord(db, WS, 'tasks', { title: 'Bir' })
    await updateRecord(db, WS, 'tasks', id, { title: 'Bir' })
    await createRecord(db, LOCAL_WORKSPACE_ID, 'tasks', { title: 'Yerel' })
    expect(calls).toBe(1)
  })

  it('giden kutusu boşalsa da sıra numarası (mid) HİÇ geri gitmez (sunucu yinelenen sanmasın)', async () => {
    const db = await freshDb()
    await createRecord(db, WS, 'tasks', { title: 'Bir' })
    await createRecord(db, WS, 'tasks', { title: 'İki' })
    const first = await db.read((sql) => listOutbox(sql))
    expect(first.map((mutation) => mutation.mid)).toEqual([1, 2])
    await db.write((sql) => deleteOutbox(sql, [1, 2]))
    await createRecord(db, WS, 'tasks', { title: 'Üç' })
    expect((await db.read((sql) => listOutbox(sql))).map((mutation) => mutation.mid)).toEqual([3])
  })
})

describe('yerel depo: okuma', () => {
  it('eski biçimde saklanmış kayıt okunurken varsayılanlarla tamamlanır', async () => {
    const db = await freshDb()
    const id = uuidv7()
    const at = NOW.toISOString()
    // Şemaya sonradan eklenmiş alanlar (note, priority…) eski kayıtta yok.
    await db.write((sql) =>
      putRow(sql, {
        workspaceId: WS,
        collection: 'tasks',
        id,
        view: { data: { title: 'Eski kayıt' }, deleted: false },
        server: null,
        createdAt: at,
        updatedAt: at,
      }),
    )
    const [record] = await listRecords(db, WS, 'tasks')
    expect(record?.data).toMatchObject({ title: 'Eski kayıt', note: '', priority: 'normal', done: false })
  })

  it('şemaya uymayan kayıt listeden atlanır, uygulama çökmez', async () => {
    const db = await freshDb()
    const at = NOW.toISOString()
    const row = { workspaceId: WS, collection: 'tasks', server: null, createdAt: at, updatedAt: at }
    await db.write(async (sql) => {
      await putRow(sql, { ...row, id: uuidv7(), view: { data: { title: 42 }, deleted: false } })
      await putRow(sql, { ...row, id: uuidv7(), view: { data: { title: 'Sağlam' }, deleted: false } })
    })
    const warn = console.warn
    console.warn = () => {}
    try {
      expect((await listRecords(db, WS, 'tasks')).map((item) => item.data.title)).toEqual(['Sağlam'])
    } finally {
      console.warn = warn
    }
  })

  it('Türkçe ve tırnaklı metin olduğu gibi saklanır (parametreli SQL)', async () => {
    const db = await freshDb()
    const title = `İğne'yi "ÇIKAR"; DROP TABLE records; --`
    const id = await createRecord(db, WS, 'tasks', { title })
    expect((await getRecord(db, WS, 'tasks', id))?.data.title).toBe(title)
  })
})
