/**
 * İletişim formu (POST /api/iletisim, herkese açık): site kökeninden JSON gönderim + e-posta (mail_outbox),
 * CORS ön isteği (izinli / izinsiz köken), başka siteden 403, bal küpü, JS kapalı düz form, hız sınırları,
 * kapalı özellik ve ayar kuralları. Gerçek siteyle uçtan uca: havuz/tarifler/site-iletisim-formu-api/dogrula.py.
 */
import { API_PATHS } from '@uygulama/shared'
import { afterEach, describe, expect, it } from 'vitest'
import { ConfigError, loadConfig } from '../../src/config.ts'
import { signUp, TestClient } from '../support/client.ts'
import { createTestServer, type TestServer } from '../support/harness.ts'

const SITE = 'https://site.ornek.com'
const ENV = { CONTACT_TO: 'Merhaba@Ornek.com', CONTACT_ORIGINS: SITE }
const FORM = {
  name: 'Ayşe <b>Kaya</b>',
  email: 'ayse@ornek.com',
  message: 'Fiyatlar hakkında bilgi almak istiyorum.',
  page: `${SITE}/iletisim/`,
  lang: 'tr',
}
/** Tarayıcının başka siteden gönderdiği isteğin başlıkları. */
const CROSS_SITE = { 'Sec-Fetch-Site': 'cross-site' }

let t: TestServer
afterEach(async () => {
  await t.close()
})

function site(options: { ip?: string } = {}): TestClient {
  return new TestClient(t, { origin: SITE, ...options })
}

describe('iletişim formu: gönderim', () => {
  it('site kökeninden JSON: 200 {ok}, çerezsiz CORS başlığı, yöneticiye e-posta (HTML kaçışlı)', async () => {
    t = createTestServer({ env: ENV })
    const reply = await site().post(API_PATHS.contact, FORM, CROSS_SITE)
    expect([reply.status, reply.body]).toEqual([200, { ok: true }])
    expect(reply.headers.get('access-control-allow-origin')).toBe(SITE)
    expect(reply.headers.get('access-control-allow-credentials')).toBeNull()
    await t.idle()
    const [mail] = t.outbox()
    expect(mail?.to_address).toBe('merhaba@ornek.com')
    expect(mail?.subject).toBe('Web sitesinden ileti: Ayşe <b>Kaya</b>')
    expect(mail?.text_body).toContain('Fiyatlar hakkında bilgi almak istiyorum.')
    expect(mail?.text_body).toContain('Yanıtlamak için gönderene yazın: ayse@ornek.com')
    expect(mail?.html_body).toContain('Ayşe &lt;b&gt;Kaya&lt;/b&gt;')
    expect(mail?.html_body).not.toContain('<b>Kaya')
  })

  it('CORS ön isteği: izinli kökene POST izni, başka kökene başlık yok', async () => {
    t = createTestServer({ env: ENV })
    const preflight = (origin: string) =>
      t.server.app.request(API_PATHS.contact, {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type',
        },
      })
    const allowed = await preflight(SITE)
    expect(allowed.status).toBe(204)
    expect(allowed.headers.get('access-control-allow-origin')).toBe(SITE)
    expect(allowed.headers.get('access-control-allow-methods')).toContain('POST')
    const other = await preflight('https://kotu.example')
    expect(other.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('başka bir siteden gelen gönderim 403 alır ve e-posta gitmez', async () => {
    t = createTestServer({ env: ENV })
    const evil = new TestClient(t, { origin: 'https://kotu.example' })
    const reply = await evil.post(API_PATHS.contact, FORM, CROSS_SITE)
    expect([reply.status, reply.body.error.code]).toEqual([403, 'forbidden'])
    await t.idle()
    expect(t.outbox()).toEqual([])
  })

  it('bal küpü doluysa başarılı görünür ama e-posta gitmez', async () => {
    t = createTestServer({ env: ENV })
    const reply = await site().post(API_PATHS.contact, { ...FORM, _gotcha: 'https://spam.example' }, CROSS_SITE)
    expect([reply.status, reply.body]).toEqual([200, { ok: true }])
    await t.idle()
    expect(t.outbox()).toEqual([])
  })

  it('JavaScript kapalı tarayıcı: düz form gönderimi teşekkür sayfası döndürür ve e-posta gider', async () => {
    t = createTestServer({ env: ENV })
    const body = new URLSearchParams({ name: 'Ali', email: 'ali@ornek.com', message: 'Merhaba, bir sorum var.' })
    const reply = await site().send('POST', API_PATHS.contact, body.toString(), {
      ...CROSS_SITE,
      'Content-Type': 'application/x-www-form-urlencoded',
    })
    expect(reply.status).toBe(200)
    expect(reply.headers.get('content-type')).toContain('text/html')
    expect(String(reply.body)).toContain('İletiniz alındı')
    expect(String(reply.body)).toContain(`href="${SITE}"`)
    await t.idle()
    expect(t.outbox()).toHaveLength(1)
  })

  it('doğrulama: kısa ileti ve geçersiz e-posta alan yoluyla 400', async () => {
    t = createTestServer({ env: ENV })
    const reply = await site().post(API_PATHS.contact, { ...FORM, message: 'kısa', email: 'x' }, CROSS_SITE)
    expect(reply.status).toBe(400)
    expect(reply.body.error.details.map((d: { path: string }) => d.path).sort()).toEqual(['email', 'message'])
  })

  it('CONTACT_TO yoksa özellik kapalıdır (404); CSRF muafiyeti öteki uçlara sızmaz', async () => {
    t = createTestServer()
    expect((await site().post(API_PATHS.contact, FORM, CROSS_SITE)).status).toBe(404)
    const ayse = await signUp(t)
    const cross = await ayse.client.send('POST', API_PATHS.workspaces, { name: 'X' }, { Origin: SITE, ...CROSS_SITE })
    expect(cross.status).toBe(403)
  })

  it('genel CORS (ALLOWED_ORIGINS) iletişim ucuna çerez izni eklemez', async () => {
    t = createTestServer({ env: { ...ENV, ALLOWED_ORIGINS: 'https://uygulama.ornek.com' } })
    const reply = await site().post(API_PATHS.contact, FORM, CROSS_SITE)
    expect(reply.status).toBe(200)
    expect(reply.headers.get('access-control-allow-credentials')).toBeNull()
  })
})

describe('iletişim formu: hız sınırları', () => {
  it('IP başına saatte 5 ileti; 6. ileti 429 + Retry-After; başka IP etkilenmez', async () => {
    t = createTestServer({ env: { ...ENV, TRUST_PROXY: '1' } })
    for (let i = 0; i < 5; i += 1)
      expect((await site({ ip: '203.0.113.7' }).post(API_PATHS.contact, FORM)).status).toBe(200)
    const limited = await site({ ip: '203.0.113.7' }).post(API_PATHS.contact, FORM)
    expect(limited.status).toBe(429)
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0)
    expect((await site({ ip: '198.51.100.9' }).post(API_PATHS.contact, FORM)).status).toBe(200)
  })

  it("bütün IP'ler toplamı saatte 100 ileti (çok IP'li saldırı e-posta kotasını bitiremez)", async () => {
    t = createTestServer({ env: { ...ENV, TRUST_PROXY: '1' } })
    for (let i = 0; i < 100; i += 1) {
      const reply = await site({ ip: `198.18.${Math.floor(i / 200)}.${i % 200}` }).post(API_PATHS.contact, FORM)
      expect(reply.status).toBe(200)
    }
    expect((await site({ ip: '192.0.2.1' }).post(API_PATHS.contact, FORM)).status).toBe(429)
  })
})

describe('iletişim formu: ayar', () => {
  const problems = (env: Record<string, string>) => {
    try {
      loadConfig(env, '/uygulama/api')
      return []
    } catch (error) {
      if (error instanceof ConfigError) return error.problems.map((problem) => problem.split(':')[0])
      throw error
    }
  }

  it('geçersiz köken, * ve geçersiz e-posta reddedilir; kökenler alıcısız verilemez', () => {
    expect(problems({ CONTACT_TO: 'siz@ornek.com', CONTACT_ORIGINS: '*' })).toEqual(['CONTACT_ORIGINS'])
    expect(problems({ CONTACT_TO: 'siz@ornek.com', CONTACT_ORIGINS: 'https://ornek.com/' })).toEqual([
      'CONTACT_ORIGINS',
    ])
    expect(problems({ CONTACT_TO: 'gecersiz' })).toEqual(['CONTACT_TO'])
    expect(problems({ CONTACT_ORIGINS: SITE })).toEqual(['CONTACT_TO'])
  })

  it('varsayılan kapalı; verilince e-posta küçük harfe çevrilir, kökenler listelenir', () => {
    expect(loadConfig({}, '/x').contact).toBeNull()
    expect(loadConfig({ ...ENV, CONTACT_ORIGINS: `${SITE}, http://localhost:4411` }, '/x').contact).toEqual({
      to: 'merhaba@ornek.com',
      origins: [SITE, 'http://localhost:4411'],
    })
  })
})
