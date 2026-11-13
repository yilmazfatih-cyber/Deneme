import type { FastifyInstance } from 'fastify'
import type { Response as InjectResponse } from 'light-my-request'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { COOKIES, HEADERS } from '../../shared/constants'
import type { BootContext } from '../../shared/types'
import { deriveKey, loadConfig } from '../src/kernel/config'
import { browserFromUserAgent, deriveEsn, formatEsn, osFromUserAgent, parseEsn } from '../src/services/identity/esn'
import { decodeTvpId, encodeTvpId, issueAuthURL, verifyAuthURL } from '../src/services/identity/session'
import { createTestApp } from './helpers'

const CHROME_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

/** Küçük çerez kavanozu: Set-Cookie'leri biriktirir, silinenleri atar. */
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
beforeAll(async () => {
  app = await createTestApp()
})
afterAll(async () => {
  await app.close()
})

async function login(jar = new Jar()): Promise<{ jar: Jar; boot: BootContext }> {
  const res = await app.inject({ method: 'POST', url: '/api/login', cookies: jar.cookies, headers: { 'user-agent': CHROME_MAC } })
  expect(res.statusCode).toBe(200)
  jar.take(res)
  return { jar, boot: res.json<BootContext>() }
}

async function switchTo(jar: Jar, guid: string) {
  const res = await app.inject({ method: 'POST', url: '/api/profiles/switch', cookies: jar.cookies, payload: { guid } })
  jar.take(res)
  return res
}

describe('ESN', () => {
  it('biçimler ve ayrıştırır', () => {
    const esn = formatEsn({ browser: 'CH', os: 'MC', deviceHash: 'A'.repeat(30) })
    expect(esn).toBe(`TVPWCH-MC-${'A'.repeat(30)}`)
    expect(parseEsn(esn)).toEqual({ product: 'TVP', player: 'W', browser: 'CH', os: 'MC', deviceHash: 'A'.repeat(30) })
    expect(parseEsn('NFCDCH-MC-XYZ')).toBeNull()
    expect(parseEsn(`TVPWXX-MC-${'A'.repeat(30)}`)).toBeNull()
    expect(() => formatEsn({ browser: 'CH', os: 'MC', deviceHash: 'kısa' })).toThrow()
  })

  it('tarayıcı ve platformu User-Agent dizgesinden çıkarır', () => {
    expect(browserFromUserAgent(CHROME_MAC)).toBe('CH')
    expect(osFromUserAgent(CHROME_MAC)).toBe('MC')
    const edge = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0'
    expect(browserFromUserAgent(edge)).toBe('ED')
    expect(osFromUserAgent(edge)).toBe('WN')
    expect(browserFromUserAgent('Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0')).toBe('FF')
    expect(osFromUserAgent('Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0')).toBe('LX')
    const iphone =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    expect(browserFromUserAgent(iphone)).toBe('SF')
    expect(osFromUserAgent(iphone)).toBe('IO')
    expect(osFromUserAgent('Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36')).toBe('AN')
    expect(browserFromUserAgent('curl/8.0')).toBe('OT')
    expect(osFromUserAgent('curl/8.0')).toBe('OT')
  })

  it('aynı cihaz kimliği aynı ESN; açılış bağlamındaki ESN geçerli', async () => {
    const key = Buffer.from('k')
    expect(deriveEsn(key, 'a'.repeat(32), CHROME_MAC)).toBe(deriveEsn(key, 'a'.repeat(32), CHROME_MAC))
    expect(deriveEsn(key, 'a'.repeat(32), CHROME_MAC)).not.toBe(deriveEsn(key, 'b'.repeat(32), CHROME_MAC))
    const res = await app.inject({ url: '/api/boot', headers: { 'user-agent': CHROME_MAC } })
    const esn = res.json<BootContext>().esn
    expect(esn).toMatch(/^TVPWCH-MC-[A-Z2-7]{30}$/)
    const jar = new Jar().take(res)
    expect(jar.values.get(COOKIES.DEVICE)).toMatch(/^[0-9a-f]{32}$/)
    // Aynı cihaz çereziyle yeniden: aynı ESN; uydurma başlık yok sayılır
    const again = await app.inject({
      url: '/api/boot',
      cookies: jar.cookies,
      headers: { 'user-agent': CHROME_MAC, [HEADERS.ESN]: `TVPWFF-LX-${'B'.repeat(30)}` },
    })
    expect(again.json<BootContext>().esn).toBe(esn)
  })
})

describe('authURL', () => {
  const key = Buffer.from('authurl-key')
  it('kendi oturumu için 24 saat geçerli', () => {
    const now = Date.now()
    const t = issueAuthURL(key, 'sid1', now)
    expect(t).toMatch(/^c1\.\d+\.[A-Za-z0-9_-]+$/)
    expect(verifyAuthURL(key, 'sid1', t, now + 1000)).toBe(true)
    expect(verifyAuthURL(key, 'sid2', t, now)).toBe(false)
    expect(verifyAuthURL(key, 'sid1', t, now + 25 * 60 * 60 * 1000)).toBe(false)
    expect(verifyAuthURL(key, 'sid1', t.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')), now)).toBe(false)
    expect(verifyAuthURL(key, 'sid1', null, now)).toBe(false)
  })
})

describe('çerez zinciri', () => {
  it('TvpId gidiş-dönüş ve kurcalama', () => {
    const key = deriveKey(loadConfig({ secret: 'x', dataDir: process.env.TMPDIR ?? '/tmp' }), 'cookie')
    const v = encodeTvpId(key, { aid: 'acc_demo', sid: 's', iat: 1 }, 'ABCDEFGHIJKLMNOPQRSTUVWX')
    expect(v).toContain('v=1&ct=')
    expect(decodeTvpId(key, v)).toEqual({ claims: { aid: 'acc_demo', sid: 's', iat: 1 }, pg: 'ABCDEFGHIJKLMNOPQRSTUVWX' })
    expect(decodeTvpId(key, v.replace('pg=ABCD', 'pg=ZBCD'))).toBeNull()
    expect(decodeTvpId(Buffer.from('başka'), v)).toBeNull()
  })

  it('giriş çerezleri doğru özniteliklerle yazar', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/login', headers: { 'user-agent': CHROME_MAC } })
    const byName = new Map(res.cookies.map((c) => [c.name, c]))
    const session = byName.get(COOKIES.SESSION)!
    expect(session.httpOnly).toBe(true)
    expect(session.sameSite).toBe('Lax')
    expect(session.path).toBe('/')
    expect(session.maxAge).toBe(365 * 24 * 60 * 60)
    expect(session.secure).toBeFalsy()
    expect(decodeURIComponent(res.headers['set-cookie']!.toString())).toMatch(/TvpId=v=1&ct=[^&]+&pg=&ch=/)
    const secure = byName.get(COOKIES.SECURE)!
    expect(secure.httpOnly).toBe(true)
    expect(secure.sameSite).toBe('Strict')
    expect(secure.value).toMatch(/^v=1&mac=[A-Za-z0-9_-]+&dt=\d+$/)
    expect(byName.get(COOKIES.DEVICE)?.value).toMatch(/^[0-9a-f]{32}$/)
  })

  it('https isteğinde Secure özniteliği eklenir', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/login', headers: { 'x-forwarded-proto': 'https' } })
    const session = res.cookies.find((c) => c.name === COOKIES.SESSION)!
    expect(session.secure).toBe(true)
  })

  it('kurcalanmış TvpId → anonim ve çerezler silinir', async () => {
    const { jar } = await login()
    const tampered = { ...jar.cookies, [COOKIES.SESSION]: jar.cookies[COOKIES.SESSION]!.replace('ch=', 'ch=x') }
    const res = await app.inject({ url: '/api/boot', cookies: tampered })
    expect(res.json<BootContext>().membershipStatus).toBe('ANONYMOUS')
    const cleared = res.cookies.filter((c) => c.name === COOKIES.SESSION || c.name === COOKIES.SECURE)
    expect(cleared).toHaveLength(2)
    for (const c of cleared) expect(c.value).toBe('')
  })

  it('POST isteği SecureTvpId olmadan anonimdir', async () => {
    const { jar, boot } = await login()
    const guid = boot.profiles[0]!.guid
    const noSecure = { ...jar.cookies }
    delete noSecure[COOKIES.SECURE]
    const res = await app.inject({ method: 'POST', url: '/api/profiles/switch', cookies: noSecure, payload: { guid } })
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('UNAUTHENTICATED')
    // GET için TvpId yeter
    const get = await app.inject({ url: '/api/boot', cookies: noSecure })
    expect(get.json<BootContext>().membershipStatus).toBe('CURRENT_MEMBER')
    // Başka oturumun SecureTvpId'si de geçmez
    const other = await login()
    const mixed = { ...jar.cookies, [COOKIES.SECURE]: other.jar.cookies[COOKIES.SECURE]! }
    const res2 = await app.inject({ method: 'POST', url: '/api/profiles/switch', cookies: mixed, payload: { guid } })
    expect(res2.statusCode).toBe(401)
  })
})

describe('açılış bağlamı ve oturum akışı', () => {
  it('anonim', async () => {
    const res = await app.inject({ url: '/api/boot' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['cache-control']).toBe('no-store')
    const boot = res.json<BootContext>()
    expect(boot.membershipStatus).toBe('ANONYMOUS')
    expect(boot.account).toBeNull()
    expect(boot.profiles).toEqual([])
    expect(boot.activeProfile).toBeNull()
    expect(boot.authURL).toBeNull()
    expect(boot.falcorCache).toBeNull()
    expect(boot.persistedQueryVersion).toBe(102)
    expect(boot.featureFlags).toEqual({ liveTv: true, kidsMode: true, top10: true, devtools: true })
    expect(boot.region).toBe('tr-ist-1')
    expect(res.headers[HEADERS.PASSPORT_PROFILE]).toBeUndefined()
  })

  it('üye (profil yok) → profil seç → çıkış', async () => {
    const { jar, boot } = await login()
    expect(boot.membershipStatus).toBe('CURRENT_MEMBER')
    expect(boot.account).toEqual({ accountId: 'acc_demo', planName: 'TV+ Premium', products: ['tvplus-temel'] })
    expect(boot.profiles.map((p) => p.name)).toEqual(['Deniz', 'Çocuk'])
    for (const p of boot.profiles) {
      expect(p.guid).toMatch(/^[A-Z2-7]{24}$/)
      expect(p.avatarUrl).toMatch(/^\/img\/v1\/avatar\/160x160\/Profile%3A[A-Z2-7]{24}\.webp\?r=/)
    }
    const kids = boot.profiles.find((p) => p.name === 'Çocuk')!
    expect(kids.isKids).toBe(true)
    expect(kids.maturityLevel).toBe(40)
    expect(boot.activeProfile).toBeNull()
    expect(boot.authURL).toMatch(/^c1\./)

    const member = await app.inject({ url: '/api/boot', cookies: jar.cookies })
    expect(member.json<BootContext>().membershipStatus).toBe('CURRENT_MEMBER')
    expect(member.json<BootContext>().activeProfile).toBeNull()

    const deniz = boot.profiles.find((p) => p.name === 'Deniz')!
    const sw = await switchTo(jar, deniz.guid)
    expect(sw.statusCode).toBe(200)
    expect(sw.headers[HEADERS.PASSPORT_PROFILE]).toBe(deniz.guid)
    expect(sw.json<BootContext>().activeProfile?.guid).toBe(deniz.guid)
    const gate = sw.cookies.find((c) => c.name === COOKIES.PROFILE_GATE)!
    expect(gate.value).toBe('0')
    expect(gate.maxAge).toBeUndefined() // oturum çerezi
    expect(decodeURIComponent(jar.cookies[COOKIES.SESSION]!)).toContain(`pg=${deniz.guid}`)

    const withProfile = await app.inject({ url: '/api/boot', cookies: jar.cookies })
    expect(withProfile.headers[HEADERS.PASSPORT_PROFILE]).toBe(deniz.guid)
    const wb = withProfile.json<BootContext>()
    expect(wb.activeProfile?.name).toBe('Deniz')
    // Rota yoksa (ya da değerlendirme boşsa) önbellek null; varsa bir JSON Graph nesnesi
    expect(wb.falcorCache === null || typeof wb.falcorCache === 'object').toBe(true)

    // Yeni tarayıcı oturumu (oturum çerezi yok) → profil kapısı yeniden
    const newSession = { ...jar.cookies }
    delete newSession[COOKIES.PROFILE_GATE]
    const gated = await app.inject({ url: '/api/boot', cookies: newSession })
    expect(gated.json<BootContext>().activeProfile).toBeNull()
    expect(gated.json<BootContext>().membershipStatus).toBe('CURRENT_MEMBER')

    const out = await app.inject({ method: 'POST', url: '/api/logout', cookies: jar.cookies })
    jar.take(out)
    expect(out.json<BootContext>().membershipStatus).toBe('ANONYMOUS')
    expect(jar.values.has(COOKIES.SESSION)).toBe(false)
    expect(jar.values.has(COOKIES.SECURE)).toBe(false)
    expect(jar.values.has(COOKIES.DEVICE)).toBe(true)
    const after = await app.inject({ url: '/api/boot', cookies: jar.cookies })
    expect(after.json<BootContext>().membershipStatus).toBe('ANONYMOUS')
  })

  it('başka hesaba ait ya da bilinmeyen profil seçilemez', async () => {
    const { jar } = await login()
    const res = await switchTo(jar, 'AAAAAAAAAAAAAAAAAAAAAAAA')
    expect(res.statusCode).toBe(404)
    expect(res.json().error.code).toBe('PROFILE_NOT_FOUND')
    const bad = await app.inject({ method: 'POST', url: '/api/profiles/switch', cookies: jar.cookies, payload: {} })
    expect(bad.statusCode).toBe(400)
    const anon = await app.inject({ method: 'POST', url: '/api/profiles/switch', payload: { guid: 'x' } })
    expect(anon.statusCode).toBe(401)
  })

  it('profil GUIDleri yeniden başlatmada aynı', async () => {
    const { boot } = await login()
    const other = await createTestApp()
    try {
      const res = await other.inject({ method: 'POST', url: '/api/login' })
      expect(res.json<BootContext>().profiles.map((p) => p.guid)).toEqual(boot.profiles.map((p) => p.guid))
    } finally {
      await other.close()
    }
  })

  it('app.services.identity arayüzü çalışır', async () => {
    const { boot } = await login()
    const svc = app.services.identity
    expect(svc.getAccount('acc_demo')?.planName).toBe('TV+ Premium')
    expect(svc.listProfiles('acc_demo')).toHaveLength(2)
    expect(svc.getProfile(boot.profiles[0]!.guid)?.language).toBe('tr')
    expect(svc.getProfile('YOK')).toBeNull()
  })
})
