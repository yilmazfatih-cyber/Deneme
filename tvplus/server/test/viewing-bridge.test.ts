/**
 * Uygulama olayları köprüsü: oturum açmış profilin POST /log/web/cl/1 olayları TVPLUS kaynağına çevrilir
 * (oynatma başlangıcı / kalp atışı / sonu, liste, beğeni, arama, gösterim, tıklama). Anonim paket ve canlı kanal
 * oynatması çevrilmez; aynı paketin yeniden gönderimi yinelenen sayılır; abonelik hatası olay ucunu bozmaz.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import type { BootContext, ClientEvent } from '../../shared/types'
import { createTestApp } from './helpers'

const apps: FastifyInstance[] = []
afterEach(async () => {
  while (apps.length) await apps.pop()!.close()
})

async function loggedIn() {
  const app = await createTestApp()
  apps.push(app)
  const cookies: Record<string, string> = {}
  const take = (res: { cookies: { name: string; value: string }[] }) => {
    for (const c of res.cookies) cookies[c.name] = c.value
  }
  const login = await app.inject({ method: 'POST', url: '/api/login' })
  take(login)
  const guid = login.json<BootContext>().profiles[0]!.guid
  take(await app.inject({ method: 'POST', url: '/api/profiles/switch', cookies, payload: { guid } }))
  return { app, cookies, guid }
}

const NOW = Date.now()
let seq = 0
const e = (name: ClientEvent['name'], data: Record<string, unknown>, dt = 0): ClientEvent => ({
  name,
  ts: NOW + dt,
  seq: ++seq,
  data,
})

describe('uygulama olayları → izleme verisi', () => {
  it('oynatma, liste, beğeni, arama, gösterim ve tıklama TVPLUS özetine dönüşür', async () => {
    const { app, cookies, guid } = await loggedIn()
    const show = app.services.catalog.allTitles().find((t) => t.type === 'SHOW')!
    const ep = show.seasons[0]!.episodes[0]!
    const base = { viewableId: 'Video:80010001', playbackContextId: 'pc-1' }
    const batch = {
      sessionId: 'oturum-1',
      sentAt: NOW + 60_000,
      events: [
        e('impression', { listId: 'l1', entityIds: ['Video:80020003', 'Channel:5', 'Video:80010001'] }),
        e('click', { videoId: 80010001, action: 'play', from: 'lolomo' }),
        e('playback.start', { ...base, videoId: 80010001, positionSec: 0, startupMs: 500 }, 1000),
        e('playback.heartbeat', { ...base, positionSec: 10 }, 11_000),
        e('playback.heartbeat', { ...base, positionSec: 20 }, 21_000),
        e('playback.end', { ...base, positionSec: 880, durationSec: 888, reason: 'ended' }, 30_000),
        e('playlist', { videoId: ep.videoId, action: 'ADD_TO_PLAYLIST' }, 31_000),
        e('rating', { videoId: 80010001, rating: 'THUMBS_WAY_UP' }, 32_000),
        e('search', { termLength: 5, counts: {} }, 33_000),
        // Canlı kanal oynatması çevrilmez
        e(
          'playback.start',
          { viewableId: 'Channel:5', playbackContextId: 'pc-2', videoId: null, positionSec: 0 },
          34_000,
        ),
      ],
    }
    const r = await app.inject({ method: 'POST', url: '/log/web/cl/1', cookies, payload: batch })
    expect(r.statusCode).toBe(200)
    expect(r.json().accepted).toBe(10)

    const viewing = app.services.viewing
    const viewerId = viewing.viewerIdOfProfile(guid)
    const facts = viewing.factsOfViewer(viewerId)
    const film = facts.find((f) => f.titleId === 80010001)!
    // izlenen: 10 + 10 + 30 (adım üst sınırı) = 50 sn; bitti → tamamlandı
    expect(film).toMatchObject({ source: 'TVPLUS', plays: 1, watchedSec: 50, completions: 1, rating: 2 })
    // Bölüm listeye eklendi → dizi düzeyinde özet
    expect(facts.find((f) => f.titleId === show.videoId)).toMatchObject({ inList: true, plays: 0 })
    const tv = viewing.sources().find((s) => s.source === 'TVPLUS')!
    // 2 gösterim + 1 tıklama + 4 oynatma + liste + beğeni + arama
    expect(tv).toMatchObject({ events: 10, viewers: 1, active: true })
    // Oturum (sentAt) saat kayması düzeltilir: ts sunucu saatine yakın
    expect(Math.abs(film.firstTs - NOW)).toBeLessThan(5 * 60_000)
    expect(viewing.activeSources()).toEqual(['TVPLUS'])

    // Aynı paket yeniden gelirse (ağ tekrarı) özet değişmez
    await app.inject({ method: 'POST', url: '/log/web/cl/1', cookies, payload: batch })
    expect(viewing.factsOfViewer(viewerId).find((f) => f.titleId === 80010001)!.plays).toBe(1)
    expect(viewing.sources().find((s) => s.source === 'TVPLUS')!.events).toBe(10)
  })

  it('sentetik veri varken uygulama verisi gelince SENTETİK analiz dışı kalır', async () => {
    const { app, cookies } = await loggedIn()
    await app.inject({
      method: 'POST',
      url: '/api/studio/sources/synthetic/generate',
      payload: { viewers: 20, days: 5, seed: 1 },
    })
    expect(app.services.viewing.activeSources()).toEqual(['SYNTHETIC'])
    await app.inject({
      method: 'POST',
      url: '/log/web/cl/1',
      cookies,
      payload: { sessionId: 's2', sentAt: NOW, events: [e('playback.start', { videoId: 80020001, positionSec: 0 })] },
    })
    expect(app.services.viewing.activeSources()).toEqual(['TVPLUS'])
    const st = Object.fromEntries(app.services.viewing.sources().map((s) => [s.source, s.active]))
    expect(st).toEqual({ TVPLUS: true, MIXPANEL: false, SYNTHETIC: false })
  })

  it('anonim paket çevrilmez; dinleyici hatası olay ucunu bozmaz; abonelik kaldırılabilir', async () => {
    const app = await createTestApp()
    apps.push(app)
    const anon = await app.inject({
      method: 'POST',
      url: '/log/web/cl/1',
      payload: { sessionId: 'a', sentAt: NOW, events: [e('playback.start', { videoId: 80010001, positionSec: 0 })] },
    })
    expect(anon.statusCode).toBe(200)
    expect(app.services.viewing.sources().every((s) => s.events === 0)).toBe(true)

    let calls = 0
    const off = app.services.events.subscribe!(() => {
      calls++
      throw new Error('bilerek')
    })
    const r = await app.inject({
      method: 'POST',
      url: '/log/web/cl/1',
      payload: { sessionId: 'b', sentAt: NOW, events: [e('navigate', { to: '/' })] },
    })
    expect(r.statusCode).toBe(200)
    expect(calls).toBe(1)
    off()
    await app.inject({
      method: 'POST',
      url: '/log/web/cl/1',
      payload: { sessionId: 'c', sentAt: NOW, events: [e('navigate', { to: '/' })] },
    })
    expect(calls).toBe(1)
  })
})
