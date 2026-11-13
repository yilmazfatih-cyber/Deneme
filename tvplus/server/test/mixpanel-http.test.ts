/**
 * Veri kaynakları REST uçları gerçek bir dinleyici üzerinden: akışla gönderilen (parça parça, uzunluksuz) gövde,
 * gzip, deneme kipi, ikinci çalıştırmada yinelenenler, boyut sınırı, eşleme GET/PUT, sentetik üretim, kaynak silme,
 * erişim (anahtar / oturum + authURL), API çekimi (yerel sahte dışa aktarım sunucusu: kimlik başlığı, 429 bekleme,
 * gzip yanıt, parçalı aralık, kimlik hatası) ve bölge adresi seçimi.
 */
import { once } from 'node:events'
import { readFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import type { FastifyInstance } from 'fastify'
import { Agent, fetch, MockAgent } from 'undici'
import { afterEach, describe, expect, it } from 'vitest'
import { HEADERS } from '../../shared/constants'
import type { ImportReport, SourcesResponse } from '../../shared/intelligence'
import type { BootContext } from '../../shared/types'
import { mixpanelInternals } from '../src/services/mixpanel/plugin'
import { EXPORT_HOSTS, exportUrl, pullExport, validateRange, chunkRange } from '../src/services/mixpanel/pull'
import { createTestApp } from './helpers'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SAMPLE = readFileSync(join(ROOT, 'content', 'analytics', 'ornek-mixpanel.jsonl'))
const direct = new Agent()

const apps: FastifyInstance[] = []
const servers: Server[] = []
afterEach(async () => {
  while (apps.length) await apps.pop()!.close()
  while (servers.length) {
    const s = servers.pop()!
    s.closeAllConnections()
    await new Promise((r) => s.close(r))
  }
})

async function listen(overrides: Parameters<typeof createTestApp>[0] = {}) {
  const app = await createTestApp(overrides)
  apps.push(app)
  await app.listen({ port: 0, host: '127.0.0.1' })
  const { port } = app.server.address() as AddressInfo
  return { app, base: `http://127.0.0.1:${port}` }
}

/** Gövdeyi küçük parçalar ve aralarda bekleme ile, uzunluk bildirmeden gönderir. */
function slowBody(buf: Buffer, size = 700): Readable {
  return Readable.from(
    (async function* () {
      for (let i = 0; i < buf.length; i += size) {
        yield buf.subarray(i, i + size)
        await new Promise((r) => setTimeout(r, 1))
      }
    })(),
  )
}
async function post(base: string, path: string, body: Buffer | Readable, headers: Record<string, string> = {}) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-ndjson', ...headers },
    body,
    duplex: 'half',
    dispatcher: direct,
  })
  return {
    status: res.status,
    json: (await res.json()) as ImportReport & { error?: { code: string; message: string } },
  }
}
const IMPORT = '/api/studio/sources/mixpanel/import'

describe('içe aktarma ucu (gerçek dinleyici)', () => {
  it('akışla gelen gövde; ikinci çalıştırma yinelenen; gzip; deneme kipi', async () => {
    const { app, base } = await listen()
    const r1 = await post(base, IMPORT, slowBody(SAMPLE))
    expect(r1.status).toBe(200)
    expect(r1.json).toMatchObject({ source: 'MIXPANEL', lines: 116, accepted: 110, duplicates: 1, rejected: 3 })
    expect(r1.json.unknownTitles[0]).toEqual({ externalId: 'cnt_99999', count: 1 })

    const r2 = await post(base, IMPORT, slowBody(gzipSync(SAMPLE), 333), { 'content-type': 'application/gzip' })
    expect(r2.json).toMatchObject({ accepted: 0, duplicates: 111 })

    const dry = await post(base, `${IMPORT}?dryRun=1`, SAMPLE, { 'content-type': 'text/plain' })
    expect(dry.json).toMatchObject({ accepted: 0, duplicates: 111 })

    const src = (await (await fetch(`${base}/api/studio/sources`, { dispatcher: direct })).json()) as SourcesResponse
    const mp = src.sources.find((s) => s.source === 'MIXPANEL')!
    expect(mp).toMatchObject({ events: 110, active: true })
    // Son rapor gerçek içe aktarmanın raporudur (deneme kaydedilmez)
    expect(mp.lastImport).toMatchObject({ accepted: 0, duplicates: 111 })
    expect(src.mixpanel).toEqual({
      configured: false,
      region: 'us',
      mappedEvents: expect.arrayContaining(['Video Start', 'Video Stop']),
    })
    expect(app.services.viewing.facts().length).toBeGreaterThan(5)
  })

  it('boyut sınırı 413; boş gövde boş rapor', async () => {
    const { app, base } = await listen()
    mixpanelInternals(app).maxImportBytes = 4000
    const big = await post(base, IMPORT, slowBody(SAMPLE))
    expect(big.status).toBe(413)
    expect(big.json.error!.code).toBe('PAYLOAD_TOO_LARGE')
    const empty = await post(base, IMPORT, Buffer.alloc(0))
    expect(empty.status).toBe(200)
    expect(empty.json).toMatchObject({ lines: 0, accepted: 0 })
    expect(app.services.viewing.sources().every((s) => s.events === 0)).toBe(true)
  })
})

describe('eşleme, sentetik, silme', () => {
  it('gerçek izleyici sayısı eşiği geçince SENTETİK analiz dışı (realDataMinViewers: 3)', async () => {
    const app = await createTestApp({ realDataMinViewers: 3 })
    apps.push(app)
    await app.inject({
      method: 'POST',
      url: '/api/studio/sources/synthetic/generate',
      payload: { viewers: 20, days: 5, seed: 2 },
    })
    const line = (who: string, n: number) =>
      JSON.stringify({
        event: 'Video Start',
        properties: { time: 1_790_000_000 + n, distinct_id: who, $insert_id: `t${n}`, content_id: '80010001' },
      })
    const send = (lines: string[]) =>
      app.inject({ method: 'POST', url: IMPORT, payload: lines.join('\n'), headers: { 'content-type': 'text/plain' } })
    await send([line('a', 1), line('b', 2)])
    expect(app.services.viewing.activeSources()).toEqual(['MIXPANEL', 'SYNTHETIC'])
    await send([line('c', 3)])
    expect(app.services.viewing.activeSources()).toEqual(['MIXPANEL'])
    const src = (await app.inject({ method: 'GET', url: '/api/studio/sources' })).json<SourcesResponse>()
    expect(Object.fromEntries(src.sources.map((s) => [s.source, s.active]))).toEqual({
      TVPLUS: false,
      MIXPANEL: true,
      SYNTHETIC: false,
    })
  })

  it('eşleme GET/PUT: doğrulanır, sunucu deposuna yazılır, yeni olay adı kod değişmeden bağlanır', async () => {
    const app = await createTestApp()
    apps.push(app)
    const get = await app.inject({ method: 'GET', url: '/api/studio/sources/mixpanel/mapping' })
    expect(get.statusCode).toBe(200)
    expect(get.headers['x-tvplus-mapping-origin']).toBe('repo')
    const bad = await app.inject({
      method: 'PUT',
      url: '/api/studio/sources/mixpanel/mapping',
      payload: { version: 1, events: { X: 'OYNAT' } },
    })
    expect(bad.statusCode).toBe(400)
    expect(bad.json().error.code).toBe('INVALID_MAPPING')
    const m = get.json()
    m.events['Oynatma Başladı'] = 'PLAY_START'
    m.properties.contentId = ['icerik_no']
    const put = await app.inject({ method: 'PUT', url: '/api/studio/sources/mixpanel/mapping', payload: m })
    expect(put.statusCode).toBe(200)
    const get2 = await app.inject({ method: 'GET', url: '/api/studio/sources/mixpanel/mapping' })
    expect(get2.headers['x-tvplus-mapping-origin']).toBe('override')
    expect(get2.json().events['Oynatma Başladı']).toBe('PLAY_START')
    const line = JSON.stringify({
      event: 'Oynatma Başladı',
      properties: { time: 1_790_000_000, distinct_id: 'k1', $insert_id: 'a1', icerik_no: 'metropolis' },
    })
    const r = await app.inject({
      method: 'POST',
      url: IMPORT,
      payload: line,
      headers: { 'content-type': 'text/plain' },
    })
    expect(r.json()).toMatchObject({ accepted: 1, unknownTitles: [] })
    expect(app.services.viewing.facts()[0]!.titleId).toBe(80020005)
    const src = (await app.inject({ method: 'GET', url: '/api/studio/sources' })).json<SourcesResponse>()
    expect(src.mixpanel.mappedEvents).toContain('Oynatma Başladı')
  })

  it('sentetik üretim aynı içe aktarıcıdan geçer; gerçek veri eşik altında örnekle birlikte; kaynak silme', async () => {
    const app = await createTestApp()
    apps.push(app)
    const gen = await app.inject({
      method: 'POST',
      url: '/api/studio/sources/synthetic/generate',
      payload: { viewers: 40, days: 14, seed: 5 },
    })
    expect(gen.statusCode).toBe(200)
    const rep = gen.json<ImportReport>()
    expect(rep.source).toBe('SYNTHETIC')
    expect(rep.accepted).toBeGreaterThan(100)
    expect(rep.rejected).toBe(0)
    expect(Object.keys(rep.unmappedEvents).every((k) => k === 'App Open')).toBe(true)
    expect(app.services.viewing.activeSources()).toEqual(['SYNTHETIC'])
    // Yeniden üretim kaynağı yeniler (birikmez)
    const again = await app.inject({
      method: 'POST',
      url: '/api/studio/sources/synthetic/generate',
      payload: { viewers: 40, days: 14, seed: 5 },
    })
    expect(again.json<ImportReport>().accepted).toBe(rep.accepted)
    expect(app.services.viewing.sources().find((s) => s.source === 'SYNTHETIC')!.events).toBe(rep.accepted)

    await app.inject({ method: 'POST', url: IMPORT, payload: SAMPLE, headers: { 'content-type': 'text/plain' } })
    // Örnek dosyada birkaç gerçek izleyici var: varsayılan eşiğin (50) altında SENTETİK birlikte etkin kalır
    expect(app.services.viewing.activeSources()).toEqual(['MIXPANEL', 'SYNTHETIC'])
    const bad = await app.inject({
      method: 'POST',
      url: '/api/studio/sources/synthetic/generate',
      payload: { viewers: 0 },
    })
    expect(bad.statusCode).toBe(400)

    expect((await app.inject({ method: 'DELETE', url: '/api/studio/sources/yok' })).statusCode).toBe(404)
    const del = await app.inject({ method: 'DELETE', url: '/api/studio/sources/MIXPANEL' })
    expect(del.statusCode).toBe(204)
    expect(app.services.viewing.activeSources()).toEqual(['SYNTHETIC'])
  })
})

describe('açılışta sentetik örnek', () => {
  it('depo boş ve sampleViewing açıkken açılışı bekletmeden arka planda üretilir; sonraki açılışta üretilmez', async () => {
    const t0 = Date.now()
    const app = await createTestApp({ sampleViewing: true })
    apps.push(app)
    const readyMs = Date.now() - t0
    // Açılış döndüğünde örnek henüz yazılmamıştır (arka plan)
    expect(app.services.viewing.sources().find((s) => s.source === 'SYNTHETIC')!.events).toBe(0)
    const report = await mixpanelInternals(app).bootSample
    expect(report).toMatchObject({ source: 'SYNTHETIC', rejected: 0 })
    expect(report!.accepted).toBeGreaterThan(100_000)
    const st = app.services.viewing.sources().find((s) => s.source === 'SYNTHETIC')!
    expect(st.active).toBe(true)
    expect(st.viewers).toBeGreaterThan(1300)
    expect(st.lastImport!.accepted).toBe(report!.accepted)
    expect(readyMs).toBeLessThan(5000)
    // Aynı veri klasörüyle yeniden açılış: depo dolu → yeniden üretilmez, özetler aynı
    const before = app.services.viewing.titleTotals()
    const dataDir = app.config.dataDir
    await apps.pop()!.close()
    const app2 = await createTestApp({ sampleViewing: true, dataDir })
    apps.push(app2)
    expect(await mixpanelInternals(app2).bootSample).toBeNull()
    expect(app2.services.viewing.titleTotals()).toEqual(before)
  }, 60_000)
})

describe('erişim', () => {
  it('anahtarla oturumsuz yazma; oturumla gelen yazma authURL ister', async () => {
    const app = await createTestApp({ studioAccess: 'member', studioKey: 'betik-anahtari' })
    apps.push(app)
    const anon = await app.inject({ method: 'POST', url: IMPORT, payload: SAMPLE })
    expect(anon.statusCode).toBe(401)
    const keyed = await app.inject({
      method: 'POST',
      url: IMPORT,
      payload: SAMPLE,
      headers: { [HEADERS.STUDIO_KEY]: 'betik-anahtari', 'content-type': 'text/plain' },
    })
    expect(keyed.statusCode).toBe(200)

    const cookies: Record<string, string> = {}
    const take = (res: { cookies: { name: string; value: string }[] }) => {
      for (const c of res.cookies) cookies[c.name] = c.value
    }
    const login = await app.inject({ method: 'POST', url: '/api/login' })
    take(login)
    const sw = await app.inject({
      method: 'POST',
      url: '/api/profiles/switch',
      cookies,
      payload: { guid: login.json<BootContext>().profiles[0]!.guid },
    })
    take(sw)
    expect((await app.inject({ method: 'GET', url: '/api/studio/sources', cookies })).statusCode).toBe(200)
    const noCsrf = await app.inject({ method: 'DELETE', url: '/api/studio/sources/MIXPANEL', cookies })
    expect(noCsrf.statusCode).toBe(403)
    const ok = await app.inject({
      method: 'DELETE',
      url: '/api/studio/sources/MIXPANEL',
      cookies,
      headers: { [HEADERS.AUTH_URL]: sw.json<BootContext>().authURL! },
    })
    expect(ok.statusCode).toBe(204)
  })
})

describe('API çekimi', () => {
  const creds = {
    serviceAccountUsername: 'tvplus-sa.abc123.mp-service-account',
    serviceAccountSecret: 'cok-gizli-deger-77',
    projectId: '3141592',
    region: 'eu' as const,
  }

  it('kimlik bilgisi yoksa 501; geçersiz aralık 400', async () => {
    const app = await createTestApp()
    apps.push(app)
    const r = await app.inject({
      method: 'POST',
      url: '/api/studio/sources/mixpanel/pull',
      payload: { from: '2026-10-01', to: '2026-10-02' },
    })
    expect(r.statusCode).toBe(501)
    expect(r.json().error.code).toBe('MIXPANEL_NOT_CONFIGURED')
    const bad = await app.inject({
      method: 'POST',
      url: '/api/studio/sources/mixpanel/pull',
      payload: { from: '2026-10-05', to: '2026-10-01' },
    })
    expect(bad.statusCode).toBe(400)
    expect(validateRange('2026-02-30', '2026-03-01')).toBe('Geçersiz tarih.')
    expect(validateRange('2026-01-01', '2027-06-01')).toMatch(/en çok/)
    expect(chunkRange('2026-10-01', '2026-10-10', 7)).toEqual([
      { from: '2026-10-01', to: '2026-10-07' },
      { from: '2026-10-08', to: '2026-10-10' },
    ])
  })

  it('sahte dışa aktarım sunucusu: Basic kimlik, project_id, 429 sonrası bekleme, gzip yanıt, parçalı aralık', async () => {
    const seen: { url: string; auth: string | undefined }[] = []
    let calls = 0
    const server = createServer((req: IncomingMessage, res) => {
      calls++
      seen.push({ url: req.url ?? '', auth: req.headers.authorization })
      if (calls === 1) {
        res.writeHead(429, { 'retry-after': '2' })
        res.end('{"error":"rate limited"}')
        return
      }
      const from = new URL(req.url ?? '/', 'http://x').searchParams.get('from_date')
      const body = [
        {
          event: 'Video Start',
          properties: {
            time: Date.parse(`${from}T10:00:00Z`) / 1000,
            distinct_id: 'u-1',
            $insert_id: `s-${from}`,
            content_id: '80010001',
          },
        },
        {
          event: 'Video Stop',
          properties: {
            time: Date.parse(`${from}T10:10:00Z`) / 1000,
            distinct_id: 'u-1',
            $insert_id: `e-${from}`,
            content_id: '80010001',
            watched_seconds: 600,
          },
        },
      ]
        .map((x) => JSON.stringify(x))
        .join('\n')
      res.writeHead(200, { 'content-type': 'text/plain', 'content-encoding': 'gzip' })
      res.end(gzipSync(body))
    })
    servers.push(server)
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const { port } = server.address() as AddressInfo

    const app = await createTestApp({ mixpanel: creds })
    apps.push(app)
    const waits: number[] = []
    const internals = mixpanelInternals(app)
    internals.exportBaseUrl = `http://127.0.0.1:${port}`
    internals.dispatcher = direct
    internals.sleep = async (ms) => {
      waits.push(ms)
    }
    const r = await app.inject({
      method: 'POST',
      url: '/api/studio/sources/mixpanel/pull',
      payload: { from: '2026-10-01', to: '2026-10-10' },
    })
    expect(r.statusCode).toBe(200)
    expect(r.json()).toMatchObject({
      source: 'MIXPANEL',
      accepted: 4,
      duplicates: 0,
      from: '2026-10-01',
      to: '2026-10-10',
    })
    expect(waits).toEqual([2000])
    expect(seen).toHaveLength(3)
    const expected = `Basic ${Buffer.from(`${creds.serviceAccountUsername}:${creds.serviceAccountSecret}`).toString('base64')}`
    for (const s of seen) {
      expect(s.auth).toBe(expected)
      expect(s.url).toMatch(/^\/api\/2\.0\/export\?project_id=3141592&from_date=2026-10-0[18]&to_date=2026-10-(07|10)$/)
    }
    expect(r.body).not.toContain(creds.serviceAccountSecret)
    const src = (await app.inject({ method: 'GET', url: '/api/studio/sources' })).json<SourcesResponse>()
    expect(src.mixpanel).toMatchObject({ configured: true, region: 'eu' })
    expect(JSON.stringify(src)).not.toContain(creds.serviceAccountSecret)
    expect(JSON.stringify(src)).not.toContain(creds.serviceAccountUsername)
    // Aynı aralığı yeniden çekmek yinelenen üretir
    const again = await app.inject({
      method: 'POST',
      url: '/api/studio/sources/mixpanel/pull',
      payload: { from: '2026-10-01', to: '2026-10-10' },
    })
    expect(again.json()).toMatchObject({ accepted: 0, duplicates: 4 })
  })

  it('kimlik reddi ve sürekli 5xx anlaşılır hata döner; gizli değer hata metnine girmez', async () => {
    let mode: 401 | 503 = 401
    const server = createServer((_req, res) => {
      res.writeHead(mode)
      res.end(`hata: ${creds.serviceAccountSecret}`)
    })
    servers.push(server)
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const { port } = server.address() as AddressInfo
    const app = await createTestApp({ mixpanel: creds })
    apps.push(app)
    const internals = mixpanelInternals(app)
    internals.exportBaseUrl = `http://127.0.0.1:${port}`
    internals.dispatcher = direct
    const waits: number[] = []
    internals.sleep = async (ms) => {
      waits.push(ms)
    }
    const auth = await app.inject({
      method: 'POST',
      url: '/api/studio/sources/mixpanel/pull',
      payload: { from: '2026-10-01', to: '2026-10-01' },
    })
    expect(auth.statusCode).toBe(502)
    expect(auth.json().error.code).toBe('MIXPANEL_AUTH')
    expect(auth.body).not.toContain(creds.serviceAccountSecret)
    mode = 503
    const down = await app.inject({
      method: 'POST',
      url: '/api/studio/sources/mixpanel/pull',
      payload: { from: '2026-10-01', to: '2026-10-01' },
    })
    expect(down.statusCode).toBe(502)
    expect(down.json().error.code).toBe('MIXPANEL_UNAVAILABLE')
    expect(waits).toEqual([2000, 4000, 8000, 16000])
  })

  it('bölge adresi: us / eu / in; adres verilmezse bölgeye gidilir', async () => {
    expect(exportUrl(EXPORT_HOSTS.us, '1', '2026-10-01', '2026-10-02')).toBe(
      'https://data.mixpanel.com/api/2.0/export?project_id=1&from_date=2026-10-01&to_date=2026-10-02',
    )
    expect(EXPORT_HOSTS.eu).toBe('https://data-eu.mixpanel.com')
    expect(EXPORT_HOSTS.in).toBe('https://data-in.mixpanel.com')
    const mock = new MockAgent()
    mock.disableNetConnect()
    mock
      .get('https://data-in.mixpanel.com')
      .intercept({ path: (p) => p.startsWith('/api/2.0/export?') && p.includes('project_id=9'), method: 'GET' })
      .reply(200, '{"event":"x","properties":{}}\n')
    const chunks: Uint8Array[] = []
    for await (const c of pullExport({
      from: '2026-10-01',
      to: '2026-10-01',
      region: 'in',
      username: 'u',
      secret: 's',
      projectId: '9',
      dispatcher: mock,
      maxAttempts: 1,
    }))
      chunks.push(c)
    expect(Buffer.concat(chunks).toString()).toContain('"event":"x"')
    await mock.close()
  })
})
