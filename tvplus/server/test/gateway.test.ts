import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { BootContext, DebugServerState } from '../../shared/types'
import { bootScript, injectBoot } from '../src/gateway/shell'
import { createTestApp } from './helpers'

let app: FastifyInstance
let distDir: string
beforeAll(async () => {
  distDir = mkdtempSync(join(tmpdir(), 'tvplus-test-dist-'))
  writeFileSync(
    join(distDir, 'index.html'),
    '<!doctype html><html><head><title>TV+</title><!--TVP_BOOT--></head><body><div id="root"></div></body></html>',
  )
  mkdirSync(join(distDir, 'assets'))
  writeFileSync(join(distDir, 'assets', 'index-abc123.js'), 'console.log(1)')
  writeFileSync(join(distDir, 'robots.txt'), 'User-agent: *')
  app = await createTestApp({ webDistDir: distDir })
})
afterAll(async () => {
  await app.close()
})

describe('B3 izleme', () => {
  it('her yanıtta iz, bölge ve server-timing başlıkları', async () => {
    const res = await app.inject({ url: '/api/boot' })
    expect(res.headers['x-b3-traceid']).toMatch(/^[0-9a-f]{32}$/)
    expect(res.headers['x-b3-spanid']).toMatch(/^[0-9a-f]{16}$/)
    expect(res.headers['x-b3-sampled']).toBe('1')
    expect(res.headers['x-tvplus-region']).toBe('tr-ist-1')
    expect(res.headers['server-timing']).toMatch(/^gateway;dur=\d+(\.\d+)?$/)
    // 404'te de
    const nf = await app.inject({ url: '/api/yok' })
    expect(nf.headers['x-b3-traceid']).toMatch(/^[0-9a-f]{32}$/)
  })

  it('geçerli gelen izi kabul eder, geçersizi yeniler', async () => {
    const traceId = '463ac35c9f6413ad48485a3953bb6124'
    const spanId = 'a2fb4a1d1a96d312'
    const ok = await app.inject({ url: '/api/boot', headers: { 'x-b3-traceid': traceId, 'x-b3-spanid': spanId } })
    expect(ok.headers['x-b3-traceid']).toBe(traceId)
    expect(ok.headers['x-b3-spanid']).toBe(spanId)
    const short = await app.inject({ url: '/api/boot', headers: { 'x-b3-traceid': '463ac35c9f6413ad' } })
    expect(short.headers['x-b3-traceid']).toBe('463ac35c9f6413ad')
    const bad = await app.inject({ url: '/api/boot', headers: { 'x-b3-traceid': 'zzz<script>', 'x-b3-spanid': '123' } })
    expect(bad.headers['x-b3-traceid']).toMatch(/^[0-9a-f]{32}$/)
    expect(bad.headers['x-b3-traceid']).not.toBe('zzz<script>')
    expect(bad.headers['x-b3-spanid']).toMatch(/^[0-9a-f]{16}$/)
  })
})

describe('hata biçimi', () => {
  it('API önekli bilinmeyen adres JSON 404 ve traceId', async () => {
    for (const url of ['/api/yok', '/graphql/x', '/img/v1/nope', '/log/x', '/push/x', '/msl/x', '/oca/x/y']) {
      const res = await app.inject({ url })
      expect(res.statusCode, url).toBe(404)
      expect(res.headers['content-type']).toMatch(/application\/json/)
      const body = res.json()
      expect(body.error.code).toBe('NOT_FOUND')
      expect(body.error.message).toBe('Aradığınız adres bulunamadı.')
      expect(body.error.traceId).toBe(res.headers['x-b3-traceid'])
    }
  })

  it('bozuk JSON 400, yığın izi sızmaz', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/profiles/switch',
      headers: { 'content-type': 'application/json' },
      payload: '{x',
    })
    expect(res.statusCode).toBe(400)
    const body = res.json()
    expect(body.error.code).toBe('INVALID_BODY')
    expect(JSON.stringify(body)).not.toMatch(/at .*\.js|stack/)
  })
})

describe('SPA kabuğu', () => {
  it('index.html açılış bağlamını gömer', async () => {
    const res = await app.inject({ url: '/', headers: { accept: 'text/html' } })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/html/)
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.body).not.toContain('<!--TVP_BOOT-->')
    const m = /<script id="tvp-boot" type="application\/json">(.*?)<\/script>/.exec(res.body)
    expect(m).not.toBeNull()
    const boot = JSON.parse(m![1]!) as BootContext
    expect(boot.membershipStatus).toBe('ANONYMOUS')
    expect(boot.region).toBe('tr-ist-1')
    // Derin bağlantı da kabuğa düşer
    const deep = await app.inject({ url: '/herhangi/bir/yol' })
    expect(deep.body).toContain('id="tvp-boot"')
    // index.html doğrudan (bağlamsız) verilmez
    const direct = await app.inject({ url: '/index.html' })
    expect(direct.body).toContain('id="tvp-boot"')
  })

  it('JSON gömmesi < karakterini kaçırır', () => {
    const boot = { buildId: '</script><script>alert(1)</script>' } as unknown as BootContext
    const s = bootScript(boot)
    expect(s.match(/<\/script>/g)).toHaveLength(1)
    expect(s).toContain('\\u003c/script>')
    expect(JSON.parse(s.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, ''))).toEqual(boot)
    expect(injectBoot('<head></head>', boot)).toContain('id="tvp-boot"')
  })

  it('statik dosyalar: /assets değişmez önbellekli, /brand her zaman', async () => {
    const js = await app.inject({ url: '/assets/index-abc123.js' })
    expect(js.statusCode).toBe(200)
    expect(js.headers['cache-control']).toBe('public, max-age=31536000, immutable')
    const robots = await app.inject({ url: '/robots.txt' })
    expect(robots.statusCode).toBe(200)
    const logo = await app.inject({ url: '/brand/logo.png' })
    expect(logo.statusCode).toBe(200)
    expect(logo.headers['content-type']).toBe('image/png')
    const missingAsset = await app.inject({ url: '/assets/yok.js' })
    expect(missingAsset.statusCode).toBe(404)
  })

  it('web/dist yoksa Türkçe yönlendirme sayfası', async () => {
    const other = await createTestApp({ webDistDir: join(distDir, 'olmayan') })
    try {
      const res = await other.inject({ url: '/' })
      expect(res.statusCode).toBe(200)
      expect(res.body).toContain('npm run build')
      expect(res.body).toContain('npm run dev')
      const logo = await other.inject({ url: '/brand/logo.png' })
      expect(logo.statusCode).toBe(200)
      const api = await other.inject({ url: '/api/yok' })
      expect(api.json().error.code).toBe('NOT_FOUND')
    } finally {
      await other.close()
    }
  })
})

describe('hata ayıklama durumu', () => {
  it('GET /api/debug/state eksik servislerde bile döner', async () => {
    const res = await app.inject({ url: '/api/debug/state' })
    expect(res.statusCode).toBe(200)
    const s = res.json<DebugServerState>()
    expect(s.region).toBe('tr-ist-1')
    expect(s.uptimeSec).toBeGreaterThanOrEqual(0)
    expect(Array.isArray(s.oca)).toBe(true)
    expect(s.events).toHaveProperty('total')
    expect(s.playback).toHaveProperty('manifestsIssued')
    expect(s.catalog).toHaveProperty('titles')
  })
})
