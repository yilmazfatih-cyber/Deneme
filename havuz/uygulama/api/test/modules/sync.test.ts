/**
 * Eşitleme ucunun HTTP'ye özgü davranışları. Protokolün kendisi uygunluk testlerindedir
 * (test/sync.conformance.test.ts); burada kimlik, gövde, sınırlar ve depolama sınanır.
 */
import { API_PATHS, PROTOCOL_VERSION, SYNC_LIMITS, syncResponseSchema, type Mutation } from '@uygulama/shared'
import { afterEach, describe, expect, it } from 'vitest'
import { signUp, TestClient } from '../support/client.ts'
import { createTestServer, type TestServer } from '../support/harness.ts'

let t: TestServer
afterEach(async () => {
  await t.close()
})

const AT = '2026-11-16T10:00:00.000Z'

const put = (mid: number, workspaceId: string, recordId: string, title: string): Mutation => ({
  mid,
  workspaceId,
  collection: 'tasks',
  recordId,
  at: AT,
  op: 'put',
  data: { title },
})

describe('eşitleme ucu', () => {
  it('oturumsuz 401; JSON olmayan gövde 400', async () => {
    t = createTestServer()
    const anon = await new TestClient(t).post(API_PATHS.sync, {
      protocolVersion: PROTOCOL_VERSION,
      clientId: 'c',
      cursors: {},
      mutations: [],
    })
    expect(anon.status).toBe(401)
    const ayse = await signUp(t)
    const text = await ayse.client.send('POST', API_PATHS.sync, 'merhaba', { 'Content-Type': 'text/plain' })
    expect(text.status).toBe(400)
  })

  it('kayıt veritabanında JSON olarak, rev ve kimlikle saklanır; yanıt şemaya uyar', async () => {
    t = createTestServer()
    const ayse = await signUp(t)
    const ws = ayse.personalWorkspaceId
    const reply = await ayse.client.post(API_PATHS.sync, {
      protocolVersion: PROTOCOL_VERSION,
      clientId: 'telefon',
      cursors: {},
      mutations: [put(1, ws, 'r1', 'Çay al'), put(2, ws, 'r2', 'Şeker al')],
    })
    const body = syncResponseSchema.parse(reply.body)
    expect(body.touched.map((record) => [record.id, record.rev])).toEqual([
      ['r1', 1],
      ['r2', 2],
    ])
    const rows = t.db.all<{ id: string; data: string; rev: number; updated_by: string }>(
      'SELECT id, data, rev, updated_by FROM records ORDER BY rev',
    )
    expect(rows.map((row) => [row.id, JSON.parse(row.data).title, row.rev, row.updated_by])).toEqual([
      ['r1', 'Çay al', 1, ayse.user.id],
      ['r2', 'Şeker al', 2, ayse.user.id],
    ])
    expect(
      t.db.get<{ last_mutation_id: number }>('SELECT last_mutation_id FROM clients WHERE id = ?', 'telefon'),
    ).toEqual({
      last_mutation_id: 2,
    })
  })

  it('istek başına değişiklik sınırını aşan istek 400 validation alır', async () => {
    t = createTestServer()
    const ayse = await signUp(t)
    const mutations = Array.from({ length: SYNC_LIMITS.maxMutationsPerRequest + 1 }, (_, index) =>
      put(index + 1, ayse.personalWorkspaceId, `r${index}`, 'x'),
    )
    const reply = await ayse.client.post(API_PATHS.sync, {
      protocolVersion: PROTOCOL_VERSION,
      clientId: 'c',
      cursors: {},
      mutations,
    })
    expect(reply.status).toBe(400)
    expect(reply.body.error.code).toBe('validation')
  })

  it('eşitleme gövde sınırını aşan istek 413 payload_too_large alır; öteki uçların sınırı daha küçüktür', async () => {
    t = createTestServer()
    const ayse = await signUp(t)
    const huge = JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      clientId: 'c',
      cursors: {},
      mutations: [],
      ek: 'x'.repeat(9 * 1024 * 1024),
    })
    const reply = await ayse.client.send('POST', API_PATHS.sync, huge, { 'Content-Type': 'application/json' })
    expect(reply.status).toBe(413)
    expect(reply.body.error.code).toBe('payload_too_large')
    const big = await ayse.client.patch(API_PATHS.account, { name: 'x'.repeat(70 * 1024) })
    expect(big.status).toBe(413)
  })

  it('kullanıcı başına hız sınırı: dakikada 240 eşitleme, sonra 429 + Retry-After', async () => {
    t = createTestServer()
    const ayse = await signUp(t)
    const request = { protocolVersion: PROTOCOL_VERSION, clientId: 'c', cursors: {}, mutations: [] }
    // Deneme saati her okunuşta 1 ms ilerler; kova bu sürede biraz dolar. Bu yüzden ilk 429 tam 241. istekte
    // değil, 240 ile 260 arasında beklenir.
    let limited = await ayse.client.post(API_PATHS.sync, request)
    let sent = 1
    while (limited.status === 200 && sent < 300) {
      limited = await ayse.client.post(API_PATHS.sync, request)
      sent += 1
    }
    expect(sent).toBeGreaterThan(240)
    expect(sent).toBeLessThan(260)
    expect(limited.status).toBe(429)
    expect(limited.body.error.code).toBe('rate_limited')
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0)
    t.clock.advance(60_000)
    expect((await ayse.client.post(API_PATHS.sync, request)).status).toBe(200)
  })
})
