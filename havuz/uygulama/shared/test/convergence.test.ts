/**
 * Yakınsama testi (rastgele ama tohumlu): birkaç cihaz çevrimdışı/çevrimiçi karışık çalışır, yanıtlar ara sıra
 * yolda kaybolur, yetkiler değişir. Sonunda herkes eşitlendiğinde her cihazın gördüğü, sunucudakiyle AYNI olmalıdır.
 * Başarısız olursa iletideki tohumla birebir yeniden üretilir.
 */
import { describe, expect, it } from 'vitest'
import { keyString, uuidv7, type MutationIntent, type SyncRequest } from '../src/index.ts'
import { createRng, MemoryReplica, MemoryServer, type Rng } from '../src/testing/index.ts'

interface Device {
  readonly name: string
  readonly userId: string
  readonly replica: MemoryReplica
}

function randomIntent(rng: Rng, exists: boolean): MutationIntent {
  const roll = rng.next()
  if (!exists || roll < 0.25) {
    const title = `Görev ${rng.int(1000)}`
    return { op: 'put', collection: 'tasks', data: rng.chance(0.1) ? { title: '' } : { title, order: rng.int(50) } }
  }
  if (roll < 0.7) {
    const field = rng.pick(['title', 'done', 'note', 'priority', 'order'] as const)
    const value =
      field === 'title'
        ? `Başlık ${rng.int(1000)}`
        : field === 'done'
          ? rng.chance(0.5)
          : field === 'note'
            ? `not ${rng.int(1000)}`
            : field === 'priority'
              ? rng.pick(['low', 'normal', 'high', 'geçersiz'] as const)
              : rng.int(100)
    return { op: 'patch', collection: 'tasks', data: { [field ?? 'done']: value } }
  }
  return roll < 0.88 ? { op: 'delete', collection: 'tasks' } : { op: 'restore', collection: 'tasks' }
}

async function simulate(seed: number): Promise<void> {
  const rng = createRng(seed)
  const server = new MemoryServer({ pageSize: 7 })
  const ayse = server.createUser('Ayşe')
  const burak = server.createUser('Burak')
  const shared = server.createWorkspace(ayse.userId, 'Ortak')
  server.setMember(shared, burak.userId, 'editor')

  const devices: Device[] = [
    { name: 'ayşe-telefon', userId: ayse.userId, replica: new MemoryReplica() },
    { name: 'ayşe-dizüstü', userId: ayse.userId, replica: new MemoryReplica() },
    { name: 'burak-telefon', userId: burak.userId, replica: new MemoryReplica() },
  ]
  const workspacesOf = (device: Device) =>
    device.userId === ayse.userId ? [ayse.personalWorkspaceId, shared] : [burak.personalWorkspaceId, shared]
  const recordIds = Array.from({ length: 12 }, () => uuidv7())

  // Ağ: bazen yanıt kaybolur (sunucu işler, istemci görmez); istemci sonra aynı isteği yeniden kurar.
  const lossySend = (device: Device) => (request: SyncRequest) => {
    const response = server.sync(device.userId, structuredClone(request))
    if (rng.chance(0.2)) throw new Error('ağ koptu')
    return structuredClone(response)
  }

  for (let step = 0; step < 400; step++) {
    const device = rng.pick(devices)
    if (!device) continue
    const action = rng.next()
    if (action < 0.6) {
      const workspaceId = rng.pick(workspacesOf(device)) ?? shared
      const recordId = rng.pick(recordIds) ?? recordIds[0]!
      const exists = device.replica.get({ workspaceId, collection: 'tasks', id: recordId }) !== undefined
      try {
        device.replica.write(workspaceId, recordId, randomIntent(rng, exists))
      } catch {
        // Geçersiz yerel yazma: beklenen durum (boş başlık, geçersiz öncelik, olmayan kayda patch).
      }
    } else if (action < 0.95) {
      try {
        await device.replica.syncOnce(lossySend(device))
      } catch {
        // Yanıt kayboldu; sonraki turda yeniden denenir.
      }
    } else {
      // Burak'ın ortak alandaki yetkisi ara sıra değişir (izleyici ↔ düzenleyen).
      server.setMember(shared, burak.userId, rng.chance(0.5) ? 'viewer' : 'editor')
    }
  }

  // Durulma: herkes kayıpsız ağla iki tur eşitlenir (ilk turda gönderilenler ikinci turda ötekilere ulaşır).
  for (let round = 0; round < 2; round++) {
    for (const device of devices) {
      await device.replica.syncUntilSettled((request) => server.sync(device.userId, structuredClone(request)))
    }
  }

  for (const device of devices) {
    expect(device.replica.pendingCount(), `${device.name}: bekleyen kalmamalı (tohum ${seed})`).toBe(0)
    for (const workspaceId of workspacesOf(device)) {
      const onServer = server.recordsOf(workspaceId).map((record) => ({
        id: record.id,
        data: record.data,
        deleted: record.deleted,
      }))
      const onDevice = device.replica.list(workspaceId, 'tasks', { includeDeleted: true })
      const sortById = <T extends { id: string }>(items: T[]) => items.toSorted((a, b) => (a.id < b.id ? -1 : 1))
      expect(sortById(onDevice), `${device.name} / ${workspaceId} sunucuyla aynı olmalı (tohum ${seed})`).toEqual(
        sortById(onServer),
      )
      for (const record of server.recordsOf(workspaceId)) {
        const local = device.replica.get({ workspaceId, collection: record.collection, id: record.id })
        expect(
          local?.server?.rev,
          `${device.name}: ${keyString({ workspaceId, collection: record.collection, id: record.id })} rev (tohum ${seed})`,
        ).toBe(record.rev)
      }
    }
  }
}

describe('yakınsama (rastgele senaryolar)', () => {
  it.each(Array.from({ length: 40 }, (_, index) => index + 1))('tohum %i', async (seed) => {
    await simulate(seed)
  })
})
