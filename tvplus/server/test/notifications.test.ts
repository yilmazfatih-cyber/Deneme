import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import type { Response as InjectResponse } from 'light-my-request'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { BootContext, PushResponse } from '../../shared/types'
import { loadSeeds } from '../src/services/notifications/plugin'
import { createTestApp } from './helpers'

let app: FastifyInstance
let deniz: { cookies: Record<string, string>; guid: string }
let cocuk: { cookies: Record<string, string>; guid: string }

const take = (res: InjectResponse, into: Record<string, string>) => {
  for (const c of res.cookies) if (c.value) into[c.name] = c.value
}
async function asProfile(index: number) {
  const cookies: Record<string, string> = {}
  const login = await app.inject({ method: 'POST', url: '/api/login' })
  take(login, cookies)
  const guid = login.json<BootContext>().profiles[index]!.guid
  take(await app.inject({ method: 'POST', url: '/api/profiles/switch', cookies, payload: { guid } }), cookies)
  return { cookies, guid }
}

beforeAll(async () => {
  app = await createTestApp()
  deniz = await asProfile(0)
  cocuk = await asProfile(1)
})
afterAll(async () => {
  await app.close()
})

const poll = (who: { cookies: Record<string, string> }, cursor: number, wait = 0) =>
  app.inject({ url: `/push?cursor=${cursor}&wait=${wait}`, cookies: who.cookies })

describe('bildirim tohumları', () => {
  it('content/notifications.json → PushEvent şablonları (dosya yoksa boş)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tvplus-test-notif-'))
    expect(loadSeeds(dir, () => {})).toEqual([])
    writeFileSync(
      join(dir, 'notifications.json'),
      JSON.stringify([
        { id: 'a', title: 'Yeni film', body: 'Sintel eklendi', videoId: 80010001 },
        { id: 'b', title: 'Kanal', body: 'Yeni kanal', channelId: 3 },
        { id: 'c', title: 'Genel', body: 'Merhaba' },
      ]),
    )
    const seeds = loadSeeds(dir, () => {})
    expect(seeds.map((s) => s.href)).toEqual(['#/detay/80010001', '#/izle/Channel:3', null])
    expect(seeds[0]).toMatchObject({ id: 'seed-a', kind: 'NEW_CONTENT', title: 'Yeni film' })
    writeFileSync(join(dir, 'notifications.json'), '{"bozuk": true}')
    let warned = false
    expect(loadSeeds(dir, () => (warned = true))).toEqual([])
    expect(warned).toBe(true)
  })
})

describe('GET /push', () => {
  it('anonim → 200 boş', async () => {
    const res = await app.inject({ url: '/push?cursor=5&wait=1' })
    expect(res.statusCode).toBe(200)
    expect(res.json<PushResponse>()).toEqual({ events: [], cursor: 5 })
  })

  it('imleç anlamı: yalnız imleçten sonrakiler, profil başına kuyruk', async () => {
    const start = (await poll(deniz, 0)).json<PushResponse>()
    const base = start.cursor
    app.services.notifications.push(deniz.guid, { kind: 'REMINDER', title: 'Hatırlatma', body: 'Dizin seni bekliyor', href: '#/detay/1' })
    app.services.notifications.push(deniz.guid, { kind: 'NEW_CONTENT', title: 'Yeni', body: 'Yeni bölüm', href: null })
    const res = (await poll(deniz, base)).json<PushResponse>()
    expect(res.events.map((e) => e.title)).toEqual(['Hatırlatma', 'Yeni'])
    expect(res.events[0]!.cursor).toBeLessThan(res.events[1]!.cursor)
    expect(res.cursor).toBe(res.events[1]!.cursor)
    expect(res.events[0]).toMatchObject({ kind: 'REMINDER', href: '#/detay/1', read: false })
    expect(res.events[0]!.createdAt).toMatch(/^\d{4}-\d\d-\d\dT/)
    const after = (await poll(deniz, res.cursor)).json<PushResponse>()
    expect(after).toEqual({ events: [], cursor: res.cursor })
    // Diğer profil görmez
    const other = (await poll(cocuk, base)).json<PushResponse>()
    expect(other.events.some((e) => e.title === 'Hatırlatma')).toBe(false)
  })

  it('herkese gönderim tüm profillere gider; markRead/list çalışır', async () => {
    const c0 = (await poll(cocuk, 0)).json<PushResponse>().cursor
    app.services.notifications.push(null, { kind: 'SYSTEM', title: 'Bakım', body: 'Gece bakım var', href: null })
    const got = (await poll(cocuk, c0)).json<PushResponse>()
    expect(got.events.map((e) => e.title)).toEqual(['Bakım'])
    const list = app.services.notifications.list(deniz.guid)
    expect(list[0]!.title).toBe('Bakım') // en yeni başta
    app.services.notifications.markRead(deniz.guid, [list[0]!.id])
    expect(app.services.notifications.list(deniz.guid)[0]!.read).toBe(true)
    expect(app.services.notifications.list(deniz.guid).some((e) => !e.read)).toBe(true)
    app.services.notifications.markRead(deniz.guid, null)
    expect(app.services.notifications.list(deniz.guid).every((e) => e.read)).toBe(true)
  })

  it('uzun yoklama: yeni bildirim gelince hemen döner', async () => {
    const cursor = (await poll(deniz, 0)).json<PushResponse>().cursor
    const started = Date.now()
    const pending = poll(deniz, cursor, 25) // testte en çok 1 sn
    setTimeout(() => {
      app.services.notifications.push(deniz.guid, { kind: 'NEW_CONTENT', title: 'Anında', body: 'Geldi', href: null })
    }, 100)
    const res = (await pending).json<PushResponse>()
    expect(res.events.map((e) => e.title)).toEqual(['Anında'])
    expect(Date.now() - started).toBeLessThan(900)
  })

  it('uzun yoklama: süre dolunca boş döner (testte en çok 1 sn)', async () => {
    const cursor = (await poll(cocuk, 0)).json<PushResponse>().cursor
    const started = Date.now()
    const res = await poll(cocuk, cursor, 25)
    const elapsed = Date.now() - started
    expect(res.json<PushResponse>()).toEqual({ events: [], cursor })
    expect(elapsed).toBeGreaterThanOrEqual(900)
    expect(elapsed).toBeLessThan(3000)
  })

  it('istemci sunucudan ilerideyse baştan verilir', async () => {
    const res = (await poll(deniz, 10_000_000)).json<PushResponse>()
    expect(res.events.length).toBeGreaterThan(0)
  })
})
