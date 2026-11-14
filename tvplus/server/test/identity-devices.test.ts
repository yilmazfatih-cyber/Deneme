/**
 * Kimlik — ikinci tur: sanal cihaz çerez ad alanları, loginDevice / revokeDevice, profil yönetimi (REST),
 * profil kilidi (PIN), avatarlar ve SPA kabuğunun `?vd=` ile gömdüğü açılış bağlamı.
 */
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Response as InjectResponse } from 'light-my-request'
import sharp from 'sharp'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { COOKIES, HEADERS } from '../../shared/constants'
import type { ProfilesResponse } from '../../shared/devices'
import type { BootContext } from '../../shared/types'
import { AVATAR_KEYS } from '../src/services/identity/avatars'
import { pinClock } from '../src/services/identity/pin'
import { buildApp } from '../src/app'
import { createTestApp } from './helpers'

/** Çerez kavanozu (tek tarayıcı): Set-Cookie'leri biriktirir, silinenleri atar. */
class Jar {
  values = new Map<string, string>()
  take(res: InjectResponse): this {
    for (const c of res.cookies) {
      const expired = (c.maxAge !== undefined && c.maxAge <= 0) || (c.expires && c.expires.getTime() < Date.now())
      if (expired || c.value === '') this.values.delete(c.name)
      else this.values.set(c.name, c.value)
    }
    return this
  }
  get cookies(): Record<string, string> {
    return Object.fromEntries(this.values)
  }
}

let app: FastifyInstance
let distDir: string
beforeAll(async () => {
  distDir = mkdtempSync(join(tmpdir(), 'tvplus-test-dist-'))
  writeFileSync(join(distDir, 'index.html'), '<!doctype html><html><head><!--TVP_BOOT--></head><body></body></html>')
  app = await buildApp({
    dataDir: mkdtempSync(join(tmpdir(), 'tvplus-test-')),
    secret: 'test-secret',
    isTest: true,
    offline: true,
    logLevel: 'silent',
    debugAccess: 'open',
    webDistDir: distDir,
  })
  // loginDevice'ı uçtan uca denemek için test ucu (cihazlar servisinin TV yoklamasının yerine)
  app.post('/test/login-device', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = (req.body ?? {}) as { accountId?: string; profileGuid?: string | null }
    const boot = await app.services.identity.loginDevice(req, reply, {
      accountId: body.accountId ?? 'acc_demo',
      profileGuid: body.profileGuid ?? null,
    })
    // Aynı istekte sonraki kod üyeyi görmeli
    return { boot, passport: { member: req.passport.membershipStatus, profile: req.passport.profile?.guid ?? null } }
  })
  await app.ready()
})
afterAll(async () => {
  await app.close()
})

type Vd = string | null
const vdHeaders = (vd: Vd): Record<string, string> => (vd ? { [HEADERS.VIRTUAL_DEVICE]: vd } : {})

async function boot(jar: Jar, vd: Vd = null, viaQuery = false): Promise<BootContext> {
  const res = await app.inject({
    url: viaQuery && vd ? `/api/boot?vd=${vd}` : '/api/boot',
    cookies: jar.cookies,
    headers: viaQuery ? {} : vdHeaders(vd),
  })
  jar.take(res)
  return res.json<BootContext>()
}
async function login(jar: Jar, vd: Vd = null): Promise<BootContext> {
  const res = await app.inject({ method: 'POST', url: '/api/login', cookies: jar.cookies, headers: vdHeaders(vd) })
  expect(res.statusCode).toBe(200)
  jar.take(res)
  return res.json<BootContext>()
}
async function switchTo(jar: Jar, guid: string, opts: { vd?: Vd; pin?: string } = {}) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/profiles/switch',
    cookies: jar.cookies,
    headers: vdHeaders(opts.vd ?? null),
    payload: opts.pin !== undefined ? { guid, pin: opts.pin } : { guid },
  })
  jar.take(res)
  return res
}

describe('sanal cihaz (x-tvplus-vd / ?vd=)', () => {
  it('iki ad alanı ve varsayılan zincir tek kavanozda birbirinden bağımsız', async () => {
    const jar = new Jar()
    const tvAnon = await boot(jar, 'tv')
    const phoneAnon = await boot(jar, 'telefon')
    const webAnon = await boot(jar)
    // Üç ayrı cihaz kimliği ve ESN
    expect(jar.values.get(`${COOKIES.DEVICE}__tv`)).toMatch(/^[0-9a-f]{32}$/)
    expect(jar.values.get(`${COOKIES.DEVICE}__telefon`)).toMatch(/^[0-9a-f]{32}$/)
    expect(jar.values.get(COOKIES.DEVICE)).toMatch(/^[0-9a-f]{32}$/)
    expect(new Set([tvAnon.esn, phoneAnon.esn, webAnon.esn]).size).toBe(3)
    expect(
      new Set([
        jar.values.get(`${COOKIES.DEVICE}__tv`),
        jar.values.get(`${COOKIES.DEVICE}__telefon`),
        jar.values.get(COOKIES.DEVICE),
      ]).size,
    ).toBe(3)

    // Yalnız "tv" giriş yapar
    const tvLogin = await login(jar, 'tv')
    expect(tvLogin.membershipStatus).toBe('CURRENT_MEMBER')
    expect(jar.values.has(`${COOKIES.SESSION}__tv`)).toBe(true)
    expect(jar.values.has(`${COOKIES.SECURE}__tv`)).toBe(true)
    expect(jar.values.has(COOKIES.SESSION)).toBe(false)
    expect((await boot(jar)).membershipStatus).toBe('ANONYMOUS')
    expect((await boot(jar, 'telefon')).membershipStatus).toBe('ANONYMOUS')
    expect((await boot(jar, 'tv')).membershipStatus).toBe('CURRENT_MEMBER')
    // Sorgu biçimi (?vd=tv) başlıkla aynı ad alanını kullanır; ESN aynı cihazınki
    const viaQuery = await boot(jar, 'tv', true)
    expect(viaQuery.membershipStatus).toBe('CURRENT_MEMBER')
    expect(viaQuery.esn).toBe(tvAnon.esn)

    // Varsayılan zincir ayrı giriş yapar, profil seçer; tv profil kapısında kalır
    const webLogin = await login(jar)
    const deniz = webLogin.profiles.find((p) => p.name === 'Deniz')!
    const sw = await switchTo(jar, deniz.guid)
    expect(sw.statusCode).toBe(200)
    expect(jar.values.get(COOKIES.PROFILE_GATE)).toBe('0')
    expect(jar.values.has(`${COOKIES.PROFILE_GATE}__tv`)).toBe(false)
    expect((await boot(jar)).activeProfile?.guid).toBe(deniz.guid)
    expect((await boot(jar, 'tv')).activeProfile).toBeNull()

    // tv çocuk profiline geçer: varsayılan zincir etkilenmez
    const cocuk = webLogin.profiles.find((p) => p.name === 'Çocuk')!
    expect((await switchTo(jar, cocuk.guid, { vd: 'tv' })).statusCode).toBe(200)
    expect((await boot(jar, 'tv')).activeProfile?.guid).toBe(cocuk.guid)
    expect((await boot(jar)).activeProfile?.guid).toBe(deniz.guid)

    // tv çıkış yapar: yalnız kendi zinciri silinir
    const out = await app.inject({
      method: 'POST',
      url: '/api/logout',
      cookies: jar.cookies,
      headers: vdHeaders('tv'),
    })
    jar.take(out)
    expect(out.json<BootContext>().membershipStatus).toBe('ANONYMOUS')
    expect(jar.values.has(`${COOKIES.SESSION}__tv`)).toBe(false)
    expect(jar.values.has(COOKIES.SESSION)).toBe(true)
    expect((await boot(jar)).activeProfile?.guid).toBe(deniz.guid)
    expect((await boot(jar, 'tv')).membershipStatus).toBe('ANONYMOUS')
    expect((await boot(jar, 'telefon')).membershipStatus).toBe('ANONYMOUS')
  })

  it('geçersiz ad yok sayılır (varsayılan zincir)', async () => {
    for (const bad of ['TV', 'a-b', 'x'.repeat(13), '../x']) {
      const res = await app.inject({ url: '/api/boot', headers: { [HEADERS.VIRTUAL_DEVICE]: bad } })
      expect(res.cookies.map((c) => c.name)).toEqual([COOKIES.DEVICE])
    }
    const q = await app.inject({ url: '/api/boot?vd=B%C3%BCy%C3%BCk' })
    expect(q.cookies.map((c) => c.name)).toEqual([COOKIES.DEVICE])
  })

  it('SPA kabuğu ?vd= ile o ad alanının açılış bağlamını gömer', async () => {
    const jar = new Jar()
    await login(jar, 'tv')
    const html = (url: string) =>
      app.inject({ url, cookies: jar.cookies }).then((r) => {
        const m = /<script id="tvp-boot" type="application\/json">(.*?)<\/script>/.exec(r.body)
        return JSON.parse(m![1]!) as BootContext
      })
    expect((await html('/?vd=tv')).membershipStatus).toBe('CURRENT_MEMBER')
    expect((await html('/tv/ana-sayfa?vd=tv&cihaz=tv')).membershipStatus).toBe('CURRENT_MEMBER')
    expect((await html('/')).membershipStatus).toBe('ANONYMOUS')
    expect((await html('/?vd=mobil')).membershipStatus).toBe('ANONYMOUS')
  })
})

describe('loginDevice / revokeDevice', () => {
  it('istekteki tarayıcıya (ad alanında) giriş yapar, profili seçer, pasaportu günceller', async () => {
    const jar = new Jar()
    await boot(jar, 'tv')
    const profiles = app.services.identity.listProfiles('acc_demo')
    const deniz = profiles.find((p) => p.name === 'Deniz')!
    const res = await app.inject({
      method: 'POST',
      url: '/test/login-device',
      cookies: jar.cookies,
      headers: vdHeaders('tv'),
      payload: { profileGuid: deniz.guid },
    })
    expect(res.statusCode).toBe(200)
    jar.take(res)
    const body = res.json<{ boot: BootContext; passport: { member: string; profile: string | null } }>()
    expect(body.passport).toEqual({ member: 'CURRENT_MEMBER', profile: deniz.guid })
    expect(body.boot.membershipStatus).toBe('CURRENT_MEMBER')
    expect(body.boot.activeProfile?.guid).toBe(deniz.guid)
    expect(body.boot.authURL).toMatch(/^c1\./)
    expect(body.boot.falcorCache).not.toBeNull()
    expect(res.headers[HEADERS.PASSPORT_PROFILE]).toBe(deniz.guid)
    // POST /api/login ile aynı zincir: TvpId + SecureTvpId (+ kapı) yalnız tv ad alanında
    expect(jar.values.get(`${COOKIES.PROFILE_GATE}__tv`)).toBe('0')
    expect(jar.values.has(`${COOKIES.SECURE}__tv`)).toBe(true)
    expect(jar.values.has(COOKIES.SESSION)).toBe(false)
    expect((await boot(jar, 'tv')).activeProfile?.guid).toBe(deniz.guid)

    // Profil verilmez ya da geçersizse: üye ama profil kapısında
    const other = new Jar()
    const r2 = await app.inject({
      method: 'POST',
      url: '/test/login-device',
      cookies: other.cookies,
      payload: { profileGuid: 'AAAAAAAAAAAAAAAAAAAAAAAA' },
    })
    expect(r2.json<{ boot: BootContext }>().boot.activeProfile).toBeNull()
    expect(r2.json<{ boot: BootContext }>().boot.membershipStatus).toBe('CURRENT_MEMBER')
    // Bilinmeyen hesap
    const r3 = await app.inject({ method: 'POST', url: '/test/login-device', payload: { accountId: 'yok' } })
    expect(r3.statusCode).toBe(404)
  })

  it('revokeDevice o cihazın oturumlarını kapatır; diğer cihazlar etkilenmez; yeni giriş çalışır', async () => {
    const jar = new Jar()
    await login(jar, 'tv')
    await login(jar, 'web')
    const tvDevice = jar.values.get(`${COOKIES.DEVICE}__tv`)!
    app.services.identity.revokeDevice(tvDevice)
    const res = await app.inject({ url: '/api/boot', cookies: jar.cookies, headers: vdHeaders('tv') })
    expect(res.json<BootContext>().membershipStatus).toBe('ANONYMOUS')
    // Çerezler temizlendi
    const cleared = res.cookies.filter((c) => c.name.endsWith('__tv') && c.value === '').map((c) => c.name)
    expect(cleared).toEqual(expect.arrayContaining([`${COOKIES.SESSION}__tv`, `${COOKIES.SECURE}__tv`]))
    jar.take(res)
    // Diğer cihaz hâlâ üye
    expect((await boot(jar, 'web')).membershipStatus).toBe('CURRENT_MEMBER')
    // Aynı cihaz kimliğiyle yeniden giriş (aynı milisaniyede bile) geçerli
    await login(jar, 'tv')
    expect(jar.values.get(`${COOKIES.DEVICE}__tv`)).toBe(tvDevice)
    expect((await boot(jar, 'tv')).membershipStatus).toBe('CURRENT_MEMBER')
  })
})

describe('profil yönetimi', () => {
  let papp: FastifyInstance
  let jar: Jar
  let authURL: string
  beforeAll(async () => {
    papp = await createTestApp()
  })
  afterAll(async () => {
    await papp.close()
  })
  afterEach(() => {
    pinClock.now = () => Date.now()
  })

  const req = async (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown, auth = true) => {
    const res = await papp.inject({
      method,
      url,
      cookies: jar.cookies,
      headers: auth ? { [HEADERS.AUTH_URL]: authURL } : {},
      ...(payload !== undefined ? { payload: payload as Record<string, unknown> } : {}),
    })
    jar.take(res)
    return res
  }
  const sw = (guid: string, pin?: string) =>
    req('POST', '/api/profiles/switch', pin === undefined ? { guid } : { guid, pin }, false)

  it('listeler, oluşturur, kilitler, PIN ile geçer, siler', async () => {
    jar = new Jar()
    const res = await papp.inject({ method: 'POST', url: '/api/login' })
    jar.take(res)
    authURL = res.json<BootContext>().authURL!

    // Anonim liste alamaz
    expect((await papp.inject({ url: '/api/profiles' })).statusCode).toBe(401)

    const list = await req('GET', '/api/profiles')
    expect(list.statusCode).toBe(200)
    const body = list.json<ProfilesResponse>()
    expect(body.maxProfiles).toBe(5)
    expect(body.profiles.map((p) => [p.name, p.avatarKey, p.isLocked, p.maturityLevel])).toEqual([
      ['Deniz', 'avatar-1', false, 110],
      ['Çocuk', 'avatar-2', false, 40],
    ])
    expect(body.avatars.map((a) => a.key)).toEqual([...AVATAR_KEYS])
    expect(body.avatars).toHaveLength(12)
    for (const a of body.avatars)
      expect(a.url).toMatch(new RegExp(`^/img/v1/avatar/320x320/Avatar%3A${a.key}\\.webp\\?r=`))
    expect(body.profiles[0]!.avatarUrl).toMatch(
      /^\/img\/v1\/avatar\/320x320\/Profile%3A[A-Z2-7]{24}\.webp\?r=.+&v=avatar-1$/,
    )

    // authURL olmadan değişiklik yok
    const noCsrf = await req('POST', '/api/profiles', { name: 'Ece', avatarKey: 'yuz-03', isKids: false }, false)
    expect(noCsrf.statusCode).toBe(403)
    expect(noCsrf.json().error.code).toBe('CSRF_FAILED')

    // Oluştur
    const created = await req('POST', '/api/profiles', { name: '  Ece ', avatarKey: 'yuz-03', isKids: false })
    expect(created.statusCode).toBe(200)
    const ece = created.json<{ profile: ProfilesResponse['profiles'][number] }>().profile
    expect(ece).toMatchObject({ name: 'Ece', avatarKey: 'yuz-03', isKids: false, isLocked: false, maturityLevel: 110 })
    expect(ece.guid).toMatch(/^[A-Z2-7]{24}$/)
    expect(JSON.stringify(created.json())).not.toMatch(/pin|salt|hash/i)

    // Kurallar: ad (Türkçe harf / büyük-küçük duyarsız benzersiz), uzunluk, avatar
    expect((await req('POST', '/api/profiles', { name: 'ECE', avatarKey: 'yuz-01' })).json().error.code).toBe(
      'PROFILE_NAME_TAKEN',
    )
    expect((await req('POST', '/api/profiles', { name: 'cocuk', avatarKey: 'yuz-01' })).statusCode).toBe(409)
    expect((await req('POST', '/api/profiles', { name: '', avatarKey: 'yuz-01' })).statusCode).toBe(400)
    expect((await req('POST', '/api/profiles', { name: 'x'.repeat(21), avatarKey: 'yuz-01' })).statusCode).toBe(400)
    expect((await req('POST', '/api/profiles', { name: 'Ali', avatarKey: 'yuz-99' })).statusCode).toBe(400)

    // Çocuk profili → 40; en çok 5 profil
    const kid = (await req('POST', '/api/profiles', { name: 'Minik', avatarKey: 'yuz-07', isKids: true })).json()
    expect(kid.profile).toMatchObject({ isKids: true, maturityLevel: 40 })
    expect((await req('POST', '/api/profiles', { name: 'Beşinci', avatarKey: 'yuz-02' })).statusCode).toBe(200)
    const sixth = await req('POST', '/api/profiles', { name: 'Altıncı', avatarKey: 'yuz-02' })
    expect(sixth.statusCode).toBe(409)
    expect(sixth.json().error.code).toBe('PROFILE_LIMIT')

    // Düzenle: ad, avatar, çocuk → olgunluk
    const patched = await req('PATCH', `/api/profiles/${ece.guid}`, {
      name: 'Ece Y',
      avatarKey: 'yuz-05',
      isKids: true,
    })
    expect(patched.json().profile).toMatchObject({ name: 'Ece Y', avatarKey: 'yuz-05', maturityLevel: 40 })
    expect(patched.json().profile.avatarUrl).toMatch(/&v=yuz-05$/)
    await req('PATCH', `/api/profiles/${ece.guid}`, { isKids: false })
    // PIN biçimi
    for (const pin of ['123', '12345', 'abcd', '12a4'])
      expect((await req('PATCH', `/api/profiles/${ece.guid}`, { pin })).statusCode).toBe(400)

    // Kilitle
    const locked = await req('PATCH', `/api/profiles/${ece.guid}`, { pin: '4821' })
    expect(locked.json().profile.isLocked).toBe(true)
    expect(JSON.stringify(locked.json())).not.toContain('4821')
    const bootNow = (await papp.inject({ url: '/api/boot', cookies: jar.cookies })).json<BootContext>()
    expect(bootNow.profiles.find((p) => p.guid === ece.guid)).toMatchObject({ isLocked: true, avatarKey: 'yuz-05' })
    expect(JSON.stringify(bootNow)).not.toContain('4821')

    // Geçiş: PIN'siz → 403 PIN_REQUIRED, yanlış → PIN_INVALID, doğru → BootContext
    const noPin = await sw(ece.guid)
    expect(noPin.statusCode).toBe(403)
    expect(noPin.json().error.code).toBe('PIN_REQUIRED')
    const wrong = await sw(ece.guid, '0000')
    expect(wrong.statusCode).toBe(403)
    expect(wrong.json().error.code).toBe('PIN_INVALID')
    const right = await sw(ece.guid, '4821')
    expect(right.statusCode).toBe(200)
    expect(right.json<BootContext>().activeProfile).toMatchObject({ guid: ece.guid, isLocked: true })
    // Kilitsiz profil eski davranış: PIN gerekmez
    expect((await sw(bodyGuid(body, 'Deniz'))).statusCode).toBe(200)

    // Kilitli profili başka profildeyken düzenlemek: currentPin gerekir
    const notActive = await req('PATCH', `/api/profiles/${ece.guid}`, { name: 'Ece Z' })
    expect(notActive.json().error.code).toBe('PIN_REQUIRED')
    expect((await req('PATCH', `/api/profiles/${ece.guid}`, { name: 'Ece Z', currentPin: '4821' })).statusCode).toBe(
      200,
    )

    // Etkin profil silinince seçim temizlenir
    expect((await sw(ece.guid, '4821')).statusCode).toBe(200)
    const del = await req('DELETE', `/api/profiles/${ece.guid}`)
    expect(del.statusCode).toBe(204)
    expect(jar.values.has(COOKIES.PROFILE_GATE)).toBe(false)
    const after = (await papp.inject({ url: '/api/boot', cookies: jar.cookies })).json<BootContext>()
    expect(after.activeProfile).toBeNull()
    expect(after.profiles.some((p) => p.guid === ece.guid)).toBe(false)
    expect((await sw(ece.guid, '4821')).statusCode).toBe(404)

    // Son profil silinemez
    const rest = (await req('GET', '/api/profiles')).json<ProfilesResponse>().profiles
    for (const p of rest.slice(1)) expect((await req('DELETE', `/api/profiles/${p.guid}`)).statusCode).toBe(204)
    const last = await req('DELETE', `/api/profiles/${rest[0]!.guid}`)
    expect(last.statusCode).toBe(409)
    expect(last.json().error.code).toBe('LAST_PROFILE')
  })

  it('5 yanlış PIN → 60 sn kilit (429); süre dolunca doğru PIN geçer; PIN kaldırılabilir', async () => {
    const profiles = (await req('GET', '/api/profiles')).json<ProfilesResponse>().profiles
    const guid = profiles[0]!.guid
    await req('PATCH', `/api/profiles/${guid}`, { pin: '1234' })
    let t = Date.now()
    pinClock.now = () => t
    for (let i = 1; i <= 4; i++) expect((await sw(guid, '9999')).json().error.code).toBe('PIN_INVALID')
    const fifth = await sw(guid, '9999')
    expect(fifth.statusCode).toBe(429)
    expect(fifth.json().error.code).toBe('PIN_LOCKED')
    expect(Number(fifth.headers['retry-after'])).toBe(60)
    // Kilitteyken doğru PIN de reddedilir
    const blocked = await sw(guid, '1234')
    expect(blocked.statusCode).toBe(429)
    t += 61_000
    expect((await sw(guid, '1234')).statusCode).toBe(200)
    // Etkin profilde kilit kaldırılır
    const unlocked = await req('PATCH', `/api/profiles/${guid}`, { pin: null })
    expect(unlocked.json().profile.isLocked).toBe(false)
    expect((await sw(guid)).statusCode).toBe(200)
    // Servis arayüzünden dönen kayıtlar PIN özeti taşımaz
    await req('PATCH', `/api/profiles/${guid}`, { pin: '1234' })
    expect(JSON.stringify(papp.services.identity.listProfiles('acc_demo'))).not.toMatch(/pin|salt|hash/i)
    expect(papp.services.identity.isProfileLocked?.(guid)).toBe(true)
  })
})

const bodyGuid = (b: ProfilesResponse, name: string) => b.profiles.find((p) => p.name === name)!.guid

describe('avatar görselleri', () => {
  it('on üretilen yüz ve iki PNG imzalı adresten görsel döner; üretilenler belirlenimci ve farklı', async () => {
    const jar = new Jar()
    await login(jar)
    const list = await app.inject({ url: '/api/profiles', cookies: jar.cookies })
    const avatars = list.json<ProfilesResponse>().avatars
    const means: string[] = []
    for (const a of avatars) {
      const res = await app.inject({ url: a.url })
      expect(res.statusCode, a.key).toBe(200)
      expect(res.headers['content-type']).toBe('image/webp')
      const meta = await sharp(res.rawPayload).metadata()
      expect([meta.width, meta.height]).toEqual([320, 320])
      expect(res.headers['x-tvplus-img']).toContain(a.key.startsWith('yuz-') ? 'generated' : 'local')
      if (a.key.startsWith('yuz-')) {
        const st = await sharp(res.rawPayload).stats()
        means.push(
          st.channels
            .slice(0, 3)
            .map((c) => Math.round(c.mean / 8))
            .join(','),
        )
      }
    }
    expect(new Set(means).size).toBe(10) // on ayrı renk
    // Bilinmeyen avatar 404
    const { buildArtwork } = await import('../src/kernel/imageUrls')
    expect((await app.inject({ url: buildArtwork(app.config, 'AVATAR', 'Avatar:yuz-11').url })).statusCode).toBe(404)
  })

  it('Profile:<guid> görseli profilin avatar anahtarından çözülür', () => {
    const p = app.services.identity.listProfiles('acc_demo')[0]!
    const src = app.services.catalog.getArtworkSource(`Profile:${p.guid}`, 'AVATAR')
    expect(src).toMatchObject({ localFile: 'brand/avatar-1.png' })
    const gen = app.services.catalog.getArtworkSource('Avatar:yuz-04', 'AVATAR')
    expect(gen).toMatchObject({ localFile: null, seed: 'Avatar:yuz-04' })
  })
})
