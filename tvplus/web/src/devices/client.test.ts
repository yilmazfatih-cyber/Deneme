/**
 * Cihaz istemcisi çekirdeği: sahte fetch, EventSource, saat ve depolamayla — yeniden bağlanma, komut dağıtım sırası,
 * durum bildirimi kısıtlaması, hedef seçimi, hata eşlemesi.
 */
import { describe, expect, it } from 'vitest'
import type { DeviceInfo, NowPlaying, RemoteCommandEnvelope } from '../../../shared/devices'
import type { BootContext } from '../../../shared/types'
import {
  BACKOFF_MAX_MS,
  createDeviceClient,
  type DeviceClientDeps,
  type EventSourceLike,
  type KeyValueStorage,
} from './client-core'

class FakeEventSource implements EventSourceLike {
  url: string
  closed = false
  listeners = new Map<string, ((ev: MessageEvent) => void)[]>()
  constructor(url: string) {
    this.url = url
  }
  addEventListener(type: string, listener: (ev: MessageEvent) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }
  close(): void {
    this.closed = true
  }
  fire(type: string, data?: unknown): void {
    const ev = { data: data === undefined ? '' : JSON.stringify(data) } as MessageEvent
    for (const l of this.listeners.get(type) ?? []) l(ev)
  }
}

interface Call {
  url: string
  method: string
  body: unknown
  headers: Record<string, string>
}

type Responder = (call: Call) => Response | Promise<Response>

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const device = (over: Partial<DeviceInfo> & { deviceId: string }): DeviceInfo => ({
  kind: 'TV',
  name: over.deviceId,
  online: true,
  isThisDevice: false,
  lastSeenAt: '2026-11-13T10:00:00.000Z',
  profileName: null,
  screen: null,
  nowPlaying: null,
  ...over,
})

const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise<void>((r) => setTimeout(r, 0))
}

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  }
}

function setup(opts: { responder?: Responder; storage?: KeyValueStorage | null } = {}) {
  let t = 1_000_000
  const timers: { id: number; at: number; fn: () => void }[] = []
  let seq = 0
  const calls: Call[] = []
  const sources: FakeEventSource[] = []
  const events: { label: string; detail?: Record<string, unknown>; ok: boolean }[] = []
  const applied: BootContext[] = []
  let refreshed = 0
  const thisDevice = device({ deviceId: 'ben', kind: 'MOBILE', isThisDevice: true, name: 'Telefon' })
  let responder: Responder =
    opts.responder ??
    ((call) => {
      if (call.url.endsWith('/register')) return json({ device: thisDevice })
      if (call.url.endsWith('/state')) return new Response(null, { status: 204 })
      return json({ delivered: true })
    })

  const deps: DeviceClientDeps = {
    fetch: async (input, init) => {
      const headers = (init?.headers ?? {}) as Record<string, string>
      const call: Call = {
        url: input,
        method: init?.method ?? 'GET',
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
        headers,
      }
      calls.push(call)
      return responder(call)
    },
    openEventSource: (url) => {
      const s = new FakeEventSource(url)
      sources.push(s)
      return s
    },
    headers: () => ({ 'x-tvplus-vd': 'telefon', 'x-tvplus-authurl': 'tok' }),
    apiUrl: (p) => `${p}?vd=telefon`,
    applyBoot: (b) => void applied.push(b),
    refreshBoot: async () => void refreshed++,
    storage: opts.storage === undefined ? memoryStorage() : opts.storage,
    storageKey: 'tvp.cihaz.hedef.telefon',
    emit: (label, detail, o) => void events.push({ label, detail, ok: o?.ok ?? true }),
    setTimeout: (fn, ms) => {
      const id = ++seq
      timers.push({ id, at: t + ms, fn })
      return id
    },
    clearTimeout: (h) => {
      const i = timers.findIndex((x) => x.id === h)
      if (i >= 0) timers.splice(i, 1)
    },
    now: () => t,
  }
  const advance = async (ms: number) => {
    const end = t + ms
    for (;;) {
      timers.sort((a, b) => a.at - b.at)
      const next = timers[0]
      if (!next || next.at > end) break
      timers.shift()
      t = next.at
      next.fn()
      await flush()
    }
    t = end
    await flush()
  }
  const client = createDeviceClient(deps)
  return {
    client,
    deps,
    calls,
    sources,
    events,
    applied,
    timers,
    advance,
    get refreshed() {
      return refreshed
    },
    setResponder: (r: Responder) => (responder = r),
    last: () => sources[sources.length - 1]!,
  }
}

describe('başlatma ve akış', () => {
  it('önce kaydolur, sonra akışı sanal cihaz adresiyle açar; yinelenen start yok sayılır', async () => {
    const s = setup()
    const seen: number[] = []
    s.client.subscribe(() => seen.push(1))
    s.client.start({ kind: 'MOBILE' })
    s.client.start({ kind: 'MOBILE' })
    expect(s.client.getState().connection).toBe('connecting')
    await flush()
    expect(s.calls.map((c) => [c.method, c.url])).toEqual([['POST', '/api/devices/register']])
    expect(s.calls[0]!.body).toEqual({ kind: 'MOBILE' })
    expect(s.calls[0]!.headers).toMatchObject({ 'x-tvplus-vd': 'telefon', 'content-type': 'application/json' })
    expect(s.sources.map((x) => x.url)).toEqual(['/api/devices/stream?vd=telefon'])
    expect(s.client.getState().thisDevice?.deviceId).toBe('ben')

    s.last().fire('hello', { deviceId: 'ben' })
    expect(s.client.getState().connection).toBe('online')
    s.last().fire('devices', {
      devices: [
        device({ deviceId: 'ben', kind: 'MOBILE', isThisDevice: true, name: 'Telefon' }),
        device({ deviceId: 'w', kind: 'WEB', name: 'Bilgisayar' }),
        device({ deviceId: 'tv2', name: 'Yatak odası' }),
        device({ deviceId: 'tv1', name: 'Salon' }),
      ],
    })
    expect(s.client.getState().devices.map((d) => d.deviceId)).toEqual(['tv1', 'tv2', 'w', 'ben'])
    expect(seen.length).toBeGreaterThan(0)
    expect(s.events.map((e) => e.label)).toEqual(['kayıt', 'akış açık'])
  })

  it('anlık görüntü değişiklik olmadan aynı nesnedir', async () => {
    const s = setup()
    const a = s.client.getState()
    expect(s.client.getState()).toBe(a)
    s.client.setTarget(null)
    expect(s.client.getState()).toBe(a)
    s.client.start({ kind: 'WEB' })
    expect(s.client.getState()).not.toBe(a)
    const b = s.client.getState()
    expect(s.client.getState()).toBe(b)
  })

  it('kopunca 1 sn → 2 → 4 … 15 sn bekleyip yeniden kaydolur; hello beklemeyi sıfırlar', async () => {
    const s = setup()
    s.client.start({ kind: 'TV' })
    await flush()
    s.last().fire('hello', { deviceId: 'ben' })

    const delays: number[] = []
    for (let i = 0; i < 6; i++) {
      const before = s.sources.length
      const src = s.last()
      src.fire('error')
      expect(src.closed).toBe(true)
      expect(s.client.getState().connection).toBe('offline')
      const at = s.timers[0]!.at
      delays.push(at - s.deps.now())
      await s.advance(at - s.deps.now())
      expect(s.sources.length).toBe(before + 1)
    }
    expect(delays).toEqual([1000, 2000, 4000, 8000, BACKOFF_MAX_MS, BACKOFF_MAX_MS])
    expect(s.calls.filter((c) => c.url.endsWith('/register'))).toHaveLength(7)
    expect(s.events.some((e) => e.label === 'akış koptu' && !e.ok)).toBe(true)

    s.last().fire('hello', { deviceId: 'ben' })
    expect(s.client.getState().connection).toBe('online')
    s.last().fire('error')
    expect(s.timers[0]!.at - s.deps.now()).toBe(1000)
  })

  it('kayıt başarısızsa yeniden dener; stop sonrası yeniden bağlanmaz', async () => {
    let fail = true
    const s = setup({
      responder: (c) =>
        fail && c.url.endsWith('/register')
          ? json({ error: { code: 'INTERNAL' } }, 500)
          : json({ device: device({ deviceId: 'ben', isThisDevice: true }) }),
    })
    s.client.start({ kind: 'TV' })
    await flush()
    expect(s.sources).toHaveLength(0)
    expect(s.client.getState().connection).toBe('offline')
    fail = false
    await s.advance(1000)
    expect(s.sources).toHaveLength(1)

    s.last().fire('error')
    s.client.stop()
    expect(s.client.getState()).toMatchObject({ connection: 'idle', devices: [], thisDevice: null })
    await s.advance(60_000)
    expect(s.sources).toHaveLength(1)
  })

  it('signout olayında akışı kapatır ve açılış bağlamını yeniler', async () => {
    const s = setup()
    s.client.start({ kind: 'TV' })
    await flush()
    s.last().fire('signout', {})
    await flush()
    expect(s.last().closed).toBe(true)
    expect(s.client.getState().connection).toBe('idle')
    expect(s.refreshed).toBe(1)
  })
})

describe('komutlar', () => {
  const envelope = (n: number): RemoteCommandEnvelope => ({
    id: `id-${n}`,
    at: '2026-11-13T10:00:00.000Z',
    from: { deviceId: 'tel', name: 'Telefon', kind: 'MOBILE' },
    command: { type: 'KEY', key: 'OK' },
  })

  it('işleyiciler son eklenenden başlayarak, biri true dönene kadar çağrılır', async () => {
    const s = setup()
    s.client.start({ kind: 'TV' })
    await flush()
    const order: string[] = []
    s.client.onCommand(() => void order.push('ilk'))
    const offMiddle = s.client.onCommand(() => {
      order.push('orta')
      return true
    })
    s.client.onCommand(() => {
      order.push('son')
      throw new Error('bozuk işleyici')
    })
    s.last().fire('command', envelope(1))
    expect(order).toEqual(['son', 'orta'])

    order.length = 0
    offMiddle()
    s.last().fire('command', envelope(2))
    expect(order).toEqual(['son', 'ilk'])
    expect(s.events.filter((e) => e.label === 'komut ← Telefon')).toHaveLength(2)
  })

  it('sendCommand oturum başlıklarıyla JSON yollar; hata kodunu Error olarak fırlatır', async () => {
    const s = setup()
    expect(await s.client.sendCommand('tv 1', { type: 'KEY', key: 'UP' })).toBe(true)
    const call = s.calls[0]!
    expect(call).toMatchObject({ method: 'POST', url: '/api/devices/tv%201/command', body: { type: 'KEY', key: 'UP' } })
    expect(call.headers).toMatchObject({ 'x-tvplus-authurl': 'tok', 'content-type': 'application/json' })
    expect(s.events.at(-1)).toMatchObject({ label: 'komut → tv 1', ok: true })

    s.setResponder(() => json({ error: { code: 'RATE_LIMITED', message: 'x' } }, 429))
    await expect(s.client.sendCommand('tv', { type: 'STOP' })).rejects.toThrow('RATE_LIMITED')
    s.setResponder(() => new Response('<html>', { status: 502 }))
    await expect(s.client.sendCommand('tv', { type: 'STOP' })).rejects.toThrow('HTTP_502')
    expect(s.events.at(-1)!.ok).toBe(false)
  })
})

describe('durum bildirimi', () => {
  const np = (over: Partial<NowPlaying> = {}): NowPlaying => ({
    viewableId: 'Video:1',
    title: 'Sintel',
    subtitle: null,
    artUrl: null,
    live: false,
    positionSec: 0,
    durationSec: 888,
    paused: false,
    volume: 100,
    muted: false,
    updatedAt: '2026-11-13T10:00:00.000Z',
    ...over,
  })
  const stateCalls = (s: ReturnType<typeof setup>) => s.calls.filter((c) => c.url === '/api/devices/state')

  it('kayıttan önce biriktirir; saniyede en çok bir kez (sondan) yollar; durdur/oynat hemen gider', async () => {
    const s = setup()
    s.client.reportState({ screen: 'home' })
    expect(stateCalls(s)).toHaveLength(0)
    s.client.start({ kind: 'TV' })
    await flush()
    expect(stateCalls(s).map((c) => c.body)).toEqual([{ screen: 'home', nowPlaying: null }])

    // Oynatma başladı (yok → oynuyor): beklemeden
    s.client.reportState({ screen: 'player', nowPlaying: np({ positionSec: 1 }) })
    expect(stateCalls(s)).toHaveLength(2)
    s.client.reportState({ nowPlaying: np({ positionSec: 2 }) })
    s.client.reportState({ nowPlaying: np({ positionSec: 3 }) })
    expect(stateCalls(s)).toHaveLength(2)
    await s.advance(999)
    expect(stateCalls(s)).toHaveLength(2)
    await s.advance(1)
    expect(stateCalls(s)).toHaveLength(3)
    expect(stateCalls(s)[2]!.body).toEqual({ screen: 'player', nowPlaying: np({ positionSec: 3 }) })

    // Durdurma: beklemeden
    await s.advance(100)
    s.client.reportState({ nowPlaying: np({ positionSec: 3, paused: true }) })
    expect(stateCalls(s)).toHaveLength(4)
    // Aynı durum yinelenmez
    await s.advance(5000)
    s.client.reportState({ nowPlaying: np({ positionSec: 3, paused: true }) })
    await s.advance(5000)
    expect(stateCalls(s)).toHaveLength(4)
    expect(s.events.filter((e) => e.label === 'durum')).toHaveLength(4)
  })

  it('yeniden bağlanınca son durumu yeniden bildirir', async () => {
    const s = setup()
    s.client.start({ kind: 'TV' })
    await flush()
    s.client.reportState({ screen: 'live' })
    expect(stateCalls(s)).toHaveLength(1)
    s.last().fire('error')
    await s.advance(1000)
    expect(stateCalls(s)).toHaveLength(2)
  })
})

describe('hedef cihaz', () => {
  const tvs = (n: number, online = true) =>
    Array.from({ length: n }, (_, i) => device({ deviceId: `tv${i}`, name: `TV ${i}`, online }))

  it('çevrimiçi tek TV kendiliğinden hedeftir (bu cihaz hariç); iki TV varsa seçim gerekir', async () => {
    const s = setup()
    s.client.start({ kind: 'MOBILE' })
    await flush()
    const me = device({ deviceId: 'ben', kind: 'TV', isThisDevice: true })
    s.last().fire('devices', { devices: [me, ...tvs(1)] })
    expect(s.client.getState().targetDeviceId).toBe('tv0')
    s.last().fire('devices', { devices: [me, ...tvs(2)] })
    expect(s.client.getState().targetDeviceId).toBeNull()
    s.last().fire('devices', { devices: [me, ...tvs(1, false)] })
    expect(s.client.getState().targetDeviceId).toBeNull()
    s.last().fire('devices', { devices: [me] })
    expect(s.client.getState().targetDeviceId).toBeNull()
  })

  it('seçim sanal cihaza özel anahtarla saklanır; listeden düşerse kendiliğinden seçime döner', async () => {
    const storage = memoryStorage()
    const s = setup({ storage })
    s.client.start({ kind: 'MOBILE' })
    await flush()
    s.last().fire('devices', { devices: tvs(2) })
    s.client.setTarget('tv1')
    expect(s.client.getState().targetDeviceId).toBe('tv1')
    expect(storage.data.get('tvp.cihaz.hedef.telefon')).toBe('tv1')

    // Yeni sekme/yenileme: saklanan seçim okunur
    const again = setup({ storage })
    expect(again.client.getState().targetDeviceId).toBe('tv1')

    s.last().fire('devices', { devices: [tvs(2)[0]!] })
    expect(s.client.getState().targetDeviceId).toBe('tv0')
    s.client.setTarget(null)
    expect(storage.data.has('tvp.cihaz.hedef.telefon')).toBe(false)
  })

  it('depolama erişilemezse bellekte çalışır', () => {
    const broken: KeyValueStorage = {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('SecurityError')
      },
      removeItem: () => {
        throw new Error('SecurityError')
      },
    }
    const s = setup({ storage: broken })
    s.client.setTarget('tv9')
    expect(s.client.getState().targetDeviceId).toBe('tv9')
  })
})

describe('profil ve TV girişi', () => {
  const boot = { membershipStatus: 'CURRENT_MEMBER', esn: 'E' } as unknown as BootContext

  it('switchProfile bağlamı uygular; PIN hatalarını kodla fırlatır', async () => {
    const s = setup({
      responder: (c) => {
        const body = c.body as { guid: string; pin?: string }
        if (body.guid === 'kilitli' && !body.pin) return json({ error: { code: 'PIN_REQUIRED', message: '' } }, 403)
        if (body.guid === 'kilitli' && body.pin !== '1234')
          return json({ error: { code: 'PIN_INVALID', message: '' } }, 403)
        return json(boot)
      },
    })
    await expect(s.client.switchProfile('kilitli')).rejects.toThrow('PIN_REQUIRED')
    await expect(s.client.switchProfile('kilitli', '0000')).rejects.toThrow('PIN_INVALID')
    expect(await s.client.switchProfile('kilitli', '1234')).toEqual(boot)
    expect(s.applied).toEqual([boot])
    expect(s.calls[2]).toMatchObject({ url: '/api/profiles/switch', body: { guid: 'kilitli', pin: '1234' } })
  })

  it('TV girişi: başlat, yokla (429 → PENDING), APPROVED bağlamı uygular', async () => {
    let next: Response = json({ status: 'PENDING' })
    const s = setup({
      responder: (c) => {
        if (c.url.endsWith('/start'))
          return json({
            deviceCode: 'gizli',
            userCode: 'ABCD-2345',
            verificationUrl: 'http://192.168.1.5:8787/#/bagla?kod=ABCD2345',
            qrUrl: '/api/tv/login/qr.svg?kod=ABCD2345',
            expiresInSec: 600,
            intervalSec: 2,
          })
        return next
      },
    })
    const st = await s.client.startTvLogin()
    expect(s.calls[0]).toMatchObject({ method: 'POST', url: '/api/tv/login/start', body: {} })
    expect(await s.client.pollTvLogin(st.deviceCode)).toEqual({ status: 'PENDING' })
    next = json({ error: { code: 'SLOW_DOWN' } }, 429)
    expect(await s.client.pollTvLogin(st.deviceCode)).toEqual({ status: 'PENDING' })
    next = json({ status: 'APPROVED', boot })
    expect((await s.client.pollTvLogin(st.deviceCode)).status).toBe('APPROVED')
    expect(s.applied).toEqual([boot])
    expect(s.events.map((e) => e.label)).toEqual(['tv girişi: PENDING', 'tv girişi: APPROVED'])
    expect(s.events[1]!.detail).toMatchObject({ userCode: 'ABCD-2345', status: 'APPROVED' })
  })

  it('sorgu/onay/ret ve profil uçları doğru adreslere gider', async () => {
    const s = setup({
      responder: (c) => {
        if (c.url.includes('/lookup')) return json({ error: { code: 'CODE_NOT_FOUND' } }, 404)
        if (c.url.endsWith('/approve')) return json({ ok: true, deviceId: 'tvx' })
        if (c.method === 'DELETE') return new Response(null, { status: 204 })
        if (c.url === '/api/profiles' && c.method === 'GET') return json({ profiles: [], avatars: [], maxProfiles: 5 })
        return json({ ok: true, profile: { guid: 'g' } })
      },
    })
    await expect(s.client.lookupTvLogin('ab cd')).rejects.toThrow('CODE_NOT_FOUND')
    expect(s.calls[0]!.url).toBe('/api/tv/login/lookup?kod=ab%20cd')
    expect(await s.client.approveTvLogin('ABCD2345', 'g1')).toEqual({ deviceId: 'tvx' })
    expect(s.calls[1]!.body).toEqual({ userCode: 'ABCD2345', profileGuid: 'g1' })
    await s.client.denyTvLogin('ABCD2345')
    expect((await s.client.listProfiles()).maxProfiles).toBe(5)
    expect((await s.client.createProfile({ name: 'Ece', avatarKey: 'a1', isKids: false })).guid).toBe('g')
    expect((await s.client.updateProfile('g', { pin: null })).guid).toBe('g')
    await s.client.deleteProfile('g')
    expect(s.calls.slice(2).map((c) => `${c.method} ${c.url}`)).toEqual([
      'POST /api/tv/login/deny',
      'GET /api/profiles',
      'POST /api/profiles',
      'PATCH /api/profiles/g',
      'DELETE /api/profiles/g',
    ])
  })

  it('ad değiştirme ve silme yerel listeyi günceller', async () => {
    const s = setup({
      responder: (c) => {
        if (c.url.endsWith('/register')) return json({ device: device({ deviceId: 'ben', isThisDevice: true }) })
        if (c.method === 'PATCH') return json({ device: device({ deviceId: 'tv1', name: 'Aaa' }) })
        return new Response(null, { status: 204 })
      },
    })
    s.client.start({ kind: 'MOBILE' })
    await flush()
    s.last().fire('devices', {
      devices: [device({ deviceId: 'tv0', name: 'Bbb' }), device({ deviceId: 'tv1', name: 'Ccc' })],
    })
    await s.client.rename('tv1', 'Aaa')
    expect(s.client.getState().devices.map((d) => d.name)).toEqual(['Aaa', 'Bbb'])
    await s.client.remove('tv0')
    expect(s.client.getState().devices.map((d) => d.deviceId)).toEqual(['tv1'])
  })
})
