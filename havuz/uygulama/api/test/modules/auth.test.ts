import { API_PATHS, authResponseSchema, meResponseSchema } from '@uygulama/shared'
import { afterEach, describe, expect, it } from 'vitest'
import { countUnclaimedAdminEmails } from '../../src/modules/auth/userRepo.ts'
import { GOOD_PASSWORD, signUp, TestClient, uniqueEmail } from '../support/client.ts'
import { createTestServer, type TestServer } from '../support/harness.ts'

let t: TestServer
afterEach(async () => {
  await t.close()
})

const register = (client: TestClient, body: Record<string, unknown>, headers?: Record<string, string>) =>
  client.post(API_PATHS.register, body, headers)

describe('kayıt', () => {
  it('kullanıcıyı, kişisel alanını ve oturumu açar; çerez güvenli bayraklarla yazılır', async () => {
    t = createTestServer()
    const client = new TestClient(t)
    const reply = await register(client, { email: '  Ayse@Ornek.COM ', password: GOOD_PASSWORD, name: ' Ayşe ' })
    expect(reply.status).toBe(201)
    const body = authResponseSchema.parse(reply.body)
    expect(body.user).toMatchObject({ email: 'ayse@ornek.com', name: 'Ayşe', role: 'user', emailVerified: false })
    expect(body.token).toBeUndefined()
    const cookie = reply.headers.getSetCookie()[0] ?? ''
    expect(cookie).toMatch(/^sid=[A-Za-z0-9_-]{43};/)
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Path=/')
    expect(cookie).toMatch(/Max-Age=259\d{4}/)
    const workspaces = await client.get(API_PATHS.workspaces)
    expect(workspaces.body.workspaces).toEqual([
      expect.objectContaining({ kind: 'personal', name: 'Kişisel', role: 'owner', rev: 0, memberCount: 1 }),
    ])
    expect(t.ctx.audit.recent().map((row) => row.action)).toContain('auth.register')
  })

  it('X-Auth-Mode: token ile belirteci gövdede döndürür, çerez yazmaz; belirteç Bearer olarak çalışır', async () => {
    t = createTestServer()
    const client = new TestClient(t, { origin: null })
    const reply = await register(
      client,
      { email: uniqueEmail(), password: GOOD_PASSWORD, name: 'Burak' },
      { 'X-Auth-Mode': 'token' },
    )
    expect(reply.status).toBe(201)
    expect(reply.headers.getSetCookie()).toEqual([])
    const { token } = authResponseSchema.parse(reply.body)
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const me = await new TestClient(t).get(API_PATHS.me, { Authorization: `Bearer ${token}` })
    expect(me.status).toBe(200)
  })

  it('doğrulama hataları alan alan Türkçe döner', async () => {
    t = createTestServer()
    const reply = await register(new TestClient(t), { email: 'gecersiz', password: 'kisa', name: '' })
    expect(reply.status).toBe(400)
    expect(reply.body.error.code).toBe('validation')
    const paths = (reply.body.error.details as { path: string }[]).map((item) => item.path)
    expect(paths).toEqual(expect.arrayContaining(['email', 'password', 'name']))
    expect(reply.body.error.message).toBe('Geçerli bir e-posta yazın.')
  })

  it('yaygın ya da kişisel bilgiyi içeren şifre weak_password ile reddedilir', async () => {
    t = createTestServer()
    const client = new TestClient(t)
    const common = await register(client, { email: uniqueEmail(), password: 'Galatasaray1905!', name: 'Can' })
    expect(common.status).toBe(400)
    expect(common.body.error).toMatchObject({ code: 'weak_password', details: [{ path: 'password' }] })
    const personal = await register(client, {
      email: 'zeynep.kaya@ornek.com',
      password: 'zeynep-sifresi-99',
      name: 'Z',
    })
    expect(personal.body.error.code).toBe('weak_password')
  })

  it('aynı e-posta (büyük/küçük harf farkıyla da) ikinci kez kaydolamaz', async () => {
    t = createTestServer()
    await signUp(t, { email: 'ayni@ornek.com' })
    const again = await register(new TestClient(t), { email: 'AYNI@ornek.com', password: GOOD_PASSWORD, name: 'X' })
    expect(again.status).toBe(409)
    expect(again.body.error.code).toBe('email_taken')
  })

  it('ADMIN_EMAILS listesindeki e-posta yönetici olarak açılır', async () => {
    t = createTestServer({ env: { ADMIN_EMAILS: 'patron@ornek.com' } })
    const { user } = await signUp(t, { email: 'Patron@ornek.com' })
    expect(user.role).toBe('admin')
  })

  it('ADMIN_EMAILS riski: e-posta doğrulanmadığı için adresi İLK kaydeden yönetici olur; açılış uyarısı sayar', async () => {
    t = createTestServer({ env: { ADMIN_EMAILS: 'patron@ornek.com,ikinci@ornek.com' } })
    expect(countUnclaimedAdminEmails(t.db, t.config.adminEmails)).toBe(2) // sunucu açılışta uyarır
    // Sahibi henüz kaydolmadıysa adresi bilen herkes kaydolup yönetici olur (bilinen sınır; GUVENLIK.md §5).
    const { user } = await signUp(t, { email: 'ikinci@ornek.com' })
    expect(user.role).toBe('admin')
    expect(countUnclaimedAdminEmails(t.db, t.config.adminEmails)).toBe(1)
  })
})

describe('giriş, ben, çıkış', () => {
  it('doğru bilgilerle giriş yapılır; e-posta büyük harfle de çalışır', async () => {
    t = createTestServer()
    const { email } = await signUp(t)
    const client = new TestClient(t)
    const reply = await client.post(API_PATHS.login, { email: email.replace('kisi', 'KISI'), password: GOOD_PASSWORD })
    expect(reply.status).toBe(200)
    expect(authResponseSchema.parse(reply.body).user.email).toBe(email)
    expect(meResponseSchema.parse((await client.get(API_PATHS.me)).body).user.email).toBe(email)
  })

  it('yanlış şifre ve bilinmeyen e-posta AYNI yanıtı alır', async () => {
    t = createTestServer()
    const { email } = await signUp(t)
    const client = new TestClient(t)
    const wrong = await client.post(API_PATHS.login, { email, password: 'yanlis-sifre-123' })
    const unknown = await client.post(API_PATHS.login, { email: 'olmayan@ornek.com', password: 'yanlis-sifre-123' })
    expect(wrong.status).toBe(401)
    expect(unknown.status).toBe(401)
    expect(wrong.body).toEqual(unknown.body)
    expect(wrong.body.error).toEqual({ code: 'invalid_credentials', message: 'E-posta ya da şifre hatalı.' })
    const actions = t.ctx.audit.recent().map((row) => row.action)
    expect(actions.filter((action) => action === 'auth.login_failed')).toHaveLength(2)
  })

  it('oturum yoksa ben ucu 401 unauthorized döner', async () => {
    t = createTestServer()
    const reply = await new TestClient(t).get(API_PATHS.me)
    expect(reply.status).toBe(401)
    expect(reply.body.error.code).toBe('unauthorized')
  })

  it('bozuk/uydurma belirteç ve çerez oturum açmaz; bozuk çerez silinir', async () => {
    t = createTestServer()
    const client = new TestClient(t)
    expect((await client.get(API_PATHS.me, { Authorization: 'Bearer uydurma' })).status).toBe(401)
    expect((await client.get(API_PATHS.me, { Authorization: `Bearer ${'a'.repeat(43)}` })).status).toBe(401)
    const reply = await client.get(API_PATHS.me, { Cookie: `sid=${'b'.repeat(43)}` })
    expect(reply.status).toBe(401)
    expect(reply.headers.getSetCookie()[0]).toMatch(/^sid=; Max-Age=0/)
  })

  it('çıkış oturumu siler ve çerezi temizler; oturumsuz çıkış da başarılıdır', async () => {
    t = createTestServer()
    const { client } = await signUp(t)
    const cookie = client.cookie
    const reply = await client.post(API_PATHS.logout)
    expect(reply.status).toBe(200)
    expect(reply.body).toEqual({ ok: true })
    expect(reply.headers.getSetCookie()[0]).toMatch(/^sid=; Max-Age=0/)
    expect((await new TestClient(t).get(API_PATHS.me, { Cookie: cookie ?? '' })).status).toBe(401)
    expect((await new TestClient(t).post(API_PATHS.logout)).status).toBe(200)
  })

  it('tüm cihazlardan çıkış öteki oturumları da düşürür', async () => {
    t = createTestServer()
    const { client, email } = await signUp(t)
    const phone = new TestClient(t)
    await phone.post(API_PATHS.login, { email, password: GOOD_PASSWORD })
    expect((await phone.get(API_PATHS.me)).status).toBe(200)
    expect((await client.post(API_PATHS.logoutAll)).status).toBe(200)
    expect((await phone.get(API_PATHS.me)).status).toBe(401)
    expect((await client.get(API_PATHS.me)).status).toBe(401)
    expect((await new TestClient(t).post(API_PATHS.logoutAll)).status).toBe(401)
  })
})

describe('doğrulama hataları (gövde şemaya uymuyor → 400 validation, alan ayrıntılı)', () => {
  it.each([
    [API_PATHS.login, { email: 'gecersiz', password: '' }, ['email', 'password']],
    [API_PATHS.forgotPassword, { email: 'gecersiz' }, ['email']],
    [API_PATHS.resetPassword, { token: 'kisa', newPassword: 'kisa' }, ['token', 'newPassword']],
  ])('%s', async (path, body, fields) => {
    t = createTestServer()
    const reply = await new TestClient(t).post(path, body)
    expect(reply.status).toBe(400)
    expect(reply.body.error.code).toBe('validation')
    expect((reply.body.error.details as { path: string }[]).map((item) => item.path)).toEqual(fields)
  })

  it('şifre değiştir: eksik alanlar', async () => {
    t = createTestServer()
    const { client } = await signUp(t)
    const reply = await client.post(API_PATHS.changePassword, { newPassword: 'kisa' })
    expect(reply.status).toBe(400)
    expect((reply.body.error.details as { path: string }[]).map((item) => item.path)).toEqual([
      'currentPassword',
      'newPassword',
    ])
  })
})

describe('oturum süresi', () => {
  it('yarı ömür geçince süre uzar ve çerez tazelenir; hiç kullanılmazsa 30 gün sonra düşer', async () => {
    t = createTestServer()
    const { client } = await signUp(t)
    t.clock.advanceDays(10)
    const early = await client.get(API_PATHS.me)
    expect(early.headers.getSetCookie()).toEqual([])
    t.clock.advanceDays(6) // 16. gün: kalan süre 15 günün altında
    const renewed = await client.get(API_PATHS.me)
    expect(renewed.status).toBe(200)
    expect(renewed.headers.getSetCookie()[0]).toMatch(/Max-Age=259\d{4}/)
    t.clock.advanceDays(29)
    expect((await client.get(API_PATHS.me)).status).toBe(200)
    t.clock.advanceDays(31)
    expect((await client.get(API_PATHS.me)).status).toBe(401)
    expect(t.db.get<{ total: number }>('SELECT count(*) AS total FROM sessions')?.total).toBe(0)
  })
})

describe('şifre değiştir', () => {
  it('şu anki şifre yanlışsa invalid_credentials (alan ayrıntısıyla); zayıf yeni şifre reddedilir', async () => {
    t = createTestServer()
    const { client } = await signUp(t)
    const wrong = await client.post(API_PATHS.changePassword, {
      currentPassword: 'yanlis-sifre-1',
      newPassword: 'yepyeni-guclu-sifre-7',
    })
    expect(wrong.status).toBe(401)
    expect(wrong.body.error).toMatchObject({ code: 'invalid_credentials', details: [{ path: 'currentPassword' }] })
    const weak = await client.post(API_PATHS.changePassword, {
      currentPassword: GOOD_PASSWORD,
      newPassword: '1234567890',
    })
    expect(weak.body.error).toMatchObject({ code: 'weak_password', details: [{ path: 'newPassword' }] })
  })

  it('başarılı değişimde bu oturum kalır, ötekiler düşer, yeni şifre çalışır, bilgilendirme e-postası gider', async () => {
    t = createTestServer()
    const { client, email } = await signUp(t)
    const laptop = new TestClient(t)
    await laptop.post(API_PATHS.login, { email, password: GOOD_PASSWORD })
    const reply = await client.post(API_PATHS.changePassword, {
      currentPassword: GOOD_PASSWORD,
      newPassword: 'yepyeni-guclu-sifre-7',
    })
    expect(reply.status).toBe(200)
    expect((await client.get(API_PATHS.me)).status).toBe(200)
    expect((await laptop.get(API_PATHS.me)).status).toBe(401)
    expect((await new TestClient(t).post(API_PATHS.login, { email, password: GOOD_PASSWORD })).status).toBe(401)
    expect((await new TestClient(t).post(API_PATHS.login, { email, password: 'yepyeni-guclu-sifre-7' })).status).toBe(
      200,
    )
    await t.idle()
    expect(t.outbox().map((mail) => mail.subject)).toEqual(['Şifreniz değiştirildi'])
  })

  it('oturum olmadan 401', async () => {
    t = createTestServer()
    const reply = await new TestClient(t).post(API_PATHS.changePassword, {
      currentPassword: 'a',
      newPassword: 'yepyeni-guclu-sifre-7',
    })
    expect(reply.status).toBe(401)
  })
})

describe('şifremi unuttum / sıfırla', () => {
  async function requestReset(email: string): Promise<string> {
    const reply = await new TestClient(t).post(API_PATHS.forgotPassword, { email })
    expect(reply.body).toEqual({ ok: true })
    await t.idle()
    const mail = t.outbox().at(-1)
    const link = /https?:\/\/\S+/.exec(mail?.text_body ?? '')?.[0] ?? ''
    expect(link.startsWith('http://localhost:5310/#/sifre-sifirla?token=')).toBe(true)
    expect(mail?.html_body).toContain('Şifremi sıfırla')
    return new URL(link.replace('#/', '')).searchParams.get('token') ?? ''
  }

  it('bağlantıyla yeni şifre konur; eski şifre ve bütün oturumlar düşer; bağlantı ikinci kez çalışmaz', async () => {
    t = createTestServer()
    const { client, email } = await signUp(t)
    const token = await requestReset(email)
    const reset = await new TestClient(t).post(API_PATHS.resetPassword, {
      token,
      newPassword: 'sifirlanmis-yeni-sifre-5',
    })
    expect(reset.status).toBe(200)
    expect((await client.get(API_PATHS.me)).status).toBe(401)
    expect((await new TestClient(t).post(API_PATHS.login, { email, password: GOOD_PASSWORD })).status).toBe(401)
    expect(
      (await new TestClient(t).post(API_PATHS.login, { email, password: 'sifirlanmis-yeni-sifre-5' })).status,
    ).toBe(200)
    const again = await new TestClient(t).post(API_PATHS.resetPassword, { token, newPassword: 'baska-yeni-sifre-55' })
    expect(again.status).toBe(400)
    expect(again.body.error.code).toBe('invalid_token')
  })

  it('süresi dolan (60 dk) ya da uydurma belirteç invalid_token alır', async () => {
    t = createTestServer()
    const { email } = await signUp(t)
    const token = await requestReset(email)
    t.clock.advance(61 * 60_000)
    const expired = await new TestClient(t).post(API_PATHS.resetPassword, { token, newPassword: 'gec-kalmis-sifre-12' })
    expect(expired.body.error.code).toBe('invalid_token')
    const fake = await new TestClient(t).post(API_PATHS.resetPassword, {
      token: 'x'.repeat(43),
      newPassword: 'gec-kalmis-sifre-12',
    })
    expect(fake.body.error.code).toBe('invalid_token')
  })

  it('şifre (oturumla) değiştirilince bekleyen sıfırlama bağlantıları da geçersiz olur', async () => {
    t = createTestServer()
    const { client, email } = await signUp(t)
    // Saldırgan bir an e-posta kutusuna erişip bağlantıyı aldı; kullanıcı fark edip şifresini değiştirdi.
    const stolen = await requestReset(email)
    const changed = await client.post(API_PATHS.changePassword, {
      currentPassword: GOOD_PASSWORD,
      newPassword: 'kullanicinin-yeni-sifresi-8',
    })
    expect(changed.status).toBe(200)
    const takeover = await new TestClient(t).post(API_PATHS.resetPassword, {
      token: stolen,
      newPassword: 'saldirganin-sifresi-77',
    })
    expect(takeover.status).toBe(400)
    expect(takeover.body.error.code).toBe('invalid_token')
    expect(
      (await new TestClient(t).post(API_PATHS.login, { email, password: 'kullanicinin-yeni-sifresi-8' })).status,
    ).toBe(200)
  })

  it('yeni sıfırlama isteği, kullanılan belirteçle birlikte eskilerini de geçersiz kılar', async () => {
    t = createTestServer()
    const { email } = await signUp(t)
    const first = await requestReset(email)
    const second = await requestReset(email)
    expect(
      (await new TestClient(t).post(API_PATHS.resetPassword, { token: second, newPassword: 'ikinci-yeni-sifre-9' }))
        .status,
    ).toBe(200)
    const old = await new TestClient(t).post(API_PATHS.resetPassword, {
      token: first,
      newPassword: 'ucuncu-yeni-sifre-9',
    })
    expect(old.body.error.code).toBe('invalid_token')
  })
})

describe('parola özeti yükseltme', () => {
  it('parametre yükselince ilk başarılı girişte özet yeni parametrelerle yeniden yazılır', async () => {
    t = createTestServer()
    const { email, user } = await signUp(t)
    const before = t.db.get<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', user.id)
    expect(before?.password_hash.startsWith('scrypt$16$1$1$')).toBe(true)
    await t.server.close()
    const stronger = createTestServer({ db: t.db, clock: t.clock, config: { passwordHash: { N: 32, r: 2, p: 1 } } })
    const reply = await new TestClient(stronger).post(API_PATHS.login, { email, password: GOOD_PASSWORD })
    expect(reply.status).toBe(200)
    const after = t.db.get<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', user.id)
    expect(after?.password_hash.startsWith('scrypt$32$2$1$')).toBe(true)
    expect((await new TestClient(stronger).post(API_PATHS.login, { email, password: GOOD_PASSWORD })).status).toBe(200)
    await stronger.server.close()
  })
})
