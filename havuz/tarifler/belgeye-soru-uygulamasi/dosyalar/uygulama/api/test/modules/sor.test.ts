/**
 * Belgeye soru (POST /api/sor): yz sunucusu sahte `fetch` ile taklit edilir (gerçek yz'yle uçtan uca deneme:
 * havuz/tarifler/belgeye-soru-uygulamasi/dogrula.py). Mutlu yol + yetki + doğrulama + yz hataları + sınırlar + ayar.
 */
import { API_PATHS, askResponseSchema } from '@uygulama/shared'
import { afterEach, describe, expect, it } from 'vitest'
import { ConfigError, loadConfig } from '../../src/config.ts'
import { EXCERPT_MAX } from '../../src/modules/sor/service.ts'
import { signUp, TestClient } from '../support/client.ts'
import { createTestServer, type TestServer } from '../support/harness.ts'

const YZ_URL = 'http://127.0.0.1:8420'
const YZ_KEY = 'deneme-anahtari-0123456789'
const AI_ENV = { YZ_URL: `${YZ_URL}/`, YZ_API_KEY: YZ_KEY }

/** yz'nin `/api/sor` yanıtının gerçek biçimi (yz/sunucu/uygulama.py → sor). */
const YZ_ANSWER = {
  yanit: 'Ürünü teslimden sonraki 14 gün içinde iade edebilirsiniz. [1]',
  atiflar: [1],
  belgede_yok: false,
  uyarilar: [],
  dayanaksiz: [],
  kaynaklar: [{ numara: 1, ad: 'iade.md › İade politikası', metin: 'Ürünü teslimden sonraki 14 gün içinde iade…' }],
}

interface Call {
  url: string
  init: RequestInit
}

function fakeYz(reply: (call: Call) => Response | Promise<Response>): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = []
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const call = { url: input instanceof Request ? input.url : input.toString(), init: init ?? {} }
    calls.push(call)
    return reply(call)
  }) as typeof fetch
  return { fetch: fetchFn, calls }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

let t: TestServer
afterEach(async () => {
  await t.close()
})

describe('belgeye soru: mutlu yol', () => {
  it("soruyu anahtarla yz'ye iletir, yanıtı sözleşmeye çevirir", async () => {
    const yz = fakeYz(() => json(YZ_ANSWER))
    t = createTestServer({ env: AI_ENV, fetch: yz.fetch })
    const ayse = await signUp(t)
    const reply = await ayse.client.post(API_PATHS.ask, { question: '  İade süresi kaç gün?  ' })
    expect(reply.status).toBe(200)
    expect(askResponseSchema.parse(reply.body)).toEqual({
      answer: YZ_ANSWER.yanit,
      notInDocuments: false,
      citations: [1],
      sources: [{ number: 1, title: 'iade.md › İade politikası', excerpt: YZ_ANSWER.kaynaklar[0]?.metin }],
      warnings: [],
    })
    expect(yz.calls).toHaveLength(1)
    expect(yz.calls[0]?.url).toBe(`${YZ_URL}/api/sor`)
    const headers = new Headers(yz.calls[0]?.init.headers)
    expect(headers.get('authorization')).toBe(`Bearer ${YZ_KEY}`)
    expect(JSON.parse(yz.calls[0]?.init.body as string)).toEqual({ soru: 'İade süresi kaç gün?' })
  })

  it('belgede yok, dayanaksız ifade uyarısı ve uzun alıntı kırpılır', async () => {
    const long = 'a'.repeat(EXCERPT_MAX + 50)
    const answer = {
      ...YZ_ANSWER,
      belgede_yok: true,
      dayanaksiz: ['2025'],
      kaynaklar: [{ numara: 1, ad: 'x', metin: long }],
    }
    t = createTestServer({ env: AI_ENV, fetch: fakeYz(() => json(answer)).fetch })
    const ayse = await signUp(t)
    const body = askResponseSchema.parse((await ayse.client.post(API_PATHS.ask, { question: 'Ne zaman?' })).body)
    expect(body.notInDocuments).toBe(true)
    expect(body.warnings).toEqual(['Kaynaklarda geçmeyen ifadeler var, doğruluğunu denetleyin: 2025'])
    expect(body.sources[0]?.excerpt).toHaveLength(EXCERPT_MAX + 1)
  })
})

describe('belgeye soru: yetki ve doğrulama', () => {
  it("oturumsuz 401; kısa/uzun soru 400 (alan: question); yz'ye istek gitmez", async () => {
    const yz = fakeYz(() => json(YZ_ANSWER))
    t = createTestServer({ env: AI_ENV, fetch: yz.fetch })
    expect((await new TestClient(t).post(API_PATHS.ask, { question: 'Merhaba?' })).status).toBe(401)
    const ayse = await signUp(t)
    const short = await ayse.client.post(API_PATHS.ask, { question: ' a ' })
    expect(short.status).toBe(400)
    expect(short.body.error.details).toEqual([{ path: 'question', message: 'Soru en az 3 karakter olmalı.' }])
    expect((await ayse.client.post(API_PATHS.ask, { question: 'x'.repeat(1001) })).status).toBe(400)
    expect(yz.calls).toHaveLength(0)
  })

  it('YZ_URL yoksa özellik kapalıdır (404, açıklayıcı ileti)', async () => {
    t = createTestServer()
    const ayse = await signUp(t)
    const reply = await ayse.client.post(API_PATHS.ask, { question: 'İade süresi?' })
    expect([reply.status, reply.body.error.message]).toEqual([404, 'Belgeye soru özelliği bu sunucuda açık değil.'])
  })
})

describe('belgeye soru: yz hataları kullanıcıya suçlamayan iletiyle döner, ayrıntı günlükte', () => {
  it('bağlantı yok, 401 (anahtar uyuşmuyor), bozuk yanıt', async () => {
    let mode: 'down' | 'denied' | 'broken' = 'down'
    const yz = fakeYz(() => {
      if (mode === 'down') throw new TypeError('fetch failed')
      if (mode === 'denied') return json({ detail: 'API anahtarı eksik ya da yanlış.' }, 401)
      return json({ yanit: 42 })
    })
    t = createTestServer({ env: AI_ENV, fetch: yz.fetch })
    const ayse = await signUp(t)
    const ask = () => ayse.client.post(API_PATHS.ask, { question: 'İade süresi?' })
    const down = await ask()
    expect([down.status, down.body.error.message]).toEqual([
      500,
      'Yapay zekâ hizmetine şu an ulaşılamıyor. Biraz sonra yeniden deneyin.',
    ])
    mode = 'denied'
    expect((await ask()).body.error.message).toContain('ulaşılamıyor')
    mode = 'broken'
    expect((await ask()).body.error.message).toBe(
      'Yapay zekâ hizmetinden beklenmeyen bir yanıt geldi. Yöneticiye bildirin.',
    )
    const log = t.logLines.join('\n')
    expect(log).toContain('yz sunucusuna ulaşılamadı')
    expect(log).toContain('YZ_SUNUCU_ANAHTARI')
    expect(log).not.toContain(YZ_KEY)
    expect(log).not.toContain('İade süresi')
  })

  it('zaman aşımı ayrı iletiyle döner', async () => {
    const hang = fakeYz(
      ({ init }) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason as Error))
        }),
    )
    t = createTestServer({ env: AI_ENV, fetch: hang.fetch })
    const ai = t.config.ai
    if (!ai) throw new Error('ai ayarı yok')
    await t.close()
    t = createTestServer({ env: AI_ENV, fetch: hang.fetch, config: { ai: { ...ai, timeoutMs: 30 } } })
    const ayse = await signUp(t)
    const reply = await ayse.client.post(API_PATHS.ask, { question: 'İade süresi?' })
    expect([reply.status, reply.body.error.message]).toEqual([
      500,
      'Yanıt çok uzun sürdü. Soruyu kısaltıp yeniden deneyin.',
    ])
  })
})

describe('belgeye soru: sınırlar', () => {
  it('kullanıcı başına 10 dakikada 20 soru; 21. soru 429 + Retry-After', async () => {
    t = createTestServer({ env: AI_ENV, fetch: fakeYz(() => json(YZ_ANSWER)).fetch })
    const ayse = await signUp(t)
    for (let i = 0; i < 20; i += 1)
      expect((await ayse.client.post(API_PATHS.ask, { question: `Soru ${i}?` })).status).toBe(200)
    const limited = await ayse.client.post(API_PATHS.ask, { question: 'Bir tane daha?' })
    expect(limited.status).toBe(429)
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0)
    const other = await signUp(t)
    expect((await other.client.post(API_PATHS.ask, { question: 'Benimki?' })).status).toBe(200)
  })

  it('aynı anda en çok maxConcurrent soru: fazlası 429 (model sunucusu boğulmasın)', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const slow = fakeYz(async () => {
      await gate
      return json(YZ_ANSWER)
    })
    t = createTestServer({ env: AI_ENV, fetch: slow.fetch })
    const ai = t.config.ai
    if (!ai) throw new Error('ai ayarı yok')
    await t.close()
    t = createTestServer({ env: AI_ENV, fetch: slow.fetch, config: { ai: { ...ai, maxConcurrent: 1 } } })
    const ayse = await signUp(t)
    const first = ayse.client.post(API_PATHS.ask, { question: 'Birinci?' })
    await new Promise((resolve) => setTimeout(resolve, 20))
    const second = await ayse.client.post(API_PATHS.ask, { question: 'İkinci?' })
    expect([second.status, second.body.error.message]).toEqual([
      429,
      'Şu an çok soru soruluyor. Birkaç saniye sonra yeniden deneyin.',
    ])
    release()
    expect((await first).status).toBe(200)
  })
})

describe('belgeye soru: ayar (YZ_URL, YZ_API_KEY, YZ_TIMEOUT_SECONDS)', () => {
  const problems = (env: Record<string, string>) => {
    try {
      loadConfig(env, '/uygulama/api')
      return []
    } catch (error) {
      if (error instanceof ConfigError) return error.problems.map((problem) => problem.split(':')[0])
      throw error
    }
  }

  it('anahtarsız adres, adressiz anahtar, kısa anahtar ve üretimde düz http reddedilir', () => {
    expect(problems({ YZ_URL: YZ_URL })).toEqual(['YZ_API_KEY'])
    expect(problems({ YZ_API_KEY: YZ_KEY })).toEqual(['YZ_URL'])
    expect(problems({ YZ_URL: YZ_URL, YZ_API_KEY: 'kisa' })).toEqual(['YZ_API_KEY'])
    const production = { NODE_ENV: 'production', APP_URL: 'https://ornek.com', YZ_API_KEY: YZ_KEY }
    expect(problems({ ...production, YZ_URL: 'http://10.0.0.5:8420' })).toEqual(['YZ_URL'])
    expect(problems({ ...production, YZ_URL: YZ_URL })).toEqual([])
    expect(problems({ YZ_URL: YZ_URL, YZ_API_KEY: YZ_KEY, YZ_TIMEOUT_SECONDS: '2' })).toEqual(['YZ_TIMEOUT_SECONDS'])
  })

  it('varsayılan kapalı; verilince adresin sonundaki / atılır, süre saniyeden milisaniyeye', () => {
    expect(loadConfig({}, '/x').ai).toBeNull()
    expect(loadConfig({ ...AI_ENV, YZ_TIMEOUT_SECONDS: '90' }, '/x').ai).toEqual({
      url: YZ_URL,
      apiKey: YZ_KEY,
      timeoutMs: 90_000,
      maxConcurrent: 2,
    })
  })
})
