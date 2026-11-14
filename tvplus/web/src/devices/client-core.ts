/**
 * Cihaz istemcisinin çekirdeği: bağımlılıklar (fetch, EventSource, oturum başlıkları, saat, depolama) dışarıdan
 * verilir, böylece birim testleri sahteleriyle çalışır. Uygulamadaki tekil örnek `client.ts` içinde kurulur.
 * Tel sözleşmesi: shared/devices.ts.
 */
import { ROUTES } from '../../../shared/constants'
import type {
  DeviceInfo,
  DeviceKind,
  DeviceScreen,
  ManagedProfile,
  NowPlaying,
  ProfilesResponse,
  RemoteCommand,
  RemoteCommandEnvelope,
  TvLoginLookup,
  TvLoginPoll,
  TvLoginStart,
} from '../../../shared/devices'
import type { BootContext } from '../../../shared/types'

export interface DeviceClientState {
  /** 'idle' → start() çağrılmadı · 'connecting' · 'online' (SSE açık) · 'offline' (yeniden deniyor) */
  connection: 'idle' | 'connecting' | 'online' | 'offline'
  thisDevice: DeviceInfo | null
  /** Hesaptaki tüm cihazlar (bu cihaz dahil), TV'ler önce */
  devices: DeviceInfo[]
  /** Kullanıcının kumanda etmek için seçtiği cihaz (deviceId) */
  targetDeviceId: string | null
}

/** EventSource'un istemcinin kullandığı kadarı (testlerde sahtesi verilir). */
export interface EventSourceLike {
  addEventListener(type: string, listener: (ev: MessageEvent) => void): void
  close(): void
}

export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface DeviceClientDeps {
  fetch: (input: string, init?: RequestInit) => Promise<Response>
  openEventSource: (url: string) => EventSourceLike
  /** Her isteğe eklenen oturum başlıkları (sessionHeaders) */
  headers: () => Record<string, string>
  /** Başlık taşıyamayan istekler için adres (sanal cihaz parametresi) */
  apiUrl: (path: string) => string
  applyBoot: (boot: BootContext) => unknown
  refreshBoot: () => Promise<unknown>
  storage: KeyValueStorage | null
  /** Seçili hedefin saklandığı anahtar (sanal cihaza göre ayrılır) */
  storageKey: string
  /** devbus 'device' kategorisine yayın */
  emit: (label: string, detail?: Record<string, unknown>, opts?: { ms?: number; ok?: boolean }) => void
  setTimeout: (fn: () => void, ms: number) => unknown
  clearTimeout: (handle: unknown) => void
  now: () => number
}

export interface DeviceClientApi {
  /** Bu uygulama örneğini cihaz olarak kaydeder ve komut akışına bağlanır (üye + profil varken; tekrar çağrılabilir). */
  start(opts: { kind: DeviceKind; name?: string }): void
  /** Akışı kapatır (çıkışta). */
  stop(): void
  getState(): DeviceClientState
  /** Durum değişince çağrılır; abonelikten çıkma işlevini döndürür. */
  subscribe(listener: () => void): () => void
  setTarget(deviceId: string | null): void
  /** Hedef cihaza komut yollar; teslim edildiyse true. */
  sendCommand(deviceId: string, command: RemoteCommand): Promise<boolean>
  /** Bu cihaza gelen komutlar için işleyici ekler. İşleyici true dönerse komut tüketilmiştir (son eklenen önce çalışır). */
  onCommand(handler: (envelope: RemoteCommandEnvelope) => boolean | void): () => void
  /** Bu cihazın ekranını / oynatma durumunu bildirir (saniyede en çok bir kez; durdur/oynat değişimi hemen). */
  reportState(state: { screen?: DeviceScreen; nowPlaying?: NowPlaying | null }): void
  rename(deviceId: string, name: string): Promise<void>
  /** O cihazın oturumunu kapatır. */
  remove(deviceId: string): Promise<void>
  startTvLogin(name?: string): Promise<TvLoginStart>
  pollTvLogin(deviceCode: string): Promise<TvLoginPoll>
  lookupTvLogin(userCode: string): Promise<TvLoginLookup>
  approveTvLogin(userCode: string, profileGuid?: string): Promise<{ deviceId: string }>
  denyTvLogin(userCode: string): Promise<void>
  listProfiles(): Promise<ProfilesResponse>
  createProfile(input: { name: string; avatarKey: string; isKids: boolean }): Promise<ManagedProfile>
  updateProfile(
    guid: string,
    input: { name?: string; avatarKey?: string; isKids?: boolean; pin?: string | null },
  ): Promise<ManagedProfile>
  deleteProfile(guid: string): Promise<void>
  /** Profil değiştirir; kilitliyse PIN ister. Hata kodları: 'PIN_REQUIRED' | 'PIN_INVALID' (Error.message). */
  switchProfile(guid: string, pin?: string): Promise<BootContext>
}

export const BACKOFF_MIN_MS = 1000
export const BACKOFF_MAX_MS = 15_000
export const REPORT_INTERVAL_MS = 1000

/** Sunucu hatasını `Error(<kod>)` olarak döndürür; gövde yoksa `HTTP_<durum>`. */
export async function errorFromResponse(res: Response): Promise<Error & { status: number }> {
  let code = `HTTP_${res.status}`
  try {
    const body = (await res.json()) as { error?: { code?: unknown } }
    if (typeof body?.error?.code === 'string') code = body.error.code
  } catch {
    /* gövde JSON değil */
  }
  return Object.assign(new Error(code), { status: res.status })
}

export function sortDevices(list: DeviceInfo[]): DeviceInfo[] {
  return [...list].sort((a, b) => {
    const tv = (a.kind === 'TV' ? 0 : 1) - (b.kind === 'TV' ? 0 : 1)
    return tv || a.name.localeCompare(b.name, 'tr')
  })
}

export function createDeviceClient(deps: DeviceClientDeps): DeviceClientApi {
  /* ───────────── gözlemlenebilir durum ───────────── */

  const readStored = (): string | null => {
    try {
      return deps.storage?.getItem(deps.storageKey) ?? null
    } catch {
      return null
    }
  }
  let explicitTarget: string | null = readStored()

  /** Seçili hedef varsa (ve hâlâ listedeyse) o; yoksa çevrimiçi tek TV (bu cihaz hariç). */
  const resolveTarget = (devices: DeviceInfo[]): string | null => {
    if (explicitTarget && (devices.length === 0 || devices.some((d) => d.deviceId === explicitTarget))) {
      return explicitTarget
    }
    const tvs = devices.filter((d) => d.kind === 'TV' && d.online && !d.isThisDevice)
    return tvs.length === 1 ? tvs[0]!.deviceId : null
  }

  let state: DeviceClientState = { connection: 'idle', thisDevice: null, devices: [], targetDeviceId: null }
  state = { ...state, targetDeviceId: resolveTarget([]) }
  const listeners = new Set<() => void>()

  const setState = (patch: Partial<DeviceClientState>): void => {
    const merged = { ...state, ...patch }
    const next: DeviceClientState = { ...merged, targetDeviceId: resolveTarget(merged.devices) }
    if (
      next.connection === state.connection &&
      next.thisDevice === state.thisDevice &&
      next.devices === state.devices &&
      next.targetDeviceId === state.targetDeviceId
    ) {
      return
    }
    state = next
    for (const l of [...listeners]) {
      try {
        l()
      } catch {
        /* dinleyici hatası diğerlerini durdurmaz */
      }
    }
  }

  /* ───────────── HTTP ───────────── */

  const request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const headers: Record<string, string> = { accept: 'application/json', ...deps.headers() }
    if (body !== undefined) headers['content-type'] = 'application/json'
    const res = await deps.fetch(path, {
      method,
      credentials: 'same-origin',
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
    if (!res.ok) throw await errorFromResponse(res)
    if (res.status === 204) return undefined as T
    return (await res.json()) as T
  }

  /* ───────────── kayıt + akış ───────────── */

  let opts: { kind: DeviceKind; name?: string } | null = null
  let started = false
  let registered = false
  let generation = 0
  let source: EventSourceLike | null = null
  let retryTimer: unknown = null
  let backoff = BACKOFF_MIN_MS

  const register = async (): Promise<DeviceInfo> => {
    if (!opts) throw new Error('Cihaz istemcisi başlatılmadı')
    const t0 = deps.now()
    const body = opts.name ? { kind: opts.kind, name: opts.name } : { kind: opts.kind }
    try {
      const { device } = await request<{ device: DeviceInfo }>('POST', `${ROUTES.DEVICES}/register`, body)
      deps.emit('kayıt', { deviceId: device.deviceId, kind: device.kind, name: device.name }, { ms: deps.now() - t0 })
      registered = true
      setState({ thisDevice: device })
      return device
    } catch (err) {
      deps.emit('kayıt', { kind: opts.kind, error: (err as Error).message }, { ms: deps.now() - t0, ok: false })
      throw err
    }
  }

  const closeSource = () => {
    source?.close()
    source = null
  }

  const scheduleReconnect = (): void => {
    if (!started) return
    if (retryTimer !== null) deps.clearTimeout(retryTimer)
    const delay = backoff
    backoff = Math.min(BACKOFF_MAX_MS, backoff * 2)
    setState({ connection: 'offline' })
    retryTimer = deps.setTimeout(() => {
      retryTimer = null
      if (started) void connect()
    }, delay)
  }

  const parseData = <T>(ev: MessageEvent): T | null => {
    try {
      return JSON.parse(String(ev.data)) as T
    } catch {
      return null
    }
  }

  const openStream = (gen: number): void => {
    const src = deps.openEventSource(deps.apiUrl(ROUTES.DEVICE_STREAM))
    source = src
    const current = () => gen === generation && source === src
    src.addEventListener('hello', (ev) => {
      if (!current()) return
      backoff = BACKOFF_MIN_MS
      setState({ connection: 'online' })
      deps.emit('akış açık', { deviceId: parseData<{ deviceId: string }>(ev)?.deviceId ?? null })
    })
    src.addEventListener('devices', (ev) => {
      if (!current()) return
      const data = parseData<{ devices: DeviceInfo[] }>(ev)
      if (!data || !Array.isArray(data.devices)) return
      const devices = sortDevices(data.devices)
      setState({ devices, thisDevice: devices.find((d) => d.isThisDevice) ?? state.thisDevice })
    })
    src.addEventListener('command', (ev) => {
      if (!current()) return
      const env = parseData<RemoteCommandEnvelope>(ev)
      if (env) dispatch(env)
    })
    src.addEventListener('signout', () => {
      if (!current()) return
      deps.emit('oturum uzaktan kapatıldı', { deviceId: state.thisDevice?.deviceId ?? null })
      api.stop()
      void deps.refreshBoot().catch(() => {})
    })
    src.addEventListener('error', () => {
      if (!current()) return
      closeSource()
      deps.emit('akış koptu', { retryInMs: backoff }, { ok: false })
      scheduleReconnect()
    })
  }

  const connect = async (): Promise<void> => {
    const gen = ++generation
    closeSource()
    setState({ connection: state.connection === 'offline' ? 'offline' : 'connecting' })
    try {
      await register()
    } catch {
      if (gen === generation) scheduleReconnect()
      return
    }
    if (gen !== generation || !started) return
    openStream(gen)
    // Yeniden bağlanınca son durumu yeniden bildir (sunucudaki kopya eskimiş olabilir).
    lastSentBody = null
    if (reported) scheduleReport(false)
  }

  /* ───────────── komutlar ───────────── */

  const handlers: { fn: (envelope: RemoteCommandEnvelope) => boolean | void }[] = []

  const dispatch = (env: RemoteCommandEnvelope): void => {
    deps.emit(`komut ← ${env.from?.name ?? '?'}`, { from: env.from, command: env.command })
    for (let i = handlers.length - 1; i >= 0; i--) {
      const h = handlers[i]
      if (!h) continue
      try {
        if (h.fn(env) === true) return
      } catch {
        /* bir işleyicinin hatası sıradakini durdurmaz */
      }
    }
  }

  /* ───────────── durum bildirimi ───────────── */

  let reported: { screen: DeviceScreen; nowPlaying: NowPlaying | null } | null = null
  let lastSentBody: string | null = null
  let lastSentAt = Number.NEGATIVE_INFINITY
  let lastSentPaused: boolean | null = null
  let reportTimer: unknown = null

  const flushReport = (): void => {
    if (reportTimer !== null) {
      deps.clearTimeout(reportTimer)
      reportTimer = null
    }
    if (!reported || !registered) return
    const body = JSON.stringify(reported)
    if (body === lastSentBody) return
    lastSentBody = body
    lastSentAt = deps.now()
    lastSentPaused = reported.nowPlaying ? reported.nowPlaying.paused : null
    const snapshot = reported
    deps.emit('durum', { screen: snapshot.screen, nowPlaying: snapshot.nowPlaying })
    request<void>('POST', `${ROUTES.DEVICES}/state`, snapshot).catch((err: Error) => {
      deps.emit('durum', { error: err.message }, { ok: false })
    })
  }

  const scheduleReport = (immediate: boolean): void => {
    if (!registered) return
    if (immediate) return flushReport()
    if (reportTimer !== null) return
    const wait = lastSentAt + REPORT_INTERVAL_MS - deps.now()
    if (wait <= 0) return flushReport()
    reportTimer = deps.setTimeout(() => {
      reportTimer = null
      flushReport()
    }, wait)
  }

  /* ───────────── TV girişi ───────────── */

  const userCodes = new Map<string, string>()

  /* ───────────── genel arayüz ───────────── */

  const api: DeviceClientApi = {
    start(o) {
      if (started) {
        // Yinelenen başlatma: yalnız tür/ad değiştiyse yeniden kaydol.
        if (opts && (opts.kind !== o.kind || opts.name !== o.name)) {
          opts = { ...o }
          void register().catch(() => {})
        }
        return
      }
      started = true
      opts = { ...o }
      backoff = BACKOFF_MIN_MS
      void connect()
    },

    stop() {
      if (!started && state.connection === 'idle') return
      started = false
      registered = false
      generation++
      closeSource()
      if (retryTimer !== null) deps.clearTimeout(retryTimer)
      retryTimer = null
      if (reportTimer !== null) deps.clearTimeout(reportTimer)
      reportTimer = null
      lastSentBody = null
      setState({ connection: 'idle', thisDevice: null, devices: [] })
    },

    getState: () => state,

    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    setTarget(deviceId) {
      explicitTarget = deviceId
      try {
        if (deviceId) deps.storage?.setItem(deps.storageKey, deviceId)
        else deps.storage?.removeItem(deps.storageKey)
      } catch {
        /* gizli kip vb.: yalnız bellekte tut */
      }
      setState({})
    },

    async sendCommand(deviceId, command) {
      const t0 = deps.now()
      const to = state.devices.find((d) => d.deviceId === deviceId)?.name ?? deviceId
      try {
        const res = await request<{ delivered: boolean }>(
          'POST',
          `${ROUTES.DEVICES}/${encodeURIComponent(deviceId)}/command`,
          command,
        )
        deps.emit(`komut → ${to}`, { to: deviceId, command, delivered: res.delivered }, { ms: deps.now() - t0 })
        return res.delivered === true
      } catch (err) {
        deps.emit(
          `komut → ${to}`,
          { to: deviceId, command, error: (err as Error).message },
          { ms: deps.now() - t0, ok: false },
        )
        throw err
      }
    },

    onCommand(handler) {
      const entry = { fn: handler }
      handlers.push(entry)
      return () => {
        const i = handlers.indexOf(entry)
        if (i >= 0) handlers.splice(i, 1)
      }
    },

    reportState(partial) {
      const prev = reported ?? { screen: 'other' as DeviceScreen, nowPlaying: null }
      reported = {
        screen: partial.screen ?? prev.screen,
        nowPlaying: partial.nowPlaying !== undefined ? partial.nowPlaying : prev.nowPlaying,
      }
      const paused = reported.nowPlaying ? reported.nowPlaying.paused : null
      const pauseChanged = lastSentBody !== null && paused !== null && paused !== lastSentPaused
      scheduleReport(pauseChanged)
    },

    async rename(deviceId, name) {
      const { device } = await request<{ device: DeviceInfo }>(
        'PATCH',
        `${ROUTES.DEVICES}/${encodeURIComponent(deviceId)}`,
        { name },
      )
      const devices = sortDevices(state.devices.map((d) => (d.deviceId === deviceId ? { ...d, name: device.name } : d)))
      setState({
        devices,
        thisDevice:
          state.thisDevice?.deviceId === deviceId ? { ...state.thisDevice, name: device.name } : state.thisDevice,
      })
    },

    async remove(deviceId) {
      await request<void>('DELETE', `${ROUTES.DEVICES}/${encodeURIComponent(deviceId)}`)
      setState({ devices: state.devices.filter((d) => d.deviceId !== deviceId) })
    },

    async startTvLogin(name) {
      const res = await request<TvLoginStart>('POST', `${ROUTES.TV_LOGIN}/start`, name ? { name } : {})
      userCodes.set(res.deviceCode, res.userCode)
      deps.emit('tv girişi: PENDING', { userCode: res.userCode, status: 'PENDING' })
      return res
    },

    async pollTvLogin(deviceCode) {
      let res: TvLoginPoll
      try {
        res = await request<TvLoginPoll>('POST', `${ROUTES.TV_LOGIN}/poll`, { deviceCode })
      } catch (err) {
        // Çok sık yoklama: sunucu yavaşlamamızı istiyor, durum değişmedi.
        if ((err as { status?: number }).status === 429) return { status: 'PENDING' }
        throw err
      }
      const userCode = userCodes.get(deviceCode) ?? null
      if (res.status !== 'PENDING') {
        userCodes.delete(deviceCode)
        deps.emit(`tv girişi: ${res.status}`, { userCode, status: res.status }, { ok: res.status === 'APPROVED' })
      }
      if (res.status === 'APPROVED' && res.boot) deps.applyBoot(res.boot)
      return res
    },

    lookupTvLogin(userCode) {
      return request<TvLoginLookup>('GET', `${ROUTES.TV_LOGIN}/lookup?kod=${encodeURIComponent(userCode)}`)
    },

    async approveTvLogin(userCode, profileGuid) {
      const res = await request<{ ok: true; deviceId: string }>(
        'POST',
        `${ROUTES.TV_LOGIN}/approve`,
        profileGuid ? { userCode, profileGuid } : { userCode },
      )
      deps.emit('tv girişi: APPROVED', { userCode, status: 'APPROVED', deviceId: res.deviceId })
      return { deviceId: res.deviceId }
    },

    async denyTvLogin(userCode) {
      await request<{ ok: true }>('POST', `${ROUTES.TV_LOGIN}/deny`, { userCode })
      deps.emit('tv girişi: DENIED', { userCode, status: 'DENIED' })
    },

    listProfiles: () => request<ProfilesResponse>('GET', ROUTES.PROFILES),

    async createProfile(input) {
      return (await request<{ profile: ManagedProfile }>('POST', ROUTES.PROFILES, input)).profile
    },

    async updateProfile(guid, input) {
      return (
        await request<{ profile: ManagedProfile }>('PATCH', `${ROUTES.PROFILES}/${encodeURIComponent(guid)}`, input)
      ).profile
    },

    async deleteProfile(guid) {
      await request<void>('DELETE', `${ROUTES.PROFILES}/${encodeURIComponent(guid)}`)
    },

    async switchProfile(guid, pin) {
      const boot = await request<BootContext>('POST', ROUTES.PROFILE_SWITCH, pin ? { guid, pin } : { guid })
      deps.applyBoot(boot)
      // Cihaz kaydındaki profil (ve varsayılan ad) güncellensin.
      if (started && registered) void register().catch(() => {})
      return boot
    },
  }
  return api
}
