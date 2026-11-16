import { API_PATHS, pokeEventSchema, PROTOCOL_VERSION } from '@uygulama/shared'
import { afterEach, describe, expect, it } from 'vitest'
import { signUp, TestClient, type SignedUpUser } from '../support/client.ts'
import { createTestServer, type TestServer } from '../support/harness.ts'
import { eventually, openEvents, type SseEvent } from '../support/sse.ts'
import { addMember, createShared } from '../support/workspaces.ts'

let t: TestServer
afterEach(async () => {
  await t.close()
})

const pokes = (events: SseEvent[]) =>
  events.filter((event) => event.event === 'poke').map((event) => pokeEventSchema.parse(JSON.parse(event.data)))

async function putTask(user: SignedUpUser, workspaceId: string, clientId: string, recordId: string) {
  const reply = await user.client.post(API_PATHS.sync, {
    protocolVersion: PROTOCOL_VERSION,
    clientId,
    cursors: {},
    mutations: [
      {
        mid: 1,
        workspaceId,
        collection: 'tasks',
        recordId,
        at: '2026-11-16T10:00:00.000Z',
        op: 'put',
        data: { title: 'Görev' },
      },
    ],
  })
  expect(reply.status).toBe(200)
}

describe('anlık bildirim akışı (SSE)', () => {
  it('oturumsuz bağlantı 401 JSON alır', async () => {
    t = createTestServer()
    const stream = await openEvents(new TestClient(t))
    expect(stream.status).toBe(401)
    expect(stream.headers.get('content-type')).toContain('application/json')
  })

  it('bağlanınca ready gelir; aynı kullanıcının başka cihazı eşitleyince poke gelir (clientId ile)', async () => {
    t = createTestServer()
    const ayse = await signUp(t)
    const stream = await openEvents(ayse.client)
    expect(stream.status).toBe(200)
    expect(stream.headers.get('content-type')).toContain('text/event-stream')
    expect(stream.headers.get('x-accel-buffering')).toBe('no')
    await stream.waitFor((events) => events.some((event) => event.event === 'ready'))
    expect(stream.text()).toContain('retry: 5000')
    await putTask(ayse, ayse.personalWorkspaceId, 'telefon', 'r1')
    const events = await stream.waitFor((all) => pokes(all).length > 0)
    expect(pokes(events)).toEqual([{ workspaceId: ayse.personalWorkspaceId, rev: 1, clientId: 'telefon' }])
    await stream.close()
  })

  it('ortak alandaki değişiklik bütün üyelere gider; üye olmayana gitmez', async () => {
    t = createTestServer()
    const ayse = await signUp(t)
    const burak = await signUp(t)
    const deniz = await signUp(t)
    const ws = await createShared(ayse)
    await addMember(ayse, burak, ws, 'viewer')
    const burakStream = await openEvents(burak.client)
    const denizStream = await openEvents(deniz.client)
    await burakStream.waitFor((events) => events.some((event) => event.event === 'ready'))
    await denizStream.waitFor((events) => events.some((event) => event.event === 'ready'))
    await putTask(ayse, ws, 'ayse-tel', 'ortak-1')
    await burakStream.waitFor((events) => pokes(events).some((poke) => poke.workspaceId === ws && poke.rev === 1))
    // Deniz kendi alanına yazınca ilk ve tek dürtmesi kendi alanınındır: ortak alanın dürtmesi ona hiç gelmemiştir.
    await putTask(deniz, deniz.personalWorkspaceId, 'deniz-tel', 'd-1')
    const denizEvents = await denizStream.waitFor((events) => pokes(events).length > 0)
    expect(pokes(denizEvents).map((poke) => poke.workspaceId)).toEqual([deniz.personalWorkspaceId])
    await burakStream.close()
    await denizStream.close()
  })

  it('üyelikten çıkarılan kullanıcıya da dürtme gider (istemcisi alanı bıraksın)', async () => {
    t = createTestServer()
    const ayse = await signUp(t)
    const burak = await signUp(t)
    const ws = await createShared(ayse)
    await addMember(ayse, burak, ws)
    const stream = await openEvents(burak.client)
    await stream.waitFor((events) => events.some((event) => event.event === 'ready'))
    await ayse.client.delete(API_PATHS.member(ws, burak.user.id))
    const events = await stream.waitFor((all) => pokes(all).some((poke) => poke.workspaceId === ws))
    expect(pokes(events).at(-1)).toMatchObject({ workspaceId: ws, clientId: null })
    await stream.close()
  })

  it('nabız yorum satırı düzenli gelir', async () => {
    t = createTestServer({ config: { sseHeartbeatMs: 20 } })
    const ayse = await signUp(t)
    const stream = await openEvents(ayse.client)
    await stream.waitFor((_events, text) => text.split(': nabız').length > 2)
    await stream.close()
  })

  it('istemci bağlantıyı kesince sunucu kaydı temizler', async () => {
    t = createTestServer()
    const ayse = await signUp(t)
    const stream = await openEvents(ayse.client)
    await stream.waitFor((events) => events.some((event) => event.event === 'ready'))
    expect(t.ctx.hub.size).toBe(1)
    await stream.close()
    await eventually(() => t.ctx.hub.size === 0)
  })

  it('çıkış yapılınca o oturumun akışı sunucuca kapatılır', async () => {
    t = createTestServer()
    const ayse = await signUp(t)
    const stream = await openEvents(ayse.client)
    await stream.waitFor((events) => events.some((event) => event.event === 'ready'))
    await ayse.client.post(API_PATHS.logout)
    expect(await stream.ended()).toBe(true)
    await eventually(() => t.ctx.hub.size === 0)
  })

  it('kullanıcı başına bağlantı sınırı aşılınca en eski bağlantı kapanır', async () => {
    t = createTestServer({ config: { maxSseConnectionsPerUser: 2 } })
    const ayse = await signUp(t)
    const first = await openEvents(ayse.client)
    const second = await openEvents(ayse.client)
    await first.waitFor((events) => events.some((event) => event.event === 'ready'))
    await second.waitFor((events) => events.some((event) => event.event === 'ready'))
    const third = await openEvents(ayse.client)
    await third.waitFor((events) => events.some((event) => event.event === 'ready'))
    expect(await first.ended()).toBe(true)
    expect(t.ctx.hub.countFor(ayse.user.id)).toBe(2)
    await second.close()
    await third.close()
  })

  it('okumayan istemcinin bekleyen olay kuyruğu sınırlıdır: sınır aşılınca bağlantı kesilir (bellek şişmez)', async () => {
    t = createTestServer()
    const ayse = await signUp(t)
    // Akışı açıp HİÇ okumuyoruz: TCP penceresini kapalı tutan bir saldırgan ya da donmuş bir istemci gibi.
    const response = await t.server.app.request(API_PATHS.events, { headers: { Cookie: ayse.client.cookie ?? '' } })
    expect(response.status).toBe(200)
    await eventually(() => t.ctx.hub.countFor(ayse.user.id) === 1)
    const poke = { workspaceId: ayse.personalWorkspaceId, rev: 1, clientId: null }
    for (let index = 0; index < 2000; index++) t.ctx.hub.poke([ayse.user.id], poke)
    await eventually(() => t.ctx.hub.countFor(ayse.user.id) === 0)
    await response.body?.cancel()
  })

  it('okuyan istemci aynı anda gelen çok sayıda dürtmede (100 alanlık eşitleme gibi) kesilmez', async () => {
    t = createTestServer()
    const ayse = await signUp(t)
    const stream = await openEvents(ayse.client)
    await stream.waitFor((events) => events.some((event) => event.event === 'ready'))
    for (let index = 0; index < 150; index++) {
      t.ctx.hub.poke([ayse.user.id], { workspaceId: ayse.personalWorkspaceId, rev: index + 1, clientId: null })
    }
    await stream.waitFor((events) => pokes(events).length === 150)
    expect(t.ctx.hub.countFor(ayse.user.id)).toBe(1)
    await stream.close()
  })

  it('HEAD isteği akış açmaz (gövdesi atılan akış sızıntı olurdu)', async () => {
    t = createTestServer()
    const ayse = await signUp(t)
    const response = await t.server.app.request(API_PATHS.events, {
      method: 'HEAD',
      headers: { Cookie: ayse.client.cookie ?? '' },
    })
    expect(response.status).toBe(200)
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(t.ctx.hub.size).toBe(0)
  })

  it('sunucu kapanırken bütün akışlar biter', async () => {
    t = createTestServer()
    const ayse = await signUp(t)
    const stream = await openEvents(ayse.client)
    await stream.waitFor((events) => events.some((event) => event.event === 'ready'))
    t.ctx.hub.closeAll()
    expect(await stream.ended()).toBe(true)
  })
})
