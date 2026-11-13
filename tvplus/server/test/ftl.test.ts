import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FtlProbeResponse, FtlReport } from '../../shared/playback'
import { planeOf } from '../src/services/playback/plane'
import { createTestApp } from './helpers'
import { fakePassport, usePassport } from './playback-fakes'

let app: FastifyInstance
beforeAll(async () => {
  app = await createTestApp()
})
afterAll(async () => {
  await app.close()
})

describe('FTL yoklaması', () => {
  it('dört hedef, darbe gecikmeleri ve bağlam', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/ftl/probe?monotonic=false&device=web&iter=0' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['cache-control']).toBe('no-store')
    const body = res.json() as FtlProbeResponse
    expect(body.urls).toEqual([
      { name: 'resolver', url: '/oca/c101-ist001-ix/ftl/probe?data=5120', cdnId: 'c101-ist001-ix' },
      { name: 'oc.anycast.proxy', url: '/oca/anycast/ftl/probe?data=5120', cdnId: 'anycast' },
      { name: 'oc.ix.proxy', url: '/oca/c102-ist001-ix/ftl/probe?data=5120', cdnId: 'c102-ist001-ix' },
      { name: 'cloud', url: '/oca/cloud-ist-origin/ftl/probe?data=5120', cdnId: 'cloud-ist-origin' },
    ])
    expect(body.pulse_delays).toEqual([0, 2000, 70000])
    expect(body.pulses).toBe(3)
    expect(body.ctx).toEqual({ ip: '127.0.0.1', region: 'tr-ist-1', device: 'web' })
    expect(body.report).toBe('/api/ftl/report')
    // her hedef gerçekten yanıt verir
    for (const u of body.urls) {
      const r = await app.inject({ method: 'GET', url: u.url })
      expect(r.statusCode).toBe(200)
      expect(r.rawPayload.length).toBe(5120)
    }
  })

  it('rapor cihaz başına sıralama olarak saklanır (anycast ve başarısızlar atlanır)', async () => {
    usePassport(app, fakePassport({ deviceId: 'ftl-cihaz' }))
    const report: FtlReport = {
      iter: 0,
      pulse: 0,
      results: [
        { name: 'resolver', cdnId: 'c101-ist001-ix', ok: true, ttfbMs: 40, totalMs: 60, bytes: 5120, kbps: 700 },
        { name: 'oc.anycast.proxy', cdnId: 'anycast', ok: true, ttfbMs: 5, totalMs: 9, bytes: 5120, kbps: 9000 },
        { name: 'oc.ix.proxy', cdnId: 'c102-ist001-ix', ok: true, ttfbMs: 20, totalMs: 30, bytes: 5120, kbps: 1400 },
        { name: 'cloud', cdnId: 'cloud-ist-origin', ok: false, ttfbMs: 0, totalMs: 0, bytes: 0, kbps: 0 },
      ],
    }
    const res = await app.inject({ method: 'POST', url: '/api/ftl/report', payload: report })
    expect(res.statusCode).toBe(200)
    expect(res.json().ranking).toEqual(['c102-ist001-ix', 'c101-ist001-ix'])
    expect(planeOf(app).ftl.get('d:ftl-cihaz')).toEqual(['c102-ist001-ix', 'c101-ist001-ix'])
  })

  it('pasaport yoksa IP ile anahtarlanır; bozuk rapor 400', async () => {
    usePassport(app, null)
    await app.inject({
      method: 'POST',
      url: '/api/ftl/report',
      payload: {
        iter: 1,
        pulse: 1,
        results: [{ name: 'cloud', cdnId: 'cloud-ist-origin', ok: true, ttfbMs: 1, totalMs: 2, bytes: 1, kbps: 1 }],
      },
    })
    expect(planeOf(app).ftl.get('ip:127.0.0.1')).toEqual(['cloud-ist-origin'])
    const bad = await app.inject({ method: 'POST', url: '/api/ftl/report', payload: { iter: 'x' } })
    expect(bad.statusCode).toBe(400)
  })
})
