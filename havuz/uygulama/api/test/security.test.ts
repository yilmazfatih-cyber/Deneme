/**
 * Güvenlik testleri: her koruma için en az bir "saldırgan denedi, olmadı" senaryosu.
 * Yeni bir yetki kuralı ya da koruma eklediğinizde buraya olumsuz testini yazın (docs/GUVENLIK.md tablosuyla eş).
 */
import { API_PATHS, PROTOCOL_VERSION } from '@uygulama/shared'
import { afterEach, describe, expect, it } from 'vitest'
import { API_CSP, WEB_CSP } from '../src/http/securityHeaders.ts'
import { GOOD_PASSWORD, signUp, TestClient, uniqueEmail } from './support/client.ts'
import { createTestServer, type TestServer } from './support/harness.ts'
import { addMember, createShared } from './support/workspaces.ts'

let t: TestServer
afterEach(async () => {
  await t.close()
})

describe('oturum çerezi', () => {
  it('geliştirmede: sid; HttpOnly; SameSite=Lax; Path=/ (Secure yok)', async () => {
    t = createTestServer()
    const reply = await new TestClient(t).post(API_PATHS.register, {
      email: uniqueEmail(),
      password: GOOD_PASSWORD,
      name: 'A',
    })
    const cookie = reply.headers.getSetCookie()[0] ?? ''
    expect(cookie).toMatch(/^sid=/)
    expect(cookie).not.toContain('Secure')
  })

  it('üretimde: __Host-sid; Secure; HttpOnly; SameSite=Lax; Path=/; Domain YOK; düz "sid" çerezi kabul edilmez', async () => {
    t = createTestServer({ env: { NODE_ENV: 'production', APP_URL: 'https://ornek.com' } })
    const client = new TestClient(t, { origin: 'https://ornek.com' })
    const reply = await client.post(API_PATHS.register, { email: uniqueEmail(), password: GOOD_PASSWORD, name: 'A' })
    expect(reply.status).toBe(201)
    const cookie = reply.headers.getSetCookie()[0] ?? ''
    expect(cookie).toMatch(/^__Host-sid=[A-Za-z0-9_-]{43};/)
    for (const flag of ['Secure', 'HttpOnly', 'SameSite=Lax', 'Path=/']) expect(cookie).toContain(flag)
    expect(cookie).not.toMatch(/Domain=/i)
    expect((await client.get(API_PATHS.me)).status).toBe(200)
    const value = cookie.split(';')[0]?.split('=')[1] ?? ''
    expect((await new TestClient(t).get(API_PATHS.me, { Cookie: `sid=${value}` })).status).toBe(401)
  })
})

describe('CSRF', () => {
  it('çerezli değiştirici istek başka kökenden gelirse 403; kendi kökeni, APP_URL ve başlıksız istemci geçer', async () => {
    t = createTestServer()
    const ayse = await signUp(t)
    const cookie = { Cookie: ayse.client.cookie ?? '' }
    const bare = new TestClient(t, { origin: null })
    const attempt = (headers: Record<string, string>) =>
      bare.post(API_PATHS.workspaces, { name: 'X' }, { ...cookie, ...headers })

    const evil = await attempt({ Origin: 'https://kotu.example' })
    expect(evil.status).toBe(403)
    expect(evil.body.error.message).toContain('başka bir siteden')
    expect((await attempt({ 'Sec-Fetch-Site': 'cross-site', Origin: 'https://kotu.example' })).status).toBe(403)
    expect((await attempt({ 'Sec-Fetch-Site': 'same-site', Origin: 'https://alt.localhost' })).status).toBe(403)
    expect((await attempt({ Origin: 'null' })).status).toBe(403)

    expect((await attempt({ 'Sec-Fetch-Site': 'same-origin' })).status).toBe(201)
    expect((await attempt({ Origin: 'http://localhost:5310' })).status).toBe(201) // APP_URL
    expect((await attempt({ Origin: 'http://localhost' })).status).toBe(201) // isteğin kendi kökeni
    expect((await attempt({})).status).toBe(201) // tarayıcı değil (curl)
  })

  it('başka kökenden giriş (login CSRF) de engellenir; Bearer istekleri muaftır', async () => {
    t = createTestServer()
    const { email } = await signUp(t)
    const bare = new TestClient(t, { origin: 'https://kotu.example' })
    expect((await bare.post(API_PATHS.login, { email, password: GOOD_PASSWORD })).status).toBe(403)
    const tokenClient = new TestClient(t, { origin: null })
    const login = await tokenClient.post(
      API_PATHS.login,
      { email, password: GOOD_PASSWORD },
      { 'X-Auth-Mode': 'token' },
    )
    const viaBearer = await bare.post(
      API_PATHS.workspaces,
      { name: 'Y' },
      { Authorization: `Bearer ${login.body.token}` },
    )
    expect(viaBearer.status).toBe(201)
  })

  it('ALLOWED_ORIGINS listesindeki köken kabul edilir', async () => {
    t = createTestServer({ env: { ALLOWED_ORIGINS: 'https://mobil.ornek.com' } })
    const ayse = await signUp(t)
    const reply = await ayse.client.post(API_PATHS.workspaces, { name: 'Z' }, { Origin: 'https://mobil.ornek.com' })
    expect(reply.status).toBe(201)
  })

  it('JSON olmayan gövde (HTML formu gibi) reddedilir', async () => {
    t = createTestServer()
    const ayse = await signUp(t)
    const form = await ayse.client.send('POST', API_PATHS.workspaces, 'name=X', {
      'Content-Type': 'application/x-www-form-urlencoded',
    })
    expect(form.status).toBe(400)
  })
})

describe('CORS', () => {
  it('varsayılan kapalı: CORS başlığı yok', async () => {
    t = createTestServer()
    const reply = await new TestClient(t, { origin: 'https://baska.example' }).get(API_PATHS.health)
    expect(reply.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('izinli kökene ACAO + kimlik bilgisi; izinsize hiçbir şey', async () => {
    t = createTestServer({ env: { ALLOWED_ORIGINS: 'https://mobil.ornek.com' } })
    const preflight = await t.server.app.request(API_PATHS.sync, {
      method: 'OPTIONS',
      headers: { Origin: 'https://mobil.ornek.com', 'Access-Control-Request-Method': 'POST' },
    })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-origin')).toBe('https://mobil.ornek.com')
    expect(preflight.headers.get('access-control-allow-credentials')).toBe('true')
    expect(preflight.headers.get('access-control-allow-headers')).toContain('Authorization')
    const other = await new TestClient(t, { origin: 'https://kotu.example' }).get(API_PATHS.health)
    expect(other.headers.get('access-control-allow-origin')).toBeNull()
  })
})

describe('hesap varlığı sızıntısı', () => {
  it('şifremi unuttum: kayıtlı ve kayıtsız e-posta aynı yanıtı alır; yalnız kayıtlıya e-posta gider', async () => {
    t = createTestServer()
    const { email } = await signUp(t)
    const known = await new TestClient(t).post(API_PATHS.forgotPassword, { email })
    const unknown = await new TestClient(t).post(API_PATHS.forgotPassword, { email: 'yok@ornek.com' })
    expect([known.status, known.body]).toEqual([unknown.status, unknown.body])
    await t.idle()
    expect(t.outbox().map((mail) => mail.to_address)).toEqual([email])
  })

  it('kapatılmış hesaba sıfırlama e-postası gitmez ama yanıt aynıdır', async () => {
    t = createTestServer()
    const { email, user } = await signUp(t)
    t.db.run('UPDATE users SET disabled = 1 WHERE id = ?', user.id)
    const reply = await new TestClient(t).post(API_PATHS.forgotPassword, { email })
    expect(reply.body).toEqual({ ok: true })
    await t.idle()
    expect(t.outbox()).toEqual([])
  })
})

describe('hız sınırı', () => {
  it('aynı IP + hesap için 10 giriş denemesi, sonra 429 ve Retry-After; süre dolunca yeniden denenebilir', async () => {
    t = createTestServer({ env: { TRUST_PROXY: '1' } })
    const { email } = await signUp(t, { options: { ip: '203.0.113.9' } })
    const attacker = new TestClient(t, { ip: '198.51.100.7' })
    for (let index = 0; index < 10; index++) {
      expect((await attacker.post(API_PATHS.login, { email, password: `yanlis-${index}-sifre` })).status).toBe(401)
    }
    const limited = await attacker.post(API_PATHS.login, { email, password: GOOD_PASSWORD })
    expect(limited.status).toBe(429)
    expect(limited.body.error.code).toBe('rate_limited')
    const retryAfter = Number(limited.headers.get('retry-after'))
    expect(retryAfter).toBeGreaterThan(0)
    expect(limited.body.error.details).toEqual({ retryAfter })
    // Başka IP'deki gerçek kullanıcı etkilenmez.
    expect(
      (await new TestClient(t, { ip: '203.0.113.9' }).post(API_PATHS.login, { email, password: GOOD_PASSWORD })).status,
    ).toBe(200)
    t.clock.advance(retryAfter * 1000)
    expect((await attacker.post(API_PATHS.login, { email, password: GOOD_PASSWORD })).status).toBe(200)
  })

  it('kayıt IP başına sınırlıdır (saatte 10)', async () => {
    t = createTestServer({ env: { TRUST_PROXY: '1' } })
    const client = new TestClient(t, { ip: '198.51.100.8' })
    const statuses: number[] = []
    for (let index = 0; index < 11; index++) {
      statuses.push(
        (await client.post(API_PATHS.register, { email: uniqueEmail(), password: GOOD_PASSWORD, name: 'A' })).status,
      )
    }
    expect(statuses.slice(0, 10).every((status) => status === 201)).toBe(true)
    expect(statuses[10]).toBe(429)
  })

  it('şifremi unuttum aynı e-posta için saatte 3 kez (kutuyu doldurmayı önler)', async () => {
    t = createTestServer({ env: { TRUST_PROXY: '1' } })
    const { email } = await signUp(t)
    const statuses = []
    for (let index = 0; index < 4; index++) {
      statuses.push(
        (await new TestClient(t, { ip: `198.51.100.${20 + index}` }).post(API_PATHS.forgotPassword, { email })).status,
      )
    }
    expect(statuses).toEqual([200, 200, 200, 429])
  })

  it('TRUST_PROXY kapalıyken X-Forwarded-For yok sayılır (uydurma başlıkla sınır atlatılamaz)', async () => {
    t = createTestServer()
    const { email } = await signUp(t)
    for (let index = 0; index < 10; index++) {
      await new TestClient(t, { ip: `10.0.0.${index}` }).post(API_PATHS.login, { email, password: 'yanlis-sifre-xx' })
    }
    const limited = await new TestClient(t, { ip: '10.0.0.99' }).post(API_PATHS.login, {
      email,
      password: GOOD_PASSWORD,
    })
    expect(limited.status).toBe(429)
  })

  it('RATE_LIMIT=off (yalnız geliştirme/test) sınırı kapatır', async () => {
    t = createTestServer({ env: { RATE_LIMIT: 'off' } })
    const { email } = await signUp(t)
    for (let index = 0; index < 15; index++) {
      expect((await new TestClient(t).post(API_PATHS.login, { email, password: 'yanlis-sifre-xx' })).status).toBe(401)
    }
  })
})

describe('oturum iptali ve kapalı hesap', () => {
  it('şifre sıfırlanınca bütün oturumlar (Bearer dahil) geçersizdir', async () => {
    t = createTestServer()
    const { email, client } = await signUp(t)
    const tokenClient = new TestClient(t, { origin: null })
    const login = await tokenClient.post(
      API_PATHS.login,
      { email, password: GOOD_PASSWORD },
      { 'X-Auth-Mode': 'token' },
    )
    tokenClient.token = login.body.token as string
    await new TestClient(t).post(API_PATHS.forgotPassword, { email })
    await t.idle()
    const link = /token=([\w-]+)/.exec(t.outbox().at(-1)?.text_body ?? '')?.[1] ?? ''
    await new TestClient(t).post(API_PATHS.resetPassword, { token: link, newPassword: 'tamamen-yeni-sifre-31' })
    expect((await tokenClient.get(API_PATHS.me)).status).toBe(401)
    expect((await client.get(API_PATHS.me)).status).toBe(401)
  })

  it('oturumu açıkken kapatılan hesap 403 account_disabled alır (çerez silinir)', async () => {
    t = createTestServer()
    const { client, user } = await signUp(t)
    t.db.run('UPDATE users SET disabled = 1 WHERE id = ?', user.id)
    const reply = await client.get(API_PATHS.me)
    expect(reply.status).toBe(403)
    expect(reply.body.error.code).toBe('account_disabled')
  })
})

describe('başkasının alanına erişim', () => {
  it('üye olmayan hiçbir uçtan alanı göremez ve değiştiremez; eşitlemesi reddedilir, kayıt dönmez', async () => {
    t = createTestServer()
    const ayse = await signUp(t)
    const mallory = await signUp(t)
    const ws = await createShared(ayse, 'Gizli')
    await ayse.client.post(API_PATHS.sync, {
      protocolVersion: PROTOCOL_VERSION,
      clientId: 'ayse',
      cursors: {},
      mutations: [
        {
          mid: 1,
          workspaceId: ws,
          collection: 'tasks',
          recordId: 'gizli',
          at: '2026-11-16T10:00:00.000Z',
          op: 'put',
          data: { title: 'Gizli plan' },
        },
      ],
    })
    const attempts = [
      await mallory.client.get(API_PATHS.members(ws)),
      await mallory.client.patch(API_PATHS.workspace(ws), { name: 'Benim' }),
      await mallory.client.delete(API_PATHS.workspace(ws)),
      await mallory.client.patch(API_PATHS.member(ws, ayse.user.id), { role: 'viewer' }),
      await mallory.client.delete(API_PATHS.member(ws, ayse.user.id)),
      await mallory.client.post(API_PATHS.invites(ws), { role: 'editor' }),
    ]
    expect(attempts.map((reply) => reply.status)).toEqual([404, 404, 404, 404, 404, 404])
    const sync = await mallory.client.post(API_PATHS.sync, {
      protocolVersion: PROTOCOL_VERSION,
      clientId: 'mallory',
      cursors: { [ws]: 0 },
      mutations: [
        {
          mid: 1,
          workspaceId: ws,
          collection: 'tasks',
          recordId: 'gizli',
          at: '2026-11-16T10:00:00.000Z',
          op: 'patch',
          data: { title: 'Ele geçti' },
        },
      ],
    })
    expect(sync.body.rejected).toEqual([expect.objectContaining({ code: 'forbidden' })])
    expect(sync.body.changes[ws]).toBeUndefined()
    expect(JSON.stringify(sync.body)).not.toContain('Gizli plan')
  })

  it('izleyici yazamaz; çıkarılan üye artık okuyamaz', async () => {
    t = createTestServer()
    const ayse = await signUp(t)
    const burak = await signUp(t)
    const ws = await createShared(ayse)
    await addMember(ayse, burak, ws, 'viewer')
    const write = await burak.client.post(API_PATHS.sync, {
      protocolVersion: PROTOCOL_VERSION,
      clientId: 'burak',
      cursors: {},
      mutations: [
        {
          mid: 1,
          workspaceId: ws,
          collection: 'tasks',
          recordId: 'x',
          at: '2026-11-16T10:00:00.000Z',
          op: 'put',
          data: { title: 'İzleyici yazdı' },
        },
      ],
    })
    expect(write.body.rejected[0].code).toBe('forbidden')
    await ayse.client.delete(API_PATHS.member(ws, burak.user.id))
    const read = await burak.client.post(API_PATHS.sync, {
      protocolVersion: PROTOCOL_VERSION,
      clientId: 'burak',
      cursors: { [ws]: 0 },
      mutations: [],
    })
    expect(read.body.workspaces.map((workspace: { id: string }) => workspace.id)).not.toContain(ws)
  })
})

describe('günlük ve başlıklar', () => {
  it('günlükte parola, belirteç, çerez ya da e-posta geçmez', async () => {
    t = createTestServer()
    const { email, client } = await signUp(t, { email: 'gizli.kisi@ornek.com' })
    await new TestClient(t).post(API_PATHS.login, { email, password: 'yanlis-sifre-123' })
    await new TestClient(t).post(API_PATHS.forgotPassword, { email })
    await t.idle()
    const resetToken = /token=([\w-]+)/.exec(t.outbox().at(-1)?.text_body ?? '')?.[1] ?? ''
    await new TestClient(t).post(API_PATHS.resetPassword, { token: resetToken, newPassword: 'gunluk-icin-sifre-44' })
    await client.get(`${API_PATHS.adminUsers}?q=${encodeURIComponent(email)}`)
    const log = t.logLines.join('\n')
    expect(log).toContain('"msg":"istek"')
    for (const secret of [
      email,
      GOOD_PASSWORD,
      'yanlis-sifre-123',
      'gunluk-icin-sifre-44',
      resetToken,
      client.cookie?.split('=')[1] ?? '?',
    ]) {
      expect(log).not.toContain(secret)
    }
    expect(log).toContain('"route":"/api/auth/password/reset"')
  })

  it('API yanıtında sıkı CSP, nosniff, Referrer-Policy, çerçeve yasağı; HSTS yalnız üretimde', async () => {
    t = createTestServer()
    const dev = await new TestClient(t).get(API_PATHS.health)
    expect(dev.headers.get('content-security-policy')).toBe(API_CSP)
    expect(dev.headers.get('x-content-type-options')).toBe('nosniff')
    expect(dev.headers.get('referrer-policy')).toBe('no-referrer')
    expect(dev.headers.get('x-frame-options')).toBe('DENY')
    expect(dev.headers.get('permissions-policy')).toContain('camera=()')
    expect(dev.headers.get('strict-transport-security')).toBeNull()
    await t.close()
    t = createTestServer({ env: { NODE_ENV: 'production', APP_URL: 'https://ornek.com' } })
    const prod = await new TestClient(t).get(API_PATHS.health)
    expect(prod.headers.get('strict-transport-security')).toBe('max-age=31536000')
    expect(WEB_CSP).toContain("frame-ancestors 'none'")
    expect(WEB_CSP).not.toContain('unsafe-inline')
  })
})
