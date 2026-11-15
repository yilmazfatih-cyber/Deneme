/**
 * Yönetici kipi: kod doğrulama (sabit süreli özet karşılaştırması), deneme sınırı, imzalı çerez (hesap + cihaza bağlı),
 * açılış bağlamındaki isAdmin, kilitleme ve çıkışta silinme, TVP_ADMIN_CODE / TVP_STUDIO / TVP_DEBUG yorumlanışı ve
 * 'admin' erişim düzeyinde stüdyo ve hata ayıklama kapıları.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import type { Response as InjectResponse } from 'light-my-request'
import { afterEach, describe, expect, it } from 'vitest'
import { COOKIES, HEADERS, ROUTES } from '../../shared/constants'
import type { AdminState, BootContext } from '../../shared/types'
import { adminCodeHashOf, DEFAULT_ADMIN_CODE_HASH, deriveKey, loadConfig, type AppConfig } from '../src/kernel/config'
import { ADMIN_LOCK_MS, ADMIN_MAX_FAILS, encodeAdminToken, verifyAdminToken } from '../src/services/identity/admin'
import { pinClock } from '../src/services/identity/pin'
import { createTestApp, TEST_ADMIN_CODE } from './helpers'

/** Çerez kavanozu: Set-Cookie'leri biriktirir, silinenleri (boş değer / geçmiş tarih / Max-Age 0) atar. */
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

const apps: FastifyInstance[] = []
afterEach(async () => {
  pinClock.now = () => Date.now()
  while (apps.length) await apps.pop()!.close()
})

async function makeApp(overrides: Partial<AppConfig> & { adminCode?: string | null } = {}) {
  const app = await createTestApp(overrides)
  apps.push(app)
  return app
}

interface Member {
  jar: Jar
  authURL: string
  call(method: 'GET' | 'POST', url: string, payload?: unknown, opts?: { auth?: boolean }): Promise<InjectResponse>
  boot(): Promise<BootContext>
}

async function member(app: FastifyInstance, vd?: string): Promise<Member> {
  const jar = new Jar()
  const vdHeader: Record<string, string> = vd ? { [HEADERS.VIRTUAL_DEVICE]: vd } : {}
  const res = await app.inject({ method: 'POST', url: ROUTES.LOGIN, headers: vdHeader, payload: {} })
  expect(res.statusCode).toBe(200)
  jar.take(res)
  const m: Member = {
    jar,
    authURL: res.json<BootContext>().authURL!,
    async call(method, url, payload, opts = {}) {
      const r = await app.inject({
        method,
        url,
        cookies: jar.cookies,
        headers: { ...vdHeader, ...(opts.auth === false ? {} : { [HEADERS.AUTH_URL]: m.authURL }) },
        ...(payload !== undefined ? { payload: payload as Record<string, unknown> } : {}),
      })
      jar.take(r)
      return r
    },
    async boot() {
      const r = await m.call('GET', ROUTES.BOOT)
      expect(r.statusCode).toBe(200)
      return r.json<BootContext>()
    },
  }
  return m
}

const unlock = (m: Member, code: string) => m.call('POST', ROUTES.ADMIN_UNLOCK, { code })

describe('yönetici kipi: açma', () => {
  it('yanlış kod 403, doğru kod çerez + boot.isAdmin; kod boşluk/tire/büyük-küçük harf duyarsız', async () => {
    const app = await makeApp()
    const m = await member(app)
    expect((await m.boot()).isAdmin).toBe(false)

    const bad = await unlock(m, 'yanlis-kod')
    expect(bad.statusCode).toBe(403)
    expect(bad.json().error).toMatchObject({ code: 'ADMIN_CODE_INVALID', message: 'Yönetici kodu yanlış.' })
    expect(bad.json().error.traceId).toBeTruthy()
    expect(m.jar.values.has(COOKIES.ADMIN)).toBe(false)

    const ok = await unlock(m, ` ${TEST_ADMIN_CODE.toLowerCase().replace(/-/g, ' ')} `)
    expect(ok.statusCode).toBe(200)
    expect(ok.json<AdminState>()).toEqual({ isAdmin: true })
    const set = ok.cookies.find((c) => c.name === COOKIES.ADMIN)!
    expect(set.httpOnly).toBe(true)
    expect(set.path).toBe('/')
    expect(set.sameSite).toBe('Lax')
    expect(set.maxAge).toBe(30 * 24 * 60 * 60)
    expect((await m.boot()).isAdmin).toBe(true)
  })

  it('üye değilse 401, authURL yoksa 403 CSRF_FAILED, gövde geçersizse 400', async () => {
    const app = await makeApp()
    const anon = await app.inject({ method: 'POST', url: ROUTES.ADMIN_UNLOCK, payload: { code: TEST_ADMIN_CODE } })
    expect(anon.statusCode).toBe(401)
    expect(anon.json().error.code).toBe('UNAUTHENTICATED')
    const m = await member(app)
    const csrf = await m.call('POST', ROUTES.ADMIN_UNLOCK, { code: TEST_ADMIN_CODE }, { auth: false })
    expect(csrf.statusCode).toBe(403)
    expect(csrf.json().error.code).toBe('CSRF_FAILED')
    for (const body of [{}, { code: '' }, { code: 42 }, { code: 'x'.repeat(500) }]) {
      const r = await m.call('POST', ROUTES.ADMIN_UNLOCK, body)
      expect(r.statusCode).toBe(400)
      expect(r.json().error.code).toBe('VALIDATION_FAILED')
    }
    expect((await m.boot()).isAdmin).toBe(false)
  })

  it(`${ADMIN_MAX_FAILS} yanlış denemede cihaz kilitlenir (429, doğru kodla bile); süre dolunca açılır`, async () => {
    const app = await makeApp()
    const m = await member(app)
    for (let i = 1; i < ADMIN_MAX_FAILS; i++) expect((await unlock(m, `yanlis-${i}`)).statusCode).toBe(403)
    const locked = await unlock(m, 'yanlis-son')
    expect(locked.statusCode).toBe(429)
    expect(locked.json().error.code).toBe('ADMIN_LOCKED')
    expect(locked.json().error.retryAfterSec).toBe(ADMIN_LOCK_MS / 1000)
    expect(locked.json().error.message).toContain('60 sn')
    expect(locked.headers['retry-after']).toBe('60')

    const stillLocked = await unlock(m, TEST_ADMIN_CODE)
    expect(stillLocked.statusCode).toBe(429)
    expect(stillLocked.json().error.retryAfterSec).toBeGreaterThan(0)
    expect((await m.boot()).isAdmin).toBe(false)

    // Kilit cihaza bağlıdır: başka cihaz etkilenmez
    const other = await member(app)
    expect((await unlock(other, TEST_ADMIN_CODE)).statusCode).toBe(200)

    const t0 = Date.now()
    pinClock.now = () => t0 + ADMIN_LOCK_MS + 1000
    expect((await unlock(m, TEST_ADMIN_CODE)).statusCode).toBe(200)
    expect((await m.boot()).isAdmin).toBe(true)
  })

  it('TVP_ADMIN_CODE=off (özet yok): 403 ADMIN_DISABLED', async () => {
    const app = await makeApp({ adminCode: null })
    const m = await member(app)
    const r = await unlock(m, TEST_ADMIN_CODE)
    expect(r.statusCode).toBe(403)
    expect(r.json().error.code).toBe('ADMIN_DISABLED')
    expect((await m.boot()).isAdmin).toBe(false)
  })
})

describe('yönetici kipi: çerez', () => {
  it('başka hesap ya da başka cihaz için basılmış, süresi dolmuş ya da kurcalanmış çerez geçmez', async () => {
    const app = await makeApp()
    const key = deriveKey(app.config, 'admin')
    const m = await member(app)
    const deviceId = m.jar.values.get(COOKIES.DEVICE)!
    const accountId = (await m.boot()).account!.accountId
    const tryCookie = async (value: string) => {
      m.jar.values.set(COOKIES.ADMIN, value)
      return (await m.boot()).isAdmin
    }
    expect(await tryCookie(encodeAdminToken(key, 'acc_baska', deviceId))).toBe(false)
    expect(await tryCookie(encodeAdminToken(key, accountId, 'f'.repeat(32)))).toBe(false)
    expect(await tryCookie(encodeAdminToken(deriveKey(app.config, 'cookie'), accountId, deviceId))).toBe(false)
    expect(await tryCookie(encodeAdminToken(key, accountId, deviceId, Date.now() - 10_000, 5_000))).toBe(false)
    expect(await tryCookie('v=1&exp=99999999999999&mac=AAAA')).toBe(false)
    // Kendi hesabı + cihazı için basılmış çerez geçer (biçimin doğruluğu)
    expect(await tryCookie(encodeAdminToken(key, accountId, deviceId))).toBe(true)
  })

  it('yalnız üyede okunur: oturum yoksa çerez bir şey açmaz', async () => {
    const app = await makeApp()
    const m = await member(app)
    expect((await unlock(m, TEST_ADMIN_CODE)).statusCode).toBe(200)
    const cookies = { ...m.jar.cookies }
    delete cookies[COOKIES.SESSION]
    delete cookies[COOKIES.SECURE]
    const r = await app.inject({ url: ROUTES.BOOT, cookies })
    expect(r.json<BootContext>().isAdmin).toBe(false)
  })

  it('verifyAdminToken saf işlev olarak hesap, cihaz ve süreyi bağlar', () => {
    const key = Buffer.from('k'.repeat(32))
    const t = encodeAdminToken(key, 'a', 'd', 1_000, 10_000)
    expect(verifyAdminToken(key, t, 'a', 'd', 5_000)).toBe(true)
    expect(verifyAdminToken(key, t, 'a', 'd', 11_001)).toBe(false)
    expect(verifyAdminToken(key, t, 'b', 'd', 5_000)).toBe(false)
    expect(verifyAdminToken(key, t, 'a', 'e', 5_000)).toBe(false)
    expect(verifyAdminToken(key, null, 'a', 'd', 5_000)).toBe(false)
  })

  it('kilitleme ve çıkış çerezi siler', async () => {
    const app = await makeApp()
    const m = await member(app)
    expect((await unlock(m, TEST_ADMIN_CODE)).statusCode).toBe(200)
    const lock = await m.call('POST', ROUTES.ADMIN_LOCK)
    expect(lock.statusCode).toBe(200)
    expect(lock.json<AdminState>()).toEqual({ isAdmin: false })
    expect(m.jar.values.has(COOKIES.ADMIN)).toBe(false)
    expect((await m.boot()).isAdmin).toBe(false)

    expect((await unlock(m, TEST_ADMIN_CODE)).statusCode).toBe(200)
    expect(m.jar.values.has(COOKIES.ADMIN)).toBe(true)
    const out = await m.call('POST', ROUTES.LOGOUT)
    expect(out.statusCode).toBe(200)
    expect(out.json<BootContext>().isAdmin).toBe(false)
    expect(m.jar.values.has(COOKIES.ADMIN)).toBe(false)
    // Yeniden giriş yönetici kipini kendiliğinden açmaz
    const again = await app.inject({ method: 'POST', url: ROUTES.LOGIN, cookies: m.jar.cookies, payload: {} })
    m.jar.take(again)
    expect((await m.boot()).isAdmin).toBe(false)
  })

  it('kilitleme de üye + authURL ister', async () => {
    const app = await makeApp()
    expect((await app.inject({ method: 'POST', url: ROUTES.ADMIN_LOCK })).statusCode).toBe(401)
    const m = await member(app)
    expect((await m.call('POST', ROUTES.ADMIN_LOCK, undefined, { auth: false })).statusCode).toBe(403)
  })

  it('sanal cihazda çerez adı ekli (tvpadm__tv) ve cihazlar birbirinden bağımsız', async () => {
    const app = await makeApp()
    const tv = await member(app, 'tv')
    expect((await unlock(tv, TEST_ADMIN_CODE)).statusCode).toBe(200)
    expect(tv.jar.values.has(`${COOKIES.ADMIN}__tv`)).toBe(true)
    expect(tv.jar.values.has(COOKIES.ADMIN)).toBe(false)
    expect((await tv.boot()).isAdmin).toBe(true)
  })
})

describe('yönetici kipi: yapılandırma', () => {
  const env = (vars: Record<string, string | undefined>, fn: () => void) => {
    const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]))
    try {
      for (const [k, v] of Object.entries(vars)) {
        if (v === undefined) delete process.env[k]
        else process.env[k] = v
      }
      fn()
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k]
        else process.env[k] = v
      }
    }
  }
  const cfg = () => loadConfig({ dataDir: mkdtempSync(join(tmpdir(), 'tvplus-adm-')), secret: 's' })

  it('TVP_ADMIN_CODE: verilmezse depodaki özet, "off" kapalı, verilirse düzleştirilmiş kodun özeti', () => {
    env({ TVP_ADMIN_CODE: undefined }, () => expect(cfg().adminCodeHash).toBe(DEFAULT_ADMIN_CODE_HASH))
    env({ TVP_ADMIN_CODE: 'off' }, () => expect(cfg().adminCodeHash).toBeNull())
    env({ TVP_ADMIN_CODE: 'ab-cd 12' }, () => expect(cfg().adminCodeHash).toBe(adminCodeHashOf('ABCD12')))
    expect(adminCodeHashOf('ab-cd 12')).toMatch(/^[0-9a-f]{64}$/)
  })

  it("TVP_STUDIO / TVP_DEBUG: verilmezse 'admin'; member | open | off olduğu gibi", () => {
    env({ TVP_STUDIO: undefined, TVP_DEBUG: undefined }, () => {
      expect(cfg().studioAccess).toBe('admin')
      expect(cfg().debugAccess).toBe('admin')
    })
    for (const level of ['member', 'open', 'off'] as const)
      env({ TVP_STUDIO: level, TVP_DEBUG: level }, () => {
        expect(cfg().studioAccess).toBe(level)
        expect(cfg().debugAccess).toBe(level)
      })
  })
})

describe("'admin' erişim düzeyi: stüdyo ve hata ayıklama kapıları", () => {
  const STUDIO = `${ROUTES.STUDIO}/communities`
  const DEBUG = '/api/debug/state'

  it('anonim 401 · üye 403 ADMIN_REQUIRED · yönetici 200 · stüdyo anahtarı yalnız stüdyoda 200', async () => {
    const app = await makeApp({ studioAccess: 'admin', debugAccess: 'admin', studioKey: 'gizli-anahtar' })
    for (const url of [STUDIO, DEBUG]) {
      const anon = await app.inject({ url })
      expect(anon.statusCode).toBe(401)
      expect(anon.json().error.code).toBe('UNAUTHENTICATED')
    }
    const m = await member(app)
    for (const url of [STUDIO, DEBUG]) {
      const r = await m.call('GET', url)
      expect(r.statusCode).toBe(403)
      expect(r.json().error).toMatchObject({ code: 'ADMIN_REQUIRED', message: 'Bu bölüm yalnız yöneticiye açık.' })
    }
    expect((await unlock(m, TEST_ADMIN_CODE)).statusCode).toBe(200)
    for (const url of [STUDIO, DEBUG]) expect((await m.call('GET', url)).statusCode).toBe(200)
    // Yönetici kipi kapanınca yeniden 403
    await m.call('POST', ROUTES.ADMIN_LOCK)
    expect((await m.call('GET', STUDIO)).statusCode).toBe(403)

    const key = { [HEADERS.STUDIO_KEY]: 'gizli-anahtar' }
    expect((await app.inject({ url: STUDIO, headers: key })).statusCode).toBe(200)
    expect((await app.inject({ url: DEBUG, headers: key })).statusCode).toBe(401)
  })

  it("'member' düzeyinde yönetici kipi gerekmez (önceki davranış)", async () => {
    const app = await makeApp({ studioAccess: 'member', debugAccess: 'member' })
    const m = await member(app)
    expect((await m.call('GET', STUDIO)).statusCode).toBe(200)
    expect((await m.call('GET', DEBUG)).statusCode).toBe(200)
  })
})
