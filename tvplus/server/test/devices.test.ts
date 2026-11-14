/**
 * Cihazlar arası uçlar: kayıt/liste/ad/silme, SSE akışı, kumanda komutları, durum bildirimi, TV'de kodla giriş.
 * SSE için gerçek bir dinleyici açılır (`app.listen({ port: 0 })`) ve akış fetch ile okunur.
 */
import { EventEmitter } from 'node:events'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import type { Response as InjectResponse } from 'light-my-request'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { COOKIES, HEADERS, TV_LOGIN_TTL_SEC } from '../../shared/constants'
import type {
  DeviceInfo,
  RemoteCommand,
  RemoteCommandEnvelope,
  TvLoginLookup,
  TvLoginPoll,
  TvLoginStart,
} from '../../shared/devices'
import type { BootContext } from '../../shared/types'
import { buildApp } from '../src/app'
import { createHub } from '../src/services/devices/hub'
import { devicesInternals } from '../src/services/devices/plugin'
import { defaultDeviceName, possessive, uniqueName } from '../src/services/devices/naming'
import { createTestApp } from './helpers'

/* ───────────── yardımcılar ───────────── */

const UA = {
  CHROME_MAC:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  IPHONE:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  TV: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
}

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
  get header(): string {
    return [...this.values].map(([k, v]) => `${k}=${v}`).join('; ')
  }
  get deviceId(): string {
    const id = this.values.get(COOKIES.DEVICE)
    if (!id) throw new Error('tvpvdid çerezi yok')
    return id
  }
}

interface Client {
  jar: Jar
  ua: string
  authURL: string | null
  boot: BootContext | null
  call(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    payload?: unknown,
    headers?: Record<string, string>,
  ): Promise<InjectResponse>
}

function client(app: FastifyInstance, ua: string = UA.CHROME_MAC): Client {
  const c: Client = {
    jar: new Jar(),
    ua,
    authURL: null,
    boot: null,
    async call(method, url, payload, headers = {}) {
      const res = await app.inject({
        method,
        url,
        cookies: c.jar.cookies,
        headers: { 'user-agent': c.ua, ...(c.authURL ? { [HEADERS.AUTH_URL]: c.authURL } : {}), ...headers },
        ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
      })
      c.jar.take(res)
      return res
    },
  }
  return c
}

/** Giriş + ilk profil seçimi; authURL'yi kaydeder. */
async function member(app: FastifyInstance, ua: string = UA.CHROME_MAC, profileIndex = 0): Promise<Client> {
  const c = client(app, ua)
  const login = await c.call('POST', '/api/login')
  expect(login.statusCode).toBe(200)
  const guid = login.json<BootContext>().profiles[profileIndex]!.guid
  const sw = await c.call('POST', '/api/profiles/switch', { guid })
  expect(sw.statusCode).toBe(200)
  c.boot = sw.json<BootContext>()
  c.authURL = c.boot.authURL
  return c
}

interface SseEvent {
  event: string
  data: unknown
}

interface SseStream {
  status: number
  headers: Headers
  events: SseEvent[]
  comments: string[]
  /** İlk eşleşen olayı tüketir (gelmediyse bekler). */
  next<T = unknown>(event: string, pred?: (data: T) => boolean, timeoutMs?: number): Promise<T>
  /** Akış sunucu tarafından kapanınca çözülür. */
  ended: Promise<void>
  close(): void
}

async function openStream(port: number, jar: Jar, path = '/api/devices/stream'): Promise<SseStream> {
  const ac = new AbortController()
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    headers: { cookie: jar.header, accept: 'text/event-stream' },
    signal: ac.signal,
  })
  const events: SseEvent[] = []
  const comments: string[] = []
  const waiters = new Set<() => void>()
  const notify = () => {
    for (const w of [...waiters]) w()
  }
  let resolveEnded!: () => void
  const ended = new Promise<void>((r) => (resolveEnded = r))
  const pump = async () => {
    if (!res.body) return resolveEnded()
    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let buf = ''
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        let i: number
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i)
          buf = buf.slice(i + 2)
          let event = 'message'
          const data: string[] = []
          for (const line of block.split('\n')) {
            if (line.startsWith(':')) comments.push(line.slice(1).trim())
            else if (line.startsWith('event:')) event = line.slice(6).trim()
            else if (line.startsWith('data:')) data.push(line.slice(5).trim())
          }
          if (data.length) events.push({ event, data: JSON.parse(data.join('\n')) })
        }
        notify()
      }
    } catch {
      /* iptal */
    }
    resolveEnded()
    notify()
  }
  void pump()
  let isEnded = false
  void ended.then(() => (isEnded = true))
  return {
    status: res.status,
    headers: res.headers,
    events,
    comments,
    ended,
    close: () => ac.abort(),
    next<T>(event: string, pred?: (data: T) => boolean, timeoutMs = 3000): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const check = () => {
          const idx = events.findIndex((e) => e.event === event && (!pred || pred(e.data as T)))
          if (idx >= 0) {
            const [e] = events.splice(idx, 1)
            cleanup()
            resolve(e!.data as T)
            return true
          }
          if (isEnded) {
            cleanup()
            reject(new Error(`akış kapandı, '${event}' gelmedi`))
            return true
          }
          return false
        }
        const timer = setTimeout(() => {
          cleanup()
          reject(new Error(`'${event}' olayı ${timeoutMs} ms içinde gelmedi`))
        }, timeoutMs)
        const cleanup = () => {
          clearTimeout(timer)
          waiters.delete(waiter)
        }
        const waiter = () => void check()
        if (!check()) waiters.add(waiter)
      })
    },
  }
}

interface Ctx {
  app: FastifyInstance
  port: number
  clock: { t: number }
}

/** Her describe kendi uygulamasını kurar (tek demo hesabı olduğundan cihaz listeleri birbirine karışmasın). */
function useApp(build: () => Promise<FastifyInstance> = () => createTestApp()): Ctx {
  const ctx = { clock: { t: Date.parse('2026-11-13T10:00:00Z') } } as Ctx
  beforeAll(async () => {
    ctx.app = await build()
    const internals = devicesInternals(ctx.app)
    internals.now = () => ctx.clock.t
    internals.lanAddress = () => '192.168.1.50'
    await ctx.app.listen({ port: 0, host: '127.0.0.1' })
    ctx.port = (ctx.app.server.address() as AddressInfo).port
  })
  afterAll(async () => {
    await ctx.app.close()
  })
  return ctx
}

const register = async (c: Client, kind: 'TV' | 'MOBILE' | 'WEB', name?: string) => {
  const res = await c.call('POST', '/api/devices/register', name ? { kind, name } : { kind })
  expect(res.statusCode).toBe(200)
  return res.json<{ device: DeviceInfo }>().device
}
const list = async (c: Client) => {
  const res = await c.call('GET', '/api/devices')
  expect(res.statusCode).toBe(200)
  return res.json<{ devices: DeviceInfo[] }>().devices
}
const errorCode = (res: InjectResponse) => res.json<{ error: { code: string } }>().error.code

/* ───────────── adlandırma ───────────── */

describe('cihaz adları', () => {
  it('Türkçe tamlayan ekini ünlü uyumuyla kurar', () => {
    expect(possessive('Deniz')).toBe("Deniz'in")
    expect(possessive('Ayşe')).toBe("Ayşe'nin")
    expect(possessive('Çocuk')).toBe("Çocuk'un")
    expect(possessive('Burak')).toBe("Burak'ın")
    expect(possessive('Ömür')).toBe("Ömür'ün")
    expect(possessive('Ali')).toBe("Ali'nin")
    expect(possessive('Oya')).toBe("Oya'nın")
  })
  it('türe ve tarayıcıya göre varsayılan ad üretir, çakışınca sıra ekler', () => {
    expect(defaultDeviceName('TV', UA.TV, null)).toBe('TV · Chrome')
    expect(defaultDeviceName('WEB', UA.CHROME_MAC, 'Deniz')).toBe('Web · Chrome · Mac')
    expect(defaultDeviceName('MOBILE', UA.IPHONE, 'Deniz')).toBe("Deniz'in telefonu")
    expect(defaultDeviceName('MOBILE', UA.IPHONE, null)).toBe('Telefon · Safari')
    expect(uniqueName('TV', ['TV', 'tv 2'])).toBe('TV 3')
    expect(uniqueName('TV', [])).toBe('TV')
  })
})

/* ───────────── kayıt / liste / ad / silme ───────────── */

describe('cihaz kaydı', () => {
  const ctx = useApp()

  it('üye olmayan kaydolamaz, listeleyemez, akış açamaz', async () => {
    const anon = client(ctx.app)
    expect((await anon.call('POST', '/api/devices/register', { kind: 'TV' })).statusCode).toBe(401)
    expect((await anon.call('GET', '/api/devices')).statusCode).toBe(401)
    expect((await anon.call('GET', '/api/devices/stream')).statusCode).toBe(401)
  })

  it('kaydeder, adlandırır, TV önce listeler; yeniden kayıt adı korur', async () => {
    const phone = await member(ctx.app, UA.IPHONE)
    const web = await member(ctx.app, UA.CHROME_MAC)
    const tv1 = await member(ctx.app, UA.TV)
    const tv2 = await member(ctx.app, UA.TV)

    expect((await register(phone, 'MOBILE')).name).toBe("Deniz'in telefonu")
    expect((await register(web, 'WEB')).name).toBe('Web · Chrome · Mac')
    expect((await register(tv1, 'TV')).name).toBe('TV · Chrome')
    const second = await register(tv2, 'TV')
    expect(second.name).toBe('TV · Chrome 2')
    expect(second.isThisDevice).toBe(true)
    expect(second.deviceId).toBe(tv2.jar.deviceId)
    expect(second.profileName).toBe('Deniz')
    // Yeniden kayıt (sayfa yenileme) adı değiştirmez.
    expect((await register(tv2, 'TV')).name).toBe('TV · Chrome 2')

    const devices = await list(phone)
    expect(devices.map((d) => d.name)).toEqual([
      'TV · Chrome',
      'TV · Chrome 2',
      "Deniz'in telefonu",
      'Web · Chrome · Mac',
    ])
    expect(devices.filter((d) => d.isThisDevice).map((d) => d.deviceId)).toEqual([phone.jar.deviceId])
    // Akış yok ve durum bildirilmedi → çevrimdışı
    expect(devices.every((d) => !d.online && d.screen === null && d.nowPlaying === null)).toBe(true)
  })

  it('verilen adı kullanır; geçersiz gövdeyi reddeder', async () => {
    const c = await member(ctx.app)
    expect((await register(c, 'TV', "  Salon   TV'si ")).name).toBe("Salon TV'si")
    expect((await c.call('POST', '/api/devices/register', { kind: 'FRIDGE' })).statusCode).toBe(400)
    expect((await c.call('POST', '/api/devices/register', { kind: 'TV', name: 'x'.repeat(41) })).statusCode).toBe(400)
  })

  it('ad değiştirme authURL ister; elle verilen ad yeniden kayıtta korunur', async () => {
    const owner = await member(ctx.app)
    const tv = await member(ctx.app, UA.TV)
    await register(tv, 'TV')
    const url = `/api/devices/${tv.jar.deviceId}`
    const noCsrf = await owner.call('PATCH', url, { name: 'Yatak odası' }, { [HEADERS.AUTH_URL]: 'bozuk' })
    expect(noCsrf.statusCode).toBe(403)
    const ok = await owner.call('PATCH', url, { name: 'Yatak odası' })
    expect(ok.statusCode).toBe(200)
    expect(ok.json<{ device: DeviceInfo }>().device).toMatchObject({ name: 'Yatak odası', isThisDevice: false })
    expect((await register(tv, 'TV')).name).toBe('Yatak odası')
    expect((await owner.call('PATCH', url, { name: '' })).statusCode).toBe(400)
    expect((await owner.call('PATCH', '/api/devices/yok', { name: 'A' })).statusCode).toBe(404)
  })

  it('silme oturumu kapatır (revokeDevice) ve kaydı kaldırır', async () => {
    const revoked: string[] = []
    const identity = ctx.app.services.identity
    const original = identity.revokeDevice
    identity.revokeDevice = (id) => void revoked.push(id)
    try {
      const owner = await member(ctx.app)
      const tv = await member(ctx.app, UA.TV)
      await register(tv, 'TV')
      const res = await owner.call('DELETE', `/api/devices/${tv.jar.deviceId}`)
      expect(res.statusCode).toBe(204)
      expect(revoked).toEqual([tv.jar.deviceId])
      expect((await list(owner)).some((d) => d.deviceId === tv.jar.deviceId)).toBe(false)
      expect((await owner.call('DELETE', `/api/devices/${tv.jar.deviceId}`)).statusCode).toBe(404)
    } finally {
      identity.revokeDevice = original
    }
  })
})

describe('hesap ayrımı', () => {
  // Tek demo hesabı var: `x-test-hesap: baska` başlıklı isteklerde pasaport başka bir hesaba çevrilir.
  const ctx = useApp(async () => {
    const app = await buildApp({
      dataDir: mkdtempSync(join(tmpdir(), 'tvplus-test-')),
      secret: 'test-secret',
      isTest: true,
      offline: true,
      logLevel: 'silent',
      debugAccess: 'open',
    })
    app.addHook('preHandler', async (req) => {
      const acc = req.passport?.account
      if (req.headers['x-test-hesap'] === 'baska' && acc) {
        req.passport = { ...req.passport, account: { ...acc, accountId: 'acc_baska' } }
      }
    })
    await app.ready()
    return app
  })
  const other = { 'x-test-hesap': 'baska' }

  it('başka hesabın cihazı görünmez ve 404 döner', async () => {
    const mine = await member(ctx.app)
    const theirs = await member(ctx.app, UA.TV)
    const res = await theirs.call('POST', '/api/devices/register', { kind: 'TV' }, other)
    expect(res.statusCode).toBe(200)
    const theirId = theirs.jar.deviceId
    await register(mine, 'WEB')

    expect((await list(mine)).map((d) => d.deviceId)).toEqual([mine.jar.deviceId])
    const theirList = (await theirs.call('GET', '/api/devices', undefined, other)).json<{ devices: DeviceInfo[] }>()
    expect(theirList.devices.map((d) => d.deviceId)).toEqual([theirId])

    expect((await mine.call('PATCH', `/api/devices/${theirId}`, { name: 'Benim' })).statusCode).toBe(404)
    expect((await mine.call('DELETE', `/api/devices/${theirId}`)).statusCode).toBe(404)
    const cmd = await mine.call('POST', `/api/devices/${theirId}/command`, { type: 'KEY', key: 'OK' })
    expect(cmd.statusCode).toBe(404)
    // TRANSFER hedefi de hesaba ait olmalı
    const transfer = await mine.call('POST', `/api/devices/${mine.jar.deviceId}/command`, {
      type: 'TRANSFER',
      toDeviceId: theirId,
    })
    expect(transfer.statusCode).toBe(400)
  })
})

/* ───────────── SSE akışı, komutlar, durum ───────────── */

describe('akış ve komutlar', () => {
  const ctx = useApp()
  const streams: SseStream[] = []
  const open = async (c: Client) => {
    const s = await openStream(ctx.port, c.jar)
    streams.push(s)
    return s
  }
  afterEach(() => {
    for (const s of streams.splice(0)) s.close()
  })

  it('hello ve ilk liste gelir; başlıklar SSE', async () => {
    const a = await member(ctx.app)
    await register(a, 'MOBILE')
    const s = await open(a)
    expect(s.status).toBe(200)
    expect(s.headers.get('content-type')).toBe('text/event-stream')
    expect(s.headers.get('cache-control')).toBe('no-store')
    expect(s.headers.get('x-accel-buffering')).toBe('no')
    expect(await s.next<{ deviceId: string }>('hello')).toEqual({ deviceId: a.jar.deviceId })
    const first = await s.next<{ devices: DeviceInfo[] }>('devices')
    expect(first.devices.find((d) => d.isThisDevice)?.online).toBe(true)
  })

  it('kayıt, akış ve durum bildirimi hesaptaki akışlara `devices` olarak yayılır', async () => {
    const a = await member(ctx.app, UA.IPHONE)
    await register(a, 'MOBILE')
    const sa = await open(a)
    await sa.next('hello')

    const b = await member(ctx.app, UA.TV)
    await register(b, 'TV')
    const seen = await sa.next<{ devices: DeviceInfo[] }>('devices', (d) =>
      d.devices.some((x) => x.deviceId === b.jar.deviceId),
    )
    expect(seen.devices[0]!.kind).toBe('TV')

    const sb = await open(b)
    await sb.next('hello')
    await sa.next<{ devices: DeviceInfo[] }>('devices', (d) =>
      d.devices.some((x) => x.deviceId === b.jar.deviceId && x.online),
    )

    const nowPlaying = {
      viewableId: 'Video:80010001',
      title: 'Sintel',
      subtitle: null,
      artUrl: null,
      live: false,
      positionSec: 42,
      durationSec: 888,
      paused: false,
      volume: 80,
      muted: false,
      updatedAt: new Date(ctx.clock.t).toISOString(),
    }
    const st = await b.call('POST', '/api/devices/state', { screen: 'player', nowPlaying })
    expect(st.statusCode).toBe(204)
    const upd = await sa.next<{ devices: DeviceInfo[] }>('devices', (d) =>
      d.devices.some((x) => x.deviceId === b.jar.deviceId && x.screen === 'player'),
    )
    const tv = upd.devices.find((x) => x.deviceId === b.jar.deviceId)!
    expect(tv.nowPlaying).toEqual(nowPlaying)
    expect(tv.isThisDevice).toBe(false)

    // B'nin akışı kapanınca A çevrimdışı olduğunu görür (durum bildirimi 30 sn sonra eskir).
    sb.close()
    ctx.clock.t += 31_000
    const off = await sa.next<{ devices: DeviceInfo[] }>('devices', (d) =>
      d.devices.some((x) => x.deviceId === b.jar.deviceId && !x.online),
    )
    expect(off.devices.find((x) => x.deviceId === b.jar.deviceId)!.nowPlaying).toBeNull()
  })

  it('durum bildirimi: doğrulama, kayıt şartı; akışsız cihaz 30 sn çevrimiçi sayılır', async () => {
    const a = await member(ctx.app)
    const bad = await a.call('POST', '/api/devices/state', { screen: 'home', nowPlaying: null })
    expect(bad.statusCode).toBe(404)
    await register(a, 'WEB')
    expect((await a.call('POST', '/api/devices/state', { screen: 'mutfak', nowPlaying: null })).statusCode).toBe(400)
    const big = { screen: 'player', nowPlaying: { viewableId: 'Video:1', title: 'x'.repeat(201) } }
    expect((await a.call('POST', '/api/devices/state', big)).statusCode).toBe(400)
    expect((await a.call('POST', '/api/devices/state', { screen: 'home', nowPlaying: null })).statusCode).toBe(204)
    const me = (await list(a)).find((d) => d.isThisDevice)!
    expect(me).toMatchObject({ online: true, screen: 'home' })
    ctx.clock.t += 31_000
    expect((await list(a)).find((d) => d.isThisDevice)!.online).toBe(false)
  })

  it('komut hedefin tüm sekmelerine zarf olarak gider; kendine komut serbest', async () => {
    const phone = await member(ctx.app, UA.IPHONE)
    await register(phone, 'MOBILE')
    const tv = await member(ctx.app, UA.TV)
    await register(tv, 'TV')
    const tab1 = await open(tv)
    const tab2 = await open(tv)
    await tab1.next('hello')
    await tab2.next('hello')

    const commands: RemoteCommand[] = [
      { type: 'KEY', key: 'OK' },
      { type: 'TEXT', text: 'yeşil vadi', submit: true },
      { type: 'CAST', viewableId: 'Channel:trt1', positionSec: 0 },
    ]
    for (const command of commands) {
      const res = await phone.call('POST', `/api/devices/${tv.jar.deviceId}/command`, command)
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ delivered: true })
      for (const tab of [tab1, tab2]) {
        const env = await tab.next<RemoteCommandEnvelope>('command')
        expect(env.command).toEqual(command)
        expect(env.from).toMatchObject({ deviceId: phone.jar.deviceId, kind: 'MOBILE' })
        expect(env.from.name).toMatch(/^Deniz'in telefonu( \d+)?$/)
        expect(env.id).toMatch(/^[0-9a-f-]{36}$/)
        expect(typeof env.at).toBe('string')
      }
    }

    // Kendine komut
    const self = await tv.call('POST', `/api/devices/${tv.jar.deviceId}/command`, { type: 'STOP' })
    expect(self.json()).toEqual({ delivered: true })
    expect((await tab1.next<RemoteCommandEnvelope>('command')).from.deviceId).toBe(tv.jar.deviceId)

    // Akışı olmayan (kayıtlı) cihaz: teslim edilmedi
    const off = await phone.call('POST', `/api/devices/${phone.jar.deviceId}/command`, { type: 'STOP' })
    expect(off.json()).toEqual({ delivered: false })
  })

  it('komut authURL ister ve her türü katı doğrular', async () => {
    const phone = await member(ctx.app)
    await register(phone, 'MOBILE')
    const tv = await member(ctx.app, UA.TV)
    await register(tv, 'TV')
    const url = `/api/devices/${tv.jar.deviceId}/command`
    const csrf = await phone.call('POST', url, { type: 'STOP' }, { [HEADERS.AUTH_URL]: 'bozuk' })
    expect(csrf.statusCode).toBe(403)

    const invalid: unknown[] = [
      { type: 'KEY', key: 'POWER' },
      { type: 'KEY' },
      { type: 'KEY', key: 'OK', extra: 1 },
      { type: 'TEXT', text: 'x'.repeat(201) },
      { type: 'TEXT', text: 5 },
      { type: 'CAST', viewableId: 'Video:1 2' },
      { type: 'CAST', viewableId: 'Person:1' },
      { type: 'CAST', viewableId: 'Video:1', positionSec: -1 },
      { type: 'SEEK', positionSec: -5 },
      { type: 'SEEK' },
      { type: 'VOLUME', volume: 101 },
      { type: 'VOLUME', volume: -1 },
      { type: 'NAVIGATE', route: 'canli' },
      { type: 'NAVIGATE', route: '//evil.example/x' },
      { type: 'NAVIGATE', route: 'https://evil.example/' },
      { type: 'NAVIGATE', route: '/x?u=https://evil.example' },
      { type: 'NAVIGATE', route: '/javascript:alert(1)' },
      { type: 'NAVIGATE', route: '/a\nb' },
      { type: 'TRANSFER', toDeviceId: 'bilinmeyen' },
      { type: 'TRANSFER' },
      { type: 'REBOOT' },
      {},
    ]
    for (const body of invalid) {
      const res = await phone.call('POST', url, body as Record<string, unknown>)
      expect(res.statusCode, JSON.stringify(body)).toBe(400)
      expect(errorCode(res)).toBe('INVALID_COMMAND')
    }
    const valid: RemoteCommand[] = [
      { type: 'SEEK', positionSec: 120.5 },
      { type: 'VOLUME', volume: 0 },
      { type: 'NAVIGATE', route: '/ara?q=yeşil vadi' },
      { type: 'TRANSFER', toDeviceId: phone.jar.deviceId },
      { type: 'CAST', viewableId: 'Airing:trt1-20261113-2000', startOver: true, tctx: 'abc' },
      { type: 'TEXT', text: '' },
    ]
    for (const body of valid) {
      const res = await phone.call('POST', url, body)
      expect(res.statusCode, JSON.stringify(body)).toBe(200)
    }
  })

  it('denetleyen başına hız sınırı: 60 komutluk patlamadan sonra 429', async () => {
    const phone = await member(ctx.app)
    await register(phone, 'MOBILE')
    const url = `/api/devices/${phone.jar.deviceId}/command`
    for (let i = 0; i < 60; i++) {
      expect((await phone.call('POST', url, { type: 'KEY', key: 'UP' })).statusCode).toBe(200)
    }
    const limited = await phone.call('POST', url, { type: 'KEY', key: 'UP' })
    expect(limited.statusCode).toBe(429)
    expect(Number(limited.headers['retry-after'])).toBeGreaterThanOrEqual(1)
    // Bir saniyede 30 jeton dolar
    ctx.clock.t += 1000
    expect((await phone.call('POST', url, { type: 'KEY', key: 'UP' })).statusCode).toBe(200)
  })

  it('cihaz silinince akışlarına signout gider ve akış kapanır', async () => {
    const owner = await member(ctx.app)
    const tv = await member(ctx.app, UA.TV)
    await register(tv, 'TV')
    const s = await open(tv)
    await s.next('hello')
    expect((await owner.call('DELETE', `/api/devices/${tv.jar.deviceId}`)).statusCode).toBe(204)
    expect(await s.next('signout')).toEqual({})
    await s.ended
  })

  it("15 sn'de bir ping yorumu yollar", async () => {
    vi.useFakeTimers()
    try {
      const writes: string[] = []
      const emitter = new EventEmitter()
      const res = Object.assign(emitter, {
        writableEnded: false,
        destroyed: false,
        write: (chunk: string) => void writes.push(chunk),
        end: () => {
          res.writableEnded = true
          emitter.emit('close')
        },
      })
      const hub = createHub()
      let closed = 0
      hub.open('d1', 'a1', res as never, () => void closed++)
      vi.advanceTimersByTime(15_000)
      expect(writes).toEqual([': ping\n\n'])
      hub.closeAll()
      expect(closed).toBe(1)
      vi.advanceTimersByTime(30_000)
      expect(writes).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })
})

/* ───────────── TV'de kodla giriş ───────────── */

describe("TV'de kodla giriş", () => {
  const ctx = useApp()
  const fakeBoot = { membershipStatus: 'CURRENT_MEMBER', esn: 'TVPWCH-LX-SAHTE' } as unknown as BootContext
  let calls: { accountId: string; profileGuid?: string | null; deviceId: string }[] = []
  let original: FastifyInstance['services']['identity']['loginDevice']

  beforeEach(() => {
    calls = []
    const identity = ctx.app.services.identity
    original = identity.loginDevice
    identity.loginDevice = async (req, _reply, opts) => {
      calls.push({ ...opts, deviceId: req.passport.deviceId })
      return fakeBoot
    }
  })
  afterEach(() => {
    ctx.app.services.identity.loginDevice = original
  })

  const start = async (tv: Client, headers: Record<string, string> = {}) => {
    const res = await tv.call('POST', '/api/tv/login/start', {}, { host: 'localhost:8787', ...headers })
    expect(res.statusCode).toBe(200)
    return res.json<TvLoginStart>()
  }
  const poll = async (tv: Client, deviceCode: string) => {
    ctx.clock.t += 2000
    return tv.call('POST', '/api/tv/login/poll', { deviceCode })
  }

  it('baştan sona: başlat → QR → sorgula → onayla → yokla APPROVED (loginDevice bir kez) → ikinci yoklama EXPIRED', async () => {
    const tv = client(ctx.app, UA.TV)
    const s = await start(tv)
    expect(s.userCode).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/)
    expect(Buffer.from(s.deviceCode, 'base64url').length).toBeGreaterThanOrEqual(32)
    const bare = s.userCode.replace('-', '')
    // localhost → makinenin ağ adresi, aynı kapı
    expect(s.verificationUrl).toBe(`http://192.168.1.50:8787/#/bagla?kod=${bare}`)
    expect(s.qrUrl).toBe(`/api/tv/login/qr.svg?kod=${bare}`)
    expect(s).toMatchObject({ expiresInSec: TV_LOGIN_TTL_SEC, intervalSec: 2 })

    const qr = await tv.call('GET', s.qrUrl)
    expect(qr.statusCode).toBe(200)
    expect(qr.headers['content-type']).toMatch(/^image\/svg\+xml/)
    expect(qr.headers['cache-control']).toBe('no-store')
    expect(qr.body).toContain('<svg')
    expect(qr.body).toContain('#000000')

    expect((await poll(tv, s.deviceCode)).json<TvLoginPoll>()).toEqual({ status: 'PENDING' })

    const phone = await member(ctx.app, UA.IPHONE)
    const look = await phone.call('GET', `/api/tv/login/lookup?kod=${s.userCode.toLowerCase()}`)
    expect(look.statusCode).toBe(200)
    expect(look.json<TvLoginLookup>()).toMatchObject({
      userCode: s.userCode,
      deviceName: 'TV · Chrome',
      deviceKind: 'TV',
    })

    const guid = phone.boot!.activeProfile!.guid
    const ok = await phone.call('POST', '/api/tv/login/approve', { userCode: s.userCode, profileGuid: guid })
    expect(ok.statusCode).toBe(200)
    expect(ok.json()).toEqual({ ok: true, deviceId: tv.jar.deviceId })
    // Kod tek kullanımlık
    expect((await phone.call('GET', `/api/tv/login/lookup?kod=${bare}`)).statusCode).toBe(404)
    expect((await phone.call('POST', '/api/tv/login/approve', { userCode: bare })).statusCode).toBe(404)

    // Hesabın profillerine bildirim
    const notes = ctx.app.services.notifications.list(guid)
    expect(
      notes.some((n) => n.title === 'Yeni cihazda oturum açıldı' && n.body === 'TV · Chrome hesabına bağlandı.'),
    ).toBe(true)

    const approved = await poll(tv, s.deviceCode)
    expect(approved.json<TvLoginPoll>()).toEqual({ status: 'APPROVED', boot: fakeBoot })
    expect(calls).toEqual([{ accountId: 'acc_demo', profileGuid: guid, deviceId: tv.jar.deviceId }])
    expect((await poll(tv, s.deviceCode)).json<TvLoginPoll>()).toEqual({ status: 'EXPIRED' })
    expect(calls).toHaveLength(1)
    // TV hesabın cihaz listesinde
    expect((await list(phone)).find((d) => d.deviceId === tv.jar.deviceId)?.name).toBe('TV · Chrome')
  })

  it('onay authURL ister; profil hesaba ait olmalı', async () => {
    const tv = client(ctx.app, UA.TV)
    const s = await start(tv)
    const phone = await member(ctx.app)
    const csrf = await phone.call(
      'POST',
      '/api/tv/login/approve',
      { userCode: s.userCode },
      { [HEADERS.AUTH_URL]: 'x' },
    )
    expect(csrf.statusCode).toBe(403)
    const bad = await phone.call('POST', '/api/tv/login/approve', { userCode: s.userCode, profileGuid: 'yok' })
    expect(bad.statusCode).toBe(404)
    expect(errorCode(bad)).toBe('PROFILE_NOT_FOUND')
    const anon = client(ctx.app)
    expect((await anon.call('GET', `/api/tv/login/lookup?kod=${s.userCode}`)).statusCode).toBe(401)
  })

  it('reddedilen kod DENIED döner, sonra EXPIRED', async () => {
    const tv = client(ctx.app, UA.TV)
    const s = await start(tv)
    const phone = await member(ctx.app)
    expect((await phone.call('POST', '/api/tv/login/deny', { userCode: s.userCode })).json()).toEqual({ ok: true })
    expect((await poll(tv, s.deviceCode)).json<TvLoginPoll>()).toEqual({ status: 'DENIED' })
    expect((await poll(tv, s.deviceCode)).json<TvLoginPoll>()).toEqual({ status: 'EXPIRED' })
    expect(calls).toHaveLength(0)
  })

  it('süresi dolan kod EXPIRED; sorgu 404', async () => {
    const tv = client(ctx.app, UA.TV)
    const s = await start(tv)
    ctx.clock.t += TV_LOGIN_TTL_SEC * 1000 + 1
    const phone = await member(ctx.app)
    expect((await phone.call('GET', `/api/tv/login/lookup?kod=${s.userCode}`)).statusCode).toBe(404)
    expect((await poll(tv, s.deviceCode)).json<TvLoginPoll>()).toEqual({ status: 'EXPIRED' })
  })

  it('aralıktan sık yoklama 429 + retry-after; başka cihazdan yoklama EXPIRED', async () => {
    const tv = client(ctx.app, UA.TV)
    const s = await start(tv)
    expect((await poll(tv, s.deviceCode)).statusCode).toBe(200)
    const fast = await tv.call('POST', '/api/tv/login/poll', { deviceCode: s.deviceCode })
    expect(fast.statusCode).toBe(429)
    expect(fast.headers['retry-after']).toBe('2')
    const thief = client(ctx.app, UA.TV)
    expect((await poll(thief, s.deviceCode)).json<TvLoginPoll>()).toEqual({ status: 'EXPIRED' })
  })

  it('10 yanlış denemeden sonra doğru kod da 429', async () => {
    const tv = client(ctx.app, UA.TV)
    const s = await start(tv)
    const guesser = await member(ctx.app)
    // Hesap anahtarı ortak olduğundan önceki testlerin hesabını etkilememek için saati ilerlet.
    ctx.clock.t += 11 * 60_000
    const fresh = await start(tv)
    for (let i = 0; i < 10; i++) {
      const res = await guesser.call('GET', `/api/tv/login/lookup?kod=AAAA-AAA${i % 8 === 0 ? 'B' : 'C'}`)
      expect(res.statusCode).toBe(404)
    }
    const blocked = await guesser.call('GET', `/api/tv/login/lookup?kod=${fresh.userCode}`)
    expect(blocked.statusCode).toBe(429)
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0)
    expect((await guesser.call('POST', '/api/tv/login/approve', { userCode: fresh.userCode })).statusCode).toBe(429)
    ctx.clock.t += 10 * 60_000
    // Pencere geçti (bu arada ilk kodun da süresi doldu; ikincisi hâlâ geçerli değil → 404)
    expect((await guesser.call('GET', `/api/tv/login/lookup?kod=${s.userCode}`)).statusCode).toBe(404)
  })

  it('x-forwarded-proto/host ve TVP_PUBLIC_ORIGIN', async () => {
    const tv = client(ctx.app, UA.TV)
    const fwd = await start(tv, { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'tv.example.com' })
    expect(fwd.verificationUrl.startsWith('https://tv.example.com/#/bagla?kod=')).toBe(true)
    ctx.clock.t += 60_000
    const lan = await start(tv, { host: '10.0.0.7:5173' })
    expect(lan.verificationUrl.startsWith('http://10.0.0.7:5173/#/')).toBe(true)
    process.env.TVP_PUBLIC_ORIGIN = 'https://tvplus.ornek.com.tr/'
    try {
      ctx.clock.t += 60_000
      const env = await start(tv)
      expect(env.verificationUrl.startsWith('https://tvplus.ornek.com.tr/#/bagla?kod=')).toBe(true)
    } finally {
      delete process.env.TVP_PUBLIC_ORIGIN
    }
  })

  it('sanal cihaz adı (vd) doğrulama adresine taşınmaz', async () => {
    const tv = client(ctx.app, UA.TV)
    ctx.clock.t += 60_000
    const s = await start(tv, { [HEADERS.VIRTUAL_DEVICE]: 'tv' })
    expect(s.verificationUrl).not.toContain('vd=')
    ctx.clock.t += 60_000
    const res = await tv.call('POST', '/api/tv/login/start?vd=tv', {}, { host: 'localhost:8787' })
    expect(res.json<TvLoginStart>().verificationUrl).not.toContain('vd=')
  })
})
