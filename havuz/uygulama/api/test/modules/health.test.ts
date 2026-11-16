import { API_PATHS, healthResponseSchema } from '@uygulama/shared'
import { afterEach, describe, expect, it } from 'vitest'
import { TestClient } from '../support/client.ts'
import { createTestServer, type TestServer } from '../support/harness.ts'

let t: TestServer
afterEach(async () => {
  await t.close()
})

describe('sağlık ucu', () => {
  it('oturumsuz yanıt verir; gövde şemaya uyar; güvenlik başlıkları ve istek kimliği vardır', async () => {
    t = createTestServer()
    const reply = await new TestClient(t).get(API_PATHS.health)
    expect(reply.status).toBe(200)
    expect(healthResponseSchema.parse(reply.body)).toMatchObject({ ok: true, version: t.config.version })
    expect(reply.headers.get('cache-control')).toBe('no-store')
    expect(reply.headers.get('x-content-type-options')).toBe('nosniff')
    expect(reply.headers.get('x-request-id')).toMatch(/^[\w-]{8,}$/)
  })

  it('istemcinin geçerli istek kimliğini korur, geçersizini değiştirir', async () => {
    t = createTestServer()
    const client = new TestClient(t)
    expect((await client.get(API_PATHS.health, { 'X-Request-Id': 'istek-12345' })).headers.get('x-request-id')).toBe(
      'istek-12345',
    )
    const bad = await client.get(API_PATHS.health, { 'X-Request-Id': 'kotu deger <script>' })
    expect(bad.headers.get('x-request-id')).not.toContain('kotu')
  })

  it('bilinmeyen /api adresi JSON 404 döner', async () => {
    t = createTestServer()
    const reply = await new TestClient(t).get('/api/yok-boyle-bir-sey')
    expect(reply.status).toBe(404)
    expect(reply.body.error.code).toBe('not_found')
  })
})
