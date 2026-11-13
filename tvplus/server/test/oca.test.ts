import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { OcaNodeState } from '../../shared/types'
import { packageTitle } from '../../scripts/package-title'
import { createBlockCache } from '../src/services/oca/blockCache'
import { planeOf, replaceCache } from '../src/services/playback/plane'
import { packagedDir, type PackagedStream } from '../src/services/playback/sources/packaged'
import { createTestApp } from './helpers'
import { generateClip } from './playback-fakes'

const NODE = 'c101-ist001-ix'
let work: string
let mediaDir: string
let video: PackagedStream
let videoBytes: Buffer
let app: FastifyInstance

beforeAll(async () => {
  work = mkdtempSync(join(tmpdir(), 'tvplus-oca-'))
  mediaDir = join(work, 'media')
  const clip = await generateClip(work)
  const index = await packageTitle({ input: clip, id: 'oca-klip', mediaDir, ladder: [144], bitrates: { 144: 120 }, codecs: ['vp9'], speed: 'fast' })
  video = index.streams.find((s) => s.type === 'video')!
  videoBytes = readFileSync(join(packagedDir(mediaDir, 'oca-klip'), video.file))
  app = await createTestApp({ mediaDir })
}, 60_000)
afterAll(async () => {
  await app.close()
  rmSync(work, { recursive: true, force: true })
})
beforeEach(() => planeOf(app).nodes.reset())

function localObject() {
  const plane = planeOf(app)
  return plane.objects.register({ kind: 'local', path: join(packagedDir(mediaDir, 'oca-klip'), video.file), mime: video.mimeType, size: video.sizeBytes })
}
function rangeUrl(node: string, start: number, end: number, rec = localObject(), e?: number) {
  return `/oca/${node}/range/${start}-${end}?${planeOf(app).signer.query(node, rec.o, rec.v, e)}`
}
const nodeState = async (id: string) => ((await app.inject({ method: 'GET', url: '/api/debug/oca' })).json() as OcaNodeState[]).find((n) => n.id === id)!

describe('OCA bayt aralığı (yerel paketlenmiş nesne)', () => {
  it('206 + başlıklar + doğru baytlar', async () => {
    const { init } = video
    const res = await app.inject({ method: 'GET', url: rangeUrl(NODE, init.start, init.end) })
    expect(res.statusCode).toBe(206)
    expect(res.headers['content-range']).toBe(`bytes ${init.start}-${init.end}/${video.sizeBytes}`)
    expect(res.headers['content-length']).toBe(String(init.end - init.start + 1))
    expect(res.headers['content-type']).toBe('video/webm')
    expect(res.headers['accept-ranges']).toBe('bytes')
    expect(res.headers['cache-control']).toBe('private, max-age=3600')
    expect(res.headers['x-tvplus-oca']).toBe(NODE)
    expect(res.headers['x-tcp-info']).toMatch(/^addr=[^;]+;port=\d+;rtt=12$/)
    expect(res.headers.server).toBe('tvplus-oca')
    expect(res.headers['timing-allow-origin']).toBe('*')
    expect(res.rawPayload.equals(videoBytes.subarray(init.start, init.end + 1))).toBe(true)
  })

  it('dosya sonunu aşan aralık kırpılır; dosya dışı 416', async () => {
    const size = video.sizeBytes
    const r1 = await app.inject({ method: 'GET', url: rangeUrl(NODE, size - 10, size + 1000) })
    expect(r1.statusCode).toBe(206)
    expect(r1.headers['content-range']).toBe(`bytes ${size - 10}-${size - 1}/${size}`)
    expect(r1.rawPayload.length).toBe(10)
    const r2 = await app.inject({ method: 'GET', url: rangeUrl(NODE, size, size + 5) })
    expect(r2.statusCode).toBe(416)
    expect(r2.headers['content-range']).toBe(`bytes */${size}`)
    const r3 = await app.inject({ method: 'GET', url: rangeUrl(NODE, 50, 10) })
    expect(r3.statusCode).toBe(416)
  })

  it('imza / süre / düğüm denetimleri', async () => {
    const rec = localObject()
    const good = rangeUrl(NODE, 0, 9, rec)
    const tampered = good.replace(/t=[^&]+/, 't=AAAA')
    expect((await app.inject({ method: 'GET', url: tampered })).statusCode).toBe(403)
    const expired = await app.inject({ method: 'GET', url: rangeUrl(NODE, 0, 9, rec, 1000) })
    expect(expired.statusCode).toBe(403)
    expect(expired.json().error.code).toBe('URL_EXPIRED')
    const wrongNode = good.replace(`/oca/${NODE}/`, '/oca/c102-ist001-ix/')
    expect((await app.inject({ method: 'GET', url: wrongNode })).statusCode).toBe(403)
    expect((await app.inject({ method: 'GET', url: good.replace(`/oca/${NODE}/`, '/oca/yok-boyle/') })).statusCode).toBe(404)
    expect((await app.inject({ method: 'GET', url: `/oca/${NODE}/range/0-9` })).statusCode).toBe(400)
  })

  it('/file: Range yoksa 200 tam dosya, varsa 206 (açık uçlu ve sonek dahil)', async () => {
    const rec = localObject()
    const url = `/oca/${NODE}/file?${planeOf(app).signer.query(NODE, rec.o, rec.v)}`
    const full = await app.inject({ method: 'GET', url })
    expect(full.statusCode).toBe(200)
    expect(full.rawPayload.equals(videoBytes)).toBe(true)
    expect(full.headers['accept-ranges']).toBe('bytes')
    const part = await app.inject({ method: 'GET', url, headers: { range: 'bytes=100-199' } })
    expect(part.statusCode).toBe(206)
    expect(part.rawPayload.equals(videoBytes.subarray(100, 200))).toBe(true)
    const open = await app.inject({ method: 'GET', url, headers: { range: `bytes=${video.sizeBytes - 5}-` } })
    expect(open.headers['content-range']).toBe(`bytes ${video.sizeBytes - 5}-${video.sizeBytes - 1}/${video.sizeBytes}`)
    const suffix = await app.inject({ method: 'GET', url, headers: { range: 'bytes=-7' } })
    expect(suffix.rawPayload.equals(videoBytes.subarray(video.sizeBytes - 7))).toBe(true)
    const outside = await app.inject({ method: 'GET', url, headers: { range: `bytes=${video.sizeBytes + 1}-` } })
    expect(outside.statusCode).toBe(416)
  })

  it('sayaçlar: istek, bayt, isabet', async () => {
    const before = await nodeState('c102-ist001-ix')
    await app.inject({ method: 'GET', url: rangeUrl('c102-ist001-ix', 0, 999) })
    const after = await nodeState('c102-ist001-ix')
    expect(after.requests - before.requests).toBe(1)
    expect(after.bytesServed - before.bytesServed).toBe(1000)
    expect(after.cacheHits - before.cacheHits).toBe(1)
  })
})

describe('yapay koşullar ve hata ayıklama uçları', () => {
  it('gecikme ilk bayttan önce uygulanır', async () => {
    await app.inject({ method: 'POST', url: `/api/debug/oca/${NODE}`, payload: { latencyMs: 150 } })
    const t0 = Date.now()
    const res = await app.inject({ method: 'GET', url: rangeUrl(NODE, 0, 99) })
    expect(res.statusCode).toBe(206)
    expect(Date.now() - t0).toBeGreaterThanOrEqual(145)
    expect(res.headers['x-tcp-info']).toContain('rtt=150')
  })

  it('hız sınırı gövdeyi yavaşlatır (≈ bayt × 8 / kbps ms)', async () => {
    await app.inject({ method: 'POST', url: `/api/debug/oca/${NODE}`, payload: { latencyMs: 0, throughputKbps: 640 } })
    const t0 = Date.now()
    const res = await app.inject({ method: 'GET', url: rangeUrl(NODE, 0, 39_999) })
    const ms = Date.now() - t0
    expect(res.rawPayload.length).toBe(40_000)
    expect(ms).toBeGreaterThanOrEqual(450) // 40 000 × 8 / 640 = 500 ms
    expect(ms).toBeLessThan(2000)
    await app.inject({ method: 'POST', url: `/api/debug/oca/${NODE}`, payload: { throughputKbps: null } })
    const t1 = Date.now()
    await app.inject({ method: 'GET', url: rangeUrl(NODE, 0, 39_999) })
    expect(Date.now() - t1).toBeLessThan(200)
  })

  it('hata oranı 1 → 503; kapalı düğüm → beklemeden 503; sıfırlama', async () => {
    await app.inject({ method: 'POST', url: `/api/debug/oca/${NODE}`, payload: { errorRate: 1 } })
    const r1 = await app.inject({ method: 'GET', url: rangeUrl(NODE, 0, 9) })
    expect(r1.statusCode).toBe(503)
    expect(r1.json().error.code).toBe('NODE_ERROR')
    await app.inject({ method: 'POST', url: `/api/debug/oca/${NODE}`, payload: { errorRate: 0, down: true, latencyMs: 1000 } })
    const t0 = Date.now()
    const r2 = await app.inject({ method: 'GET', url: rangeUrl(NODE, 0, 9) })
    expect(r2.statusCode).toBe(503)
    expect(r2.json().error.code).toBe('NODE_DOWN')
    expect(Date.now() - t0).toBeLessThan(500)
    const reset = await app.inject({ method: 'POST', url: '/api/debug/oca/reset' })
    const n = (reset.json() as OcaNodeState[]).find((x) => x.id === NODE)!
    expect([n.down, n.latencyMs, n.errorRate, n.requests]).toEqual([false, 12, 0, 0])
  })

  it('debug: dört düğüm, geçersiz gövde 400, bilinmeyen düğüm 404', async () => {
    const list = (await app.inject({ method: 'GET', url: '/api/debug/oca' })).json() as OcaNodeState[]
    expect(list.map((n) => n.id)).toEqual(['c101-ist001-ix', 'c102-ist001-ix', 'c201-ank001-isp', 'cloud-ist-origin'])
    expect(list.find((n) => n.id === 'cloud-ist-origin')!.throughputKbps).toBe(6000)
    expect(app.services.oca.nodes()).toHaveLength(4)
    expect((await app.inject({ method: 'POST', url: `/api/debug/oca/${NODE}`, payload: { errorRate: 2 } })).statusCode).toBe(400)
    expect((await app.inject({ method: 'POST', url: `/api/debug/oca/${NODE}`, payload: { bilinmeyen: 1 } })).statusCode).toBe(400)
    expect((await app.inject({ method: 'POST', url: '/api/debug/oca/yok', payload: { down: true } })).statusCode).toBe(404)
  })

  it('FTL yoklama ucu: N bayt, no-store; anycast en iyi sağlıklı düğüme gider', async () => {
    const r = await app.inject({ method: 'GET', url: `/oca/c201-ank001-isp/ftl/probe?data=1000` })
    expect(r.statusCode).toBe(200)
    expect(r.rawPayload.length).toBe(1000)
    expect(r.headers['cache-control']).toBe('no-store')
    const a1 = await app.inject({ method: 'GET', url: '/oca/anycast/ftl/probe?data=10' })
    expect(a1.headers['x-tvplus-oca']).toBe('c101-ist001-ix')
    await app.inject({ method: 'POST', url: `/api/debug/oca/${NODE}`, payload: { down: true } })
    const a2 = await app.inject({ method: 'GET', url: '/oca/anycast/ftl/probe?data=10' })
    expect(a2.headers['x-tvplus-oca']).toBe('c102-ist001-ix')
  })
})

describe('uzak nesne: disk önbelleği (yerel köken sunucusuyla)', () => {
  let origin: Server
  let originUrl: string
  let originRequests: string[]
  let remoteApp: FastifyInstance

  beforeAll(async () => {
    originRequests = []
    origin = createServer((req, res) => {
      originRequests.push(req.headers.range ?? 'yok')
      const m = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range ?? '')
      const start = m ? Number(m[1]) : 0
      const end = m ? Math.min(Number(m[2]), videoBytes.length - 1) : videoBytes.length - 1
      setTimeout(() => {
        res.writeHead(m ? 206 : 200, {
          'content-type': 'video/webm',
          'content-length': String(end - start + 1),
          ...(m ? { 'content-range': `bytes ${start}-${end}/${videoBytes.length}` } : {}),
        })
        res.end(videoBytes.subarray(start, end + 1))
      }, 30)
    })
    await new Promise<void>((r) => origin.listen(0, '127.0.0.1', r))
    originUrl = `http://127.0.0.1:${(origin.address() as AddressInfo).port}/v.webm`
    // Yalnızca yerel köken: dış ağa çıkılmaz, ama çevrimiçi kod yolu sınanır.
    remoteApp = await createTestApp({ offline: false })
    replaceCache(remoteApp, createBlockCache({ dir: join(remoteApp.config.dataDir, 'oca-cache'), blockSize: 16 * 1024, capBytes: 64 * 1024 }))
  })
  afterAll(async () => {
    await remoteApp.close()
    await new Promise<void>((r) => origin.close(() => r()))
  })

  const remoteRange = (start: number, end: number, size: number | null = videoBytes.length) => {
    const plane = planeOf(remoteApp)
    const rec = plane.objects.register({ kind: 'remote', url: originUrl, mime: 'video/webm', size })
    return `/oca/${NODE}/range/${start}-${end}?${plane.signer.query(NODE, rec.o, rec.v)}`
  }
  const state = () => planeOf(remoteApp).nodes.get(NODE)!

  it('ilk istek kökenden (ıska), ikincisi diskten (isabet); baytlar aynı', async () => {
    const before = originRequests.length
    const r1 = await remoteApp.inject({ method: 'GET', url: remoteRange(1000, 40_000) })
    expect(r1.statusCode).toBe(206)
    expect(r1.rawPayload.equals(videoBytes.subarray(1000, 40_001))).toBe(true)
    expect(originRequests.length - before).toBe(1) // ardışık 3 blok tek istekte
    expect(originRequests[originRequests.length - 1]).toBe(`bytes=0-${3 * 16 * 1024 - 1}`)
    expect(state().cacheMisses).toBe(1)
    const r2 = await remoteApp.inject({ method: 'GET', url: remoteRange(2000, 30_000) })
    expect(r2.rawPayload.equals(videoBytes.subarray(2000, 30_001))).toBe(true)
    expect(originRequests.length - before).toBe(1)
    expect(state().cacheHits).toBe(1)
  })

  it('aynı bloğa eşzamanlı istekler tek köken isteğinde birleşir', async () => {
    const before = originRequests.length
    const url = remoteRange(50_000, 52_000)
    const all = await Promise.all([1, 2, 3, 4].map(() => remoteApp.inject({ method: 'GET', url })))
    for (const r of all) expect(r.rawPayload.equals(videoBytes.subarray(50_000, 52_001))).toBe(true)
    expect(originRequests.length - before).toBe(1)
  })

  it('boyu bilinmeyen nesne için boy kökenden öğrenilir; LRU sınırı aşılmaz', async () => {
    const r = await remoteApp.inject({ method: 'GET', url: remoteRange(0, 99, null) })
    expect(r.headers['content-range']).toBe(`bytes 0-99/${videoBytes.length}`)
    await remoteApp.inject({ method: 'GET', url: remoteRange(0, videoBytes.length - 1) })
    const s = planeOf(remoteApp).cache.stats()
    expect(s.bytes).toBeLessThanOrEqual(64 * 1024)
  })

  it('çevrimdışı uygulamada önbellekte olmayan uzak nesne → 502', async () => {
    const plane = planeOf(app)
    const rec = plane.objects.register({ kind: 'remote', url: 'https://example.invalid/yok.webm', mime: 'video/webm', size: 1000 })
    const r = await app.inject({ method: 'GET', url: `/oca/${NODE}/range/0-9?${plane.signer.query(NODE, rec.o, rec.v)}` })
    expect(r.statusCode).toBe(502)
  })
})
