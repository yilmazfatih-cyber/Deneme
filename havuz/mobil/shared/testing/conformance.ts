// KOPYA — elle değiştirmeyin. Kaynak: havuz/uygulama/shared/src/testing/conformance.ts · Kopyalanma: 2026-11-23 · Yenile: npm run shared:sync
/**
 * Eşitleme UYGUNLUK TESTLERİ: protokolün sözle değil testle yazılmış tanımı.
 * Aynı senaryolar iki sunucuya karşı koşar:
 *   - bellek içi başvuru sunucusu  → shared/test/conformance.test.ts
 *   - gerçek API (HTTP üzerinden)  → api/test/sync.conformance.test.ts
 * İkisi de geçiyorsa gerçek API protokole uyuyor demektir.
 *
 * Kullanım (bir vitest dosyasından):
 *   defineSyncConformance('bellek içi', async () => myBackend)
 *
 * Genişletme: protokole yeni bir kural eklerken buraya bir `it(...)` ekleyin; iki sunucu da onu geçmeli.
 */
import { describe, expect, it } from 'vitest'
import type { WorkspaceRole } from '../api.ts'
import { isAppError } from '../errors.ts'
import { uuidv7 } from '../ids.ts'
import {
  PROTOCOL_VERSION,
  SYNC_LIMITS,
  type Mutation,
  type ServerRecord,
  type SyncRequest,
  type SyncResponse,
} from '../sync.ts'
import { MemoryReplica } from './memoryReplica.ts'

export interface ConformanceUser {
  readonly userId: string
  readonly personalWorkspaceId: string
  /** `POST /api/sync`. Hata durumunda `AppError` fırlatmalıdır (HTTP bağdaştırıcısı hata gövdesini AppError'a çevirir). */
  readonly sync: (request: SyncRequest) => Promise<SyncResponse>
}

export interface ConformanceBackend {
  createUser(name: string): Promise<ConformanceUser>
  /** Paylaşılan alan açar; `owner` sahibi olur. Alanın kimliğini döndürür. */
  createWorkspace(owner: ConformanceUser, name: string): Promise<string>
  /** Üye ekler, rolünü değiştirir ya da (`role: null`) çıkarır. */
  setMember(workspaceId: string, user: ConformanceUser, role: WorkspaceRole | null): Promise<void>
  /** Sunucunun alan başına sayfa boyutu (sayfalama senaryosu buna göre kayıt üretir). */
  readonly pageSize: number
  close?(): Promise<void>
}

const AT = '2026-01-01T00:00:00.000Z'

function request(clientId: string, cursors: Record<string, number>, mutations: Mutation[]): SyncRequest {
  return { protocolVersion: PROTOCOL_VERSION, clientId, cursors, mutations }
}

function putTask(mid: number, workspaceId: string, recordId: string, data: Record<string, unknown>): Mutation {
  return { mid, workspaceId, collection: 'tasks', recordId, at: AT, op: 'put', data }
}

function patchTask(mid: number, workspaceId: string, recordId: string, data: Record<string, unknown>): Mutation {
  return { mid, workspaceId, collection: 'tasks', recordId, at: AT, op: 'patch', data }
}

function find(records: ServerRecord[] | undefined, id: string): ServerRecord | undefined {
  return records?.find((record) => record.id === id)
}

export function defineSyncConformance(name: string, makeBackend: () => Promise<ConformanceBackend>): void {
  describe(`eşitleme uygunluğu: ${name}`, () => {
    async function setup() {
      const backend = await makeBackend()
      const ayse = await backend.createUser('Ayşe')
      return { backend, ayse, ws: ayse.personalWorkspaceId }
    }

    it('ilk eşitleme: kişisel alan listelenir, kayıt yoktur', async () => {
      const { backend, ayse, ws } = await setup()
      const response = await ayse.sync(request(uuidv7(), {}, []))
      expect(response.lastMutationId).toBe(0)
      expect(response.workspaces).toHaveLength(1)
      expect(response.workspaces[0]).toMatchObject({ id: ws, kind: 'personal', role: 'owner', rev: 0, memberCount: 1 })
      expect(response.changes[ws]).toEqual({ records: [], cursor: 0, more: false, reset: false })
      await backend.close?.()
    })

    it('put: kayıt oluşur, varsayılanlar dolar, başka cihaz onu alır', async () => {
      const { backend, ayse, ws } = await setup()
      const id = uuidv7()
      const first = await ayse.sync(request(uuidv7(), {}, [putTask(1, ws, id, { title: '  Süt al  ' })]))
      expect(first.lastMutationId).toBe(1)
      expect(first.rejected).toEqual([])
      const touched = find(first.touched, id)
      expect(touched).toMatchObject({
        workspaceId: ws,
        collection: 'tasks',
        deleted: false,
        rev: 1,
        updatedBy: ayse.userId,
      })
      expect(touched?.data).toEqual({
        listId: null,
        title: 'Süt al',
        note: '',
        done: false,
        dueDate: null,
        priority: 'normal',
        order: 0,
      })
      const other = await ayse.sync(request(uuidv7(), {}, []))
      expect(find(other.changes[ws]?.records, id)?.data).toEqual(touched?.data)
      expect(other.changes[ws]?.cursor).toBe(1)
      await backend.close?.()
    })

    it('patch: yalnız verilen alanlar değişir; farklı alanlara eşzamanlı yazmalar birleşir', async () => {
      const { backend, ayse, ws } = await setup()
      const id = uuidv7()
      const phone = uuidv7()
      const laptop = uuidv7()
      await ayse.sync(request(phone, {}, [putTask(1, ws, id, { title: 'Rapor', note: 'ilk' })]))
      await ayse.sync(request(phone, {}, [patchTask(2, ws, id, { done: true })]))
      const last = await ayse.sync(request(laptop, {}, [patchTask(1, ws, id, { note: 'son' })]))
      expect(find(last.touched, id)?.data).toMatchObject({ title: 'Rapor', note: 'son', done: true })
      expect(find(last.touched, id)?.rev).toBe(3)
      await backend.close?.()
    })

    it('aynı alana eşzamanlı yazmada sunucuya son varan kazanır', async () => {
      const { backend, ayse, ws } = await setup()
      const id = uuidv7()
      await ayse.sync(request(uuidv7(), {}, [putTask(1, ws, id, { title: 'A' })]))
      await ayse.sync(request(uuidv7(), {}, [patchTask(1, ws, id, { title: 'B' })]))
      const last = await ayse.sync(request(uuidv7(), {}, [patchTask(1, ws, id, { title: 'C' })]))
      expect(find(last.touched, id)?.data).toMatchObject({ title: 'C' })
      await backend.close?.()
    })

    it('delete / restore: mezar taşı kalır; silinmiş kayda patch etkisizdir; put geri getirir', async () => {
      const { backend, ayse, ws } = await setup()
      const id = uuidv7()
      const client = uuidv7()
      await ayse.sync(request(client, {}, [putTask(1, ws, id, { title: 'Geçici' })]))
      const deleted = await ayse.sync(
        request(client, {}, [{ mid: 2, workspaceId: ws, collection: 'tasks', recordId: id, at: AT, op: 'delete' }]),
      )
      expect(find(deleted.touched, id)).toMatchObject({ deleted: true, rev: 2 })
      const ignored = await ayse.sync(request(client, {}, [patchTask(3, ws, id, { title: 'Yok sayılır' })]))
      expect(ignored.rejected).toEqual([])
      expect(find(ignored.touched, id)).toMatchObject({ deleted: true, rev: 2 })
      const restored = await ayse.sync(
        request(client, {}, [{ mid: 4, workspaceId: ws, collection: 'tasks', recordId: id, at: AT, op: 'restore' }]),
      )
      expect(find(restored.touched, id)).toMatchObject({ deleted: false, rev: 3 })
      expect(find(restored.touched, id)?.data).toMatchObject({ title: 'Geçici' })
      await ayse.sync(
        request(client, {}, [{ mid: 5, workspaceId: ws, collection: 'tasks', recordId: id, at: AT, op: 'delete' }]),
      )
      const recreated = await ayse.sync(request(client, {}, [putTask(6, ws, id, { title: 'Yeniden' })]))
      expect(find(recreated.touched, id)).toMatchObject({ deleted: false, rev: 5 })
      await backend.close?.()
    })

    it('değişiklik yaratmayan işlem rev artırmaz', async () => {
      const { backend, ayse, ws } = await setup()
      const id = uuidv7()
      const client = uuidv7()
      await ayse.sync(request(client, {}, [putTask(1, ws, id, { title: 'Aynı' })]))
      const again = await ayse.sync(request(client, {}, [patchTask(2, ws, id, { title: 'Aynı' })]))
      expect(again.lastMutationId).toBe(2)
      expect(find(again.touched, id)?.rev).toBe(1)
      expect(again.workspaces[0]?.rev).toBe(1)
      await backend.close?.()
    })

    it('yinelenen gönderim ikinci kez uygulanmaz ama dokunulan kayıt yine döner', async () => {
      const { backend, ayse, ws } = await setup()
      const id = uuidv7()
      const client = uuidv7()
      const mutations = [putTask(1, ws, id, { title: 'Bir kez' }), patchTask(2, ws, id, { note: 'not' })]
      const first = await ayse.sync(request(client, {}, mutations))
      const second = await ayse.sync(request(client, {}, mutations))
      expect(second.lastMutationId).toBe(2)
      expect(second.rejected).toEqual([])
      expect(find(second.touched, id)).toEqual(find(first.touched, id))
      expect(second.workspaces[0]?.rev).toBe(2)
      await backend.close?.()
    })

    it('geçersiz veri reddedilir, sıra numarası yine ilerler, sonraki değişiklikler uygulanır', async () => {
      const { backend, ayse, ws } = await setup()
      const bad = uuidv7()
      const good = uuidv7()
      const response = await ayse.sync(
        request(uuidv7(), {}, [
          putTask(1, ws, bad, { title: '' }),
          putTask(2, ws, good, { title: 'Geçerli' }),
          patchTask(3, ws, good, { priority: 'acil' }),
          patchTask(4, ws, uuidv7(), { title: 'Olmayan kayıt' }),
        ]),
      )
      expect(response.lastMutationId).toBe(4)
      expect(response.rejected.map((item) => [item.mid, item.code])).toEqual([
        [1, 'validation'],
        [3, 'validation'],
        [4, 'not_found'],
      ])
      expect(find(response.touched, bad)).toBeUndefined()
      expect(find(response.touched, good)?.data).toMatchObject({ title: 'Geçerli', priority: 'normal' })
      await backend.close?.()
    })

    it('tanınmayan koleksiyon reddedilir; şemada olmayan alanlar sessizce atılır', async () => {
      const { backend, ayse, ws } = await setup()
      const id = uuidv7()
      const response = await ayse.sync(
        request(uuidv7(), {}, [
          { mid: 1, workspaceId: ws, collection: 'bilinmeyen', recordId: uuidv7(), at: AT, op: 'put', data: {} },
          putTask(2, ws, id, { title: 'Fazla alanlı', ek: 'y'.repeat(SYNC_LIMITS.maxRecordBytes) }),
        ]),
      )
      expect(response.rejected).toEqual([expect.objectContaining({ mid: 1, code: 'unknown_collection' })])
      expect(find(response.touched, id)?.data).not.toHaveProperty('ek')
      await backend.close?.()
    })

    it('yetki: üye olunmayan alana ve izleyici rolüyle yazma reddedilir; okuma sürer', async () => {
      const { backend, ayse } = await setup()
      const burak = await backend.createUser('Burak')
      const shared = await backend.createWorkspace(ayse, 'Ev')
      const id = uuidv7()
      await ayse.sync(request(uuidv7(), {}, [putTask(1, shared, id, { title: 'Ortak' })]))

      const outsider = await burak.sync(request(uuidv7(), {}, [patchTask(1, shared, id, { title: 'İzinsiz' })]))
      expect(outsider.rejected).toEqual([expect.objectContaining({ mid: 1, code: 'forbidden' })])
      expect(outsider.touched).toEqual([])
      expect(outsider.changes[shared]).toBeUndefined()
      expect(outsider.workspaces.map((workspace) => workspace.id)).toEqual([burak.personalWorkspaceId])

      await backend.setMember(shared, burak, 'viewer')
      const viewerClient = uuidv7()
      const viewer = await burak.sync(request(viewerClient, {}, [patchTask(1, shared, id, { title: 'İzleyici' })]))
      expect(viewer.rejected).toEqual([expect.objectContaining({ mid: 1, code: 'forbidden' })])
      expect(find(viewer.changes[shared]?.records, id)?.data).toMatchObject({ title: 'Ortak' })
      expect(viewer.workspaces.find((workspace) => workspace.id === shared)).toMatchObject({
        role: 'viewer',
        memberCount: 2,
      })

      await backend.setMember(shared, burak, 'editor')
      const editor = await burak.sync(request(viewerClient, {}, [patchTask(2, shared, id, { title: 'Düzenleyen' })]))
      expect(editor.rejected).toEqual([])
      expect(find(editor.touched, id)).toMatchObject({ rev: 2, updatedBy: burak.userId })
      await backend.close?.()
    })

    it('üyelikten çıkarılan kullanıcı alanı artık görmez', async () => {
      const { backend, ayse } = await setup()
      const burak = await backend.createUser('Burak')
      const shared = await backend.createWorkspace(ayse, 'Tatil')
      await backend.setMember(shared, burak, 'editor')
      const before = await burak.sync(request(uuidv7(), {}, []))
      expect(before.workspaces.some((workspace) => workspace.id === shared)).toBe(true)
      await backend.setMember(shared, burak, null)
      const after = await burak.sync(request(uuidv7(), { [shared]: 0 }, []))
      expect(after.workspaces.some((workspace) => workspace.id === shared)).toBe(false)
      expect(after.changes[shared]).toBeUndefined()
      await backend.close?.()
    })

    it('sayfalama: kayıtlar rev sırasıyla, yinelenmeden ve atlanmadan gelir', async () => {
      const { backend, ayse, ws } = await setup()
      const total = backend.pageSize * 2 + 3
      const writer = uuidv7()
      const ids: string[] = []
      let mid = 0
      while (ids.length < total) {
        const batch: Mutation[] = []
        while (batch.length < SYNC_LIMITS.maxMutationsPerRequest && ids.length < total) {
          const id = uuidv7()
          ids.push(id)
          mid += 1
          batch.push(putTask(mid, ws, id, { title: `Görev ${ids.length}` }))
        }
        await ayse.sync(request(writer, {}, batch))
      }
      const reader = uuidv7()
      const seen: string[] = []
      let cursor = 0
      let rounds = 0
      for (;;) {
        rounds += 1
        const page = await ayse.sync(request(reader, { [ws]: cursor }, []))
        const changes = page.changes[ws]
        expect(changes).toBeDefined()
        if (!changes) break
        expect(changes.records.length).toBeLessThanOrEqual(backend.pageSize)
        const revs = changes.records.map((record) => record.rev)
        expect(revs).toEqual(revs.toSorted((a, b) => a - b))
        expect(revs.every((rev) => rev > cursor)).toBe(true)
        seen.push(...changes.records.map((record) => record.id))
        cursor = changes.cursor
        if (!changes.more) break
        expect(rounds).toBeLessThan(10)
      }
      expect(rounds).toBe(3)
      expect(seen).toEqual(ids)
      expect(cursor).toBe(total)
      await backend.close?.()
    })

    it('imleç sunucunun ilerisindeyse reset bildirilir, kayıt dönmez', async () => {
      const { backend, ayse, ws } = await setup()
      await ayse.sync(request(uuidv7(), {}, [putTask(1, ws, uuidv7(), { title: 'Tek' })]))
      const response = await ayse.sync(request(uuidv7(), { [ws]: 99 }, []))
      expect(response.changes[ws]).toEqual({ records: [], cursor: 99, more: false, reset: true })
      await backend.close?.()
    })

    it('protokol sürümü uyuşmazsa upgrade_required döner', async () => {
      const { backend, ayse } = await setup()
      const bad = { ...request(uuidv7(), {}, []), protocolVersion: PROTOCOL_VERSION + 1 }
      const error = await ayse.sync(bad).then(
        () => null,
        (reason: unknown) => reason,
      )
      expect(isAppError(error) && error.code).toBe('upgrade_required')
      await backend.close?.()
    })

    it('bozuk istek validation döner; sırasız mid kabul edilmez', async () => {
      const { backend, ayse, ws } = await setup()
      const unordered = request(uuidv7(), {}, [
        putTask(2, ws, uuidv7(), { title: 'İki' }),
        putTask(1, ws, uuidv7(), { title: 'Bir' }),
      ])
      for (const bad of [unordered, { ...request(uuidv7(), {}, []), clientId: 'geçersiz kimlik!' }]) {
        const error = await ayse.sync(bad).then(
          () => null,
          (reason: unknown) => reason,
        )
        expect(isAppError(error) && error.code).toBe('validation')
      }
      await backend.close?.()
    })

    it('başka kullanıcının cihaz kimliği kullanılamaz', async () => {
      const { backend, ayse } = await setup()
      const burak = await backend.createUser('Burak')
      const client = uuidv7()
      await ayse.sync(request(client, {}, []))
      const error = await burak.sync(request(client, {}, [])).then(
        () => null,
        (reason: unknown) => reason,
      )
      expect(isAppError(error) && error.code).toBe('forbidden')
      await backend.close?.()
    })

    it('iki cihaz çevrimdışı çalışıp eşitlenince aynı sonuca varır', async () => {
      const { backend, ayse, ws } = await setup()
      const phone = new MemoryReplica()
      const laptop = new MemoryReplica()
      const send = (req: SyncRequest) => ayse.sync(req)
      const shopping = uuidv7()
      phone.write(ws, shopping, { op: 'put', collection: 'tasks', data: { title: 'Alışveriş' } })
      await phone.syncUntilSettled(send)
      await laptop.syncUntilSettled(send)

      // İkisi de çevrimdışı: telefon işaretler ve yeni görev ekler, dizüstü notu değiştirir ve bir görev ekler.
      const phoneNew = uuidv7()
      const laptopNew = uuidv7()
      phone.write(ws, shopping, { op: 'patch', collection: 'tasks', data: { done: true } })
      phone.write(ws, phoneNew, { op: 'put', collection: 'tasks', data: { title: 'Telefonda eklendi' } })
      laptop.write(ws, shopping, { op: 'patch', collection: 'tasks', data: { note: 'ekmek, süt' } })
      laptop.write(ws, laptopNew, { op: 'put', collection: 'tasks', data: { title: 'Dizüstünde eklendi' } })

      await laptop.syncUntilSettled(send)
      await phone.syncUntilSettled(send)
      await laptop.syncUntilSettled(send)

      expect(phone.list(ws, 'tasks')).toEqual(laptop.list(ws, 'tasks'))
      expect(phone.list(ws, 'tasks')).toHaveLength(3)
      expect(phone.get({ workspaceId: ws, collection: 'tasks', id: shopping })?.view.data).toMatchObject({
        done: true,
        note: 'ekmek, süt',
      })
      expect(phone.pendingCount() + laptop.pendingCount()).toBe(0)
      await backend.close?.()
    })
  })
}
