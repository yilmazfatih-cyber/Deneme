/**
 * @vitest-environment node
 * Eşitleme motoru: gerçek Dexie deposu + MemoryServer'a bağlı sahte ağ. Çevrimdışı yazma, iki cihaz, yanıt
 * kaybı, red, erişim kaybı, reset, 401, sürüm uyuşmazlığı, tek uçuş ve geri çekilme senaryoları.
 */
import { AppError } from '@uygulama/shared'
import { MemoryServer } from '@uygulama/shared/testing'
import { describe, expect, it } from 'vitest'
import { getMeta, setMeta } from '../../src/lib/store/meta.ts'
import { createRecord, listRecords, updateRecord } from '../../src/lib/store/records.ts'
import { SyncEngine, type SyncEvent } from '../../src/lib/sync/engine.ts'
import { fakeNetwork, freshDb, manualTimers } from '../helpers/sync.ts'

function setup(options: { pageSize?: number; delayMs?: number } = {}) {
  const server = new MemoryServer({ pageSize: options.pageSize ?? 500 })
  const user = server.createUser('Ayşe')
  return { server, user, device: () => device(server, user.userId, options.delayMs) }
}

function device(server: MemoryServer, userId: string, delayMs?: number) {
  const db = freshDb()
  const network = fakeNetwork(server, userId, delayMs === undefined ? {} : { delayMs })
  const events: SyncEvent[] = []
  const timers = manualTimers()
  let online = true
  const engine = new SyncEngine({
    db,
    send: network.send,
    onEvent: (event) => events.push(event),
    random: () => 1,
    isOnline: () => online,
    timers,
    lock: { useWebLocks: false },
  })
  return {
    db,
    network,
    events,
    timers,
    engine,
    setOnline: (value: boolean) => {
      online = value
      network.offline = !value
    },
  }
}

describe('eşitleme motoru', () => {
  it('çevrimdışı yazılan kayıt, bağlantı gelince gönderilir', async () => {
    const { server, user, device: make } = setup()
    const phone = make()
    phone.setOnline(false)
    await createRecord(phone.db, user.personalWorkspaceId, 'tasks', { title: 'Çevrimdışı' })
    expect((await phone.engine.syncNow()).phase).toBe('offline')
    expect(phone.engine.status.getState().retryAt).not.toBeNull()
    expect(server.recordsOf(user.personalWorkspaceId)).toHaveLength(0)

    phone.setOnline(true)
    const status = await phone.engine.syncNow()
    expect(status).toMatchObject({ phase: 'idle', error: null, everSynced: true })
    expect(server.recordsOf(user.personalWorkspaceId).map((record) => record.data.title)).toEqual(['Çevrimdışı'])
    expect(await phone.db.outbox.count()).toBe(0)
    expect((await phone.db.records.toArray())[0]?.server?.rev).toBe(1)
  })

  it('iki cihaz aynı kayıtta farklı alanları değiştirince ikisi de birleşmiş hâli görür', async () => {
    const { user, device: make } = setup()
    const ws = user.personalWorkspaceId
    const phone = make()
    const laptop = make()
    const id = await createRecord(phone.db, ws, 'tasks', { title: 'Alışveriş' })
    await phone.engine.syncNow()
    await laptop.engine.syncNow()

    await updateRecord(phone.db, ws, 'tasks', id, { done: true })
    await updateRecord(laptop.db, ws, 'tasks', id, { note: 'ekmek, süt' })
    await laptop.engine.syncNow()
    await phone.engine.syncNow()
    await laptop.engine.syncNow()

    const onPhone = await listRecords(phone.db, ws, 'tasks')
    const onLaptop = await listRecords(laptop.db, ws, 'tasks')
    expect(onPhone.map((record) => record.data)).toEqual(onLaptop.map((record) => record.data))
    expect(onPhone[0]?.data).toMatchObject({ done: true, note: 'ekmek, süt' })
  })

  it('yanıt yolda kaybolursa yeniden gönderilir ama sunucuda iki kez uygulanmaz', async () => {
    const { server, user, device: make } = setup()
    const phone = make()
    await createRecord(phone.db, user.personalWorkspaceId, 'tasks', { title: 'Bir kez' })
    phone.network.dropResponses = 1
    expect((await phone.engine.syncNow()).phase).toBe('offline')
    expect(await phone.db.outbox.count()).toBe(1)
    await phone.engine.syncNow()
    expect(await phone.db.outbox.count()).toBe(0)
    expect(server.recordsOf(user.personalWorkspaceId)).toHaveLength(1)
    expect(server.recordsOf(user.personalWorkspaceId)[0]?.rev).toBe(1)
  })

  it('reddedilen değişiklik geri alınır, bildirilir ve kayda geçer', async () => {
    const { server, user, device: make } = setup()
    const guest = server.createUser('Konuk')
    const shared = server.createWorkspace(user.userId, 'Ev')
    server.setMember(shared, guest.userId, 'editor')
    const owner = make()
    const guestDevice = device(server, guest.userId)
    const id = await createRecord(owner.db, shared, 'tasks', { title: 'Ortak görev' })
    await owner.engine.syncNow()
    await guestDevice.engine.syncNow()

    server.setMember(shared, guest.userId, 'viewer')
    await updateRecord(guestDevice.db, shared, 'tasks', id, { title: 'Konuk değiştirdi' })
    await guestDevice.engine.syncNow()

    expect((await listRecords(guestDevice.db, shared, 'tasks'))[0]?.data.title).toBe('Ortak görev')
    expect(guestDevice.events).toEqual([
      { type: 'rejected', rejections: [expect.objectContaining({ code: 'forbidden', recordId: id, op: 'patch' })] },
    ])
    expect(await getMeta(guestDevice.db, 'rejections')).toHaveLength(1)
  })

  it('erişimi kalkan alanın kayıtları silinir, seçili alan kişisel alana döner', async () => {
    const { server, user } = setup()
    const guest = server.createUser('Konuk')
    const shared = server.createWorkspace(user.userId, 'Tatil')
    server.setMember(shared, guest.userId, 'editor')
    const guestDevice = device(server, guest.userId)
    await createRecord(guestDevice.db, shared, 'tasks', { title: 'Bilet al' })
    await guestDevice.engine.syncNow()
    await setMeta(guestDevice.db, 'currentWorkspaceId', shared)

    server.setMember(shared, guest.userId, null)
    await guestDevice.engine.syncNow()
    expect(await listRecords(guestDevice.db, shared, 'tasks', { includeDeleted: true })).toEqual([])
    expect(await getMeta(guestDevice.db, 'currentWorkspaceId')).toBeNull()
    expect(guestDevice.events).toEqual([{ type: 'dropped', workspaces: [{ id: shared, name: 'Tatil' }] }])
  })

  it('sunucu yedeğe dönünce eşitleme durur; "buradakini gönder" kayıpları geri yükler', async () => {
    const { server, user, device: make } = setup()
    const ws = user.personalWorkspaceId
    const phone = make()
    await createRecord(phone.db, ws, 'tasks', { title: 'Eski' })
    await phone.engine.syncNow()
    await createRecord(phone.db, ws, 'tasks', { title: 'Yedekten sonra' })
    await phone.engine.syncNow()

    server.rollback(ws, 1)
    const status = await phone.engine.syncNow()
    expect(status.blocked).toBe('reset')
    expect(phone.events).toContainEqual({ type: 'reset', workspaceIds: [ws] })
    // Karar verilene dek yeni yazmalar gönderilmez ama kaybolmaz.
    await createRecord(phone.db, ws, 'tasks', { title: 'Beklerken' })
    await phone.engine.syncNow()
    expect(server.recordsOf(ws)).toHaveLength(1)

    await phone.engine.resolveReset(ws, 'push')
    await phone.engine.syncNow()
    expect(phone.engine.status.getState().blocked).toBeNull()
    expect(
      server
        .recordsOf(ws)
        .map((record) => record.data.title)
        .toSorted(),
    ).toEqual(['Beklerken', 'Eski', 'Yedekten sonra'])
  })

  it('"sunucudakini al" yerel kayıtları sunucuya eşitler', async () => {
    const { server, user, device: make } = setup()
    const ws = user.personalWorkspaceId
    const phone = make()
    await createRecord(phone.db, ws, 'tasks', { title: 'Kalacak' })
    await phone.engine.syncNow()
    await createRecord(phone.db, ws, 'tasks', { title: 'Gidecek' })
    await phone.engine.syncNow()
    server.rollback(ws, 1)
    await phone.engine.syncNow()
    await phone.engine.resolveReset(ws, 'pull')
    await phone.engine.syncNow()
    expect((await listRecords(phone.db, ws, 'tasks')).map((record) => record.data.title)).toEqual(['Kalacak'])
  })

  it('401 gelince motor durur ve oturumun düştüğünü bildirir', async () => {
    const { user, device: make } = setup()
    const phone = make()
    phone.network.failNext = new AppError('unauthorized')
    await createRecord(phone.db, user.personalWorkspaceId, 'tasks', { title: 'Bekleyecek' })
    const status = await phone.engine.syncNow()
    expect(status.blocked).toBe('unauthorized')
    expect(phone.events).toEqual([{ type: 'unauthorized' }])
    phone.engine.requestSync('push')
    await phone.engine.syncNow()
    expect(phone.network.requests).toHaveLength(1) // durduktan sonra istek gitmez
    expect(await phone.db.outbox.count()).toBe(1) // veri kaybolmaz
  })

  it('protokol sürümü uyuşmazsa "sayfayı yenileyin" bildirilir', async () => {
    const { device: make } = setup()
    const phone = make()
    phone.network.failNext = new AppError('upgrade_required')
    expect((await phone.engine.syncNow()).blocked).toBe('upgrade')
    expect(phone.events).toEqual([{ type: 'upgrade_required' }])
  })

  it('sunucu hatasında üstel geri çekilmeyle yeniden dener; başarı sayacı sıfırlar', async () => {
    const { user, device: make } = setup()
    const phone = make()
    await createRecord(phone.db, user.personalWorkspaceId, 'tasks', { title: 'Deneme' })
    phone.network.failNext = new AppError('internal')
    expect(await phone.engine.syncNow()).toMatchObject({ phase: 'error', error: { code: 'internal' } })
    expect(phone.timers.scheduled.map((item) => item.ms)).toEqual([1000])

    phone.network.failNext = new AppError('internal')
    await phone.engine.syncNow() // "Şimdi eşitle" beklemeyi bozar; yine başarısız → bekleme ikiye katlanır
    expect(phone.timers.scheduled.map((item) => item.ms)).toEqual([2000])

    phone.timers.scheduled.shift()?.fire() // zamanı gelen deneme başarılı olur
    await phone.engine.syncNow()
    expect(await phone.db.outbox.count()).toBe(0)
    expect(phone.engine.status.getState()).toMatchObject({ phase: 'idle', error: null, retryAt: null })

    phone.network.failNext = new AppError('internal')
    await phone.engine.syncNow()
    expect(phone.timers.scheduled.map((item) => item.ms)).toEqual([1000]) // sayaç sıfırlanmıştı
  })

  it('tek uçuş: art arda istekler aynı anda birden çok eşitleme başlatmaz', async () => {
    const { user, device: make } = setup({ delayMs: 15 })
    const phone = make()
    for (let index = 0; index < 5; index++) {
      await createRecord(phone.db, user.personalWorkspaceId, 'tasks', { title: `Görev ${index}` })
      phone.engine.requestSync('push')
    }
    await phone.engine.syncNow()
    expect(phone.network.maxInFlight).toBe(1)
    expect(await phone.db.outbox.count()).toBe(0)
  })

  it('iki sekme aynı veritabanında: kilit sayesinde istekler üst üste binmez', async () => {
    const { server, user } = setup({ delayMs: 10 })
    const tabA = device(server, user.userId, 10)
    const network = tabA.network
    // Gerçekte her sekmenin kendi kimliği vardır; burada ikinci sekmeyi ayrı bir sahiple taklit ediyoruz.
    const tabB = new SyncEngine({ db: tabA.db, send: network.send, lock: { useWebLocks: false, owner: 'sekme-b' } })
    for (let index = 0; index < 3; index++) {
      await createRecord(tabA.db, user.personalWorkspaceId, 'tasks', { title: `Görev ${index}` })
    }
    await Promise.all([tabA.engine.syncNow(), tabB.syncNow(), tabA.engine.syncNow(), tabB.syncNow()])
    expect(network.maxInFlight).toBe(1)
    expect(server.recordsOf(user.personalWorkspaceId)).toHaveLength(3)
    expect(await tabA.db.outbox.count()).toBe(0)
  })

  it('sayfalı yanıtlarda (more) tek çağrıda hepsi alınır', async () => {
    const { server, user, device: make } = setup({ pageSize: 3 })
    const writer = make()
    for (let index = 0; index < 10; index++) {
      await createRecord(writer.db, user.personalWorkspaceId, 'tasks', { title: `Görev ${index}` })
    }
    await writer.engine.syncNow()
    const reader = device(server, user.userId)
    await reader.engine.syncNow()
    expect(await listRecords(reader.db, user.personalWorkspaceId, 'tasks')).toHaveLength(10)
    expect(reader.network.requests.length).toBeGreaterThanOrEqual(4)
  })

  it('istek çok büyükse (413) parti küçültülüp yeniden denenir', async () => {
    const { server, user, device: make } = setup()
    const phone = make()
    for (let index = 0; index < 60; index++) {
      await createRecord(phone.db, user.personalWorkspaceId, 'tasks', { title: `Görev ${index}` })
    }
    phone.network.failNext = new AppError('payload_too_large')
    await phone.engine.syncNow()
    expect(phone.network.requests.map((request) => request.mutations.length)).toEqual([60, 50, 10])
    expect(server.recordsOf(user.personalWorkspaceId)).toHaveLength(60)
  })

  it('durdurulan motor istek göndermez', async () => {
    const { user, device: make } = setup()
    const phone = make()
    phone.engine.stop()
    await createRecord(phone.db, user.personalWorkspaceId, 'tasks', { title: 'Durgun' })
    phone.engine.requestSync('push')
    await phone.engine.syncNow()
    expect(phone.network.requests).toHaveLength(0)
  })
})
