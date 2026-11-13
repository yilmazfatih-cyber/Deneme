import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ClientEvent, EventBatch, EventBatchResponse } from '../../shared/types'
import { createRateLimiter } from '../src/services/events/plugin'
import { createTestApp } from './helpers'

let app: FastifyInstance
beforeAll(async () => {
  app = await createTestApp()
})
afterAll(async () => {
  await app.close()
})

const ev = (name: ClientEvent['name'], data: Record<string, unknown> = {}, seq = 1): ClientEvent => ({ name, ts: Date.now(), seq, data })
const batch = (events: unknown[]): EventBatch => ({ sessionId: 's1', sentAt: Date.now(), events: events as ClientEvent[] })
const DEVICE = { tvpvdid: '0123456789abcdef0123456789abcdef' }

describe('POST /log/web/cl/1', () => {
  it('JSON paketi kabul eder, geçersiz olayları tek tek düşürür', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/log/web/cl/1',
      cookies: DEVICE,
      payload: batch([ev('navigate', { to: '#/' }), { name: 'uydurma', ts: 1, seq: 1, data: {} }, { name: 'click' }, ev('click', {}, 2)]),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json<EventBatchResponse>()).toMatchObject({ accepted: 2, dropped: 2 })
    expect(res.headers['x-tvplus-izci']).toMatch(/^~0=true~RL=\d+$/)
    expect(res.json<EventBatchResponse>().rateLimitRemaining).toBe(Number(String(res.headers['x-tvplus-izci']).split('RL=')[1]))
  })

  it('text/plain (sendBeacon) gövdesini de okur', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/log/web/cl/1',
      headers: { 'content-type': 'text/plain;charset=UTF-8' },
      payload: JSON.stringify(batch([ev('impression', { rowId: 'r1' })])),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json<EventBatchResponse>().accepted).toBe(1)
  })

  it('bozuk gövde 400 döner, 500 değil; başlık yine vardır', async () => {
    const plain = await app.inject({ method: 'POST', url: '/log/web/cl/1', headers: { 'content-type': 'text/plain' }, payload: '{bozuk' })
    expect(plain.statusCode).toBe(400)
    expect(plain.headers['x-tvplus-izci']).toMatch(/^~0=true~RL=\d+$/)
    const json = await app.inject({ method: 'POST', url: '/log/web/cl/1', headers: { 'content-type': 'application/json' }, payload: '{bozuk' })
    expect(json.statusCode).toBe(400)
    expect(json.json().error.code).toBeTypeOf('string')
    expect(json.headers['x-tvplus-izci']).toMatch(/^~0=true~RL=\d+$/)
    const shape = await app.inject({ method: 'POST', url: '/log/web/cl/1', payload: { events: 'yok' } })
    expect(shape.statusCode).toBe(400)
    expect(shape.json().error.code).toBe('INVALID_BATCH')
  })

  it('kota aşılınca 429 ve aynı başlık', async () => {
    const cookies = { tvpvdid: 'ffffffffffffffffffffffffffffffff' }
    const many = Array.from({ length: 500 }, (_, i) => ev('focus', {}, i))
    let last = 0
    for (let i = 0; i < 6; i++) {
      const r = await app.inject({ method: 'POST', url: '/log/web/cl/1', cookies, payload: batch(many) })
      expect(r.statusCode).toBe(200)
      last = r.json<EventBatchResponse>().rateLimitRemaining
    }
    expect(last).toBeLessThan(5)
    const over = await app.inject({ method: 'POST', url: '/log/web/cl/1', cookies, payload: batch(many) })
    expect(over.statusCode).toBe(429)
    expect(over.headers['x-tvplus-izci']).toMatch(/^~0=true~RL=\d+$/)
    expect(over.json<EventBatchResponse>()).toMatchObject({ accepted: 0, dropped: 500 })
    // Başka cihaz etkilenmez
    const other = await app.inject({ method: 'POST', url: '/log/web/cl/1', cookies: DEVICE, payload: batch([ev('click')]) })
    expect(other.statusCode).toBe(200)
  })

  it('jeton kovası zamanla dolar', () => {
    let t = 0
    const rl = createRateLimiter(10, 1000, () => t)
    expect(rl.take('a', 10)).toEqual({ ok: true, remaining: 0 })
    expect(rl.take('a', 1).ok).toBe(false)
    t = 500
    expect(rl.peek('a')).toBe(5)
    t = 5000
    expect(rl.peek('a')).toBe(10)
  })

  it('playCounts zaman penceresi ve stats', async () => {
    const svc = app.services.events
    const now = Date.now()
    const r = svc.ingest(
      {
        sessionId: 's',
        sentAt: now,
        events: [
          { name: 'playback.start', ts: now - 1000, seq: 1, data: { videoId: 80010001 } },
          { name: 'playback.start', ts: now - 2000, seq: 2, data: { videoId: 80010001 } },
          { name: 'playback.start', ts: now - 3 * 3600_000, seq: 3, data: { videoId: 80010002 } },
          { name: 'playback.start', ts: now, seq: 4, data: { videoId: 'yazı' } },
          { name: 'playback.heartbeat', ts: now, seq: 5, data: { videoId: 80010003 } },
        ],
      },
      null,
    )
    expect(r.accepted).toBe(5)
    const lastHour = svc.playCounts(1)
    expect(lastHour.get(80010001)).toBe(2)
    expect(lastHour.has(80010002)).toBe(false)
    expect(lastHour.has(80010003)).toBe(false)
    expect(svc.playCounts(24).get(80010002)).toBe(1)
    const stats = svc.stats()
    expect(stats.total).toBeGreaterThan(5)
    expect(stats.byName['playback.start']).toBe(4)
    expect(stats.lastBatchAt).toMatch(/^\d{4}-/)
  })

  it('GET /api/debug/events en yeni olay başta', async () => {
    await app.inject({ method: 'POST', url: '/log/web/cl/1', payload: batch([ev('search', { term: 'son' }, 99)]) })
    const res = await app.inject({ url: '/api/debug/events?limit=3' })
    expect(res.statusCode).toBe(200)
    const list = res.json<{ name: string; data: Record<string, unknown>; receivedAt: string }[]>()
    expect(list).toHaveLength(3)
    expect(list[0]!.name).toBe('search')
    expect(list[0]!.data.term).toBe('son')
  })

  it('sayaçlar yeniden başlatmadan sonra korunur', async () => {
    const { mkdtempSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const dataDir = mkdtempSync(join(tmpdir(), 'tvplus-test-events-'))
    // isTest iken depo diske yazmaz; kalıcılığı sınamak için isTest=false (günlük kapalı) ile kurulur.
    const a = await createTestApp({ dataDir, isTest: false })
    a.services.events.ingest({ sessionId: 's', sentAt: Date.now(), events: [ev('playback.start', { videoId: 7 })] }, null)
    await a.close()
    const b = await createTestApp({ dataDir, isTest: false })
    try {
      expect(b.services.events.playCounts(1).get(7)).toBe(1)
      expect(b.services.events.stats().total).toBe(1)
    } finally {
      await b.close()
    }
  })
})
