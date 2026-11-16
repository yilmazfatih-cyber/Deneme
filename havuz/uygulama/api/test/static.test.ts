import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WEB_CSP } from '../src/http/securityHeaders.ts'
import { IMMUTABLE_CACHE, NO_CACHE } from '../src/http/static.ts'
import { createTestServer, type TestServer } from './support/harness.ts'

let dist: string
let t: TestServer

beforeEach(() => {
  dist = mkdtempSync(join(tmpdir(), 'uygulama-web-'))
  mkdirSync(join(dist, 'assets'))
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>Uygulama</title><div id="kok"></div>')
  writeFileSync(join(dist, 'assets', 'index-AbC123xy.js'), 'console.log("merhaba")')
  writeFileSync(join(dist, 'sw.js'), 'self.addEventListener("fetch", () => {})')
  writeFileSync(join(dist, 'manifest.webmanifest'), '{"name":"Uygulama"}')
  writeFileSync(join(dist, '.env'), 'GIZLI=1')
  t = createTestServer({ env: { WEB_DIST: dist } })
})

afterEach(async () => {
  await t.close()
  rmSync(dist, { recursive: true, force: true })
})

const get = (path: string, headers: Record<string, string> = {}) => t.server.app.request(path, { headers })

describe('web uygulamasını sunma (WEB_DIST)', () => {
  it('index.html önbelleksiz ve web CSP ile sunulur', async () => {
    expect(t.server.servesWeb).toBe(true)
    const response = await get('/')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(response.headers.get('cache-control')).toBe(NO_CACHE)
    expect(response.headers.get('content-security-policy')).toBe(WEB_CSP)
    expect(response.headers.get('x-frame-options')).toBe('DENY')
    expect(await response.text()).toContain('id="kok"')
  })

  it('özetli varlıklar 1 yıl değişmez önbellekte; servis çalışanı ve manifest önbelleksiz', async () => {
    const asset = await get('/assets/index-AbC123xy.js')
    expect(asset.headers.get('cache-control')).toBe(IMMUTABLE_CACHE)
    expect(asset.headers.get('content-type')).toBe('text/javascript; charset=utf-8')
    expect((await get('/sw.js')).headers.get('cache-control')).toBe(NO_CACHE)
    const manifest = await get('/manifest.webmanifest')
    expect(manifest.headers.get('content-type')).toContain('application/manifest+json')
    expect(manifest.headers.get('cache-control')).toBe(NO_CACHE)
  })

  it('ETag ile koşullu istek 304 döner; HEAD gövdesizdir', async () => {
    const first = await get('/assets/index-AbC123xy.js')
    const etag = first.headers.get('etag') ?? ''
    expect(etag).toMatch(/^W\/"/)
    const second = await get('/assets/index-AbC123xy.js', { 'If-None-Match': etag })
    expect(second.status).toBe(304)
    const head = await t.server.app.request('/sw.js', { method: 'HEAD' })
    expect(head.status).toBe(200)
    expect(await head.text()).toBe('')
  })

  it('SPA yedeği: uzantısız bilinmeyen adres index.html; uzantılı bilinmeyen 404', async () => {
    const page = await get('/ayarlar/profil')
    expect(page.status).toBe(200)
    expect(await page.text()).toContain('id="kok"')
    expect((await get('/assets/eski-dosya-12345678.js')).status).toBe(404)
  })

  it('API adresleri yedeğe düşmez: bilinmeyen /api JSON 404', async () => {
    const response = await get('/api/olmayan')
    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toContain('application/json')
  })

  it('klasör dışına çıkma, gizli dosya ve bozuk kodlama 404', async () => {
    for (const path of [
      '/..%2f..%2fetc%2fpasswd',
      '/assets/..%2f..%2f..%2fetc%2fhosts',
      '/.env',
      '/%E0%A4%A',
      '/a%00b',
    ]) {
      const response = await get(path)
      expect(response.status, path).toBe(404)
      expect(await response.text()).not.toContain('GIZLI')
    }
  })

  it('WEB_DIST hazır değilse yalnız API çalışır', async () => {
    const empty = createTestServer({ env: { WEB_DIST: join(dist, 'yok') } })
    expect(empty.server.servesWeb).toBe(false)
    expect((await empty.server.app.request('/')).status).toBe(404)
    await empty.close()
  })
})
