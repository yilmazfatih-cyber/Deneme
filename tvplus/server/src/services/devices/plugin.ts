/**
 * Cihazlar arası deneyimin sunucusu (tel sözleşmesi: shared/devices.ts):
 * - cihaz kaydı (tarayıcı = tvpvdid), adlandırma, çevrimiçi durumu
 * - SSE komut akışı (`GET /api/devices/stream`), kumanda komutları, durum bildirimleri
 * - TV'de kodla giriş (OAuth "device authorization grant" kalıbı) ve QR görseli
 * Komutlar yalnız aynı hesabın cihazları arasında gider; başka hesabın cihazı 404'tür.
 */
import { randomUUID } from 'node:crypto'
import type { OutgoingHttpHeaders } from 'node:http'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import QRCode from 'qrcode'
import type { z } from 'zod'
import { HEADERS, ROUTES, TV_LOGIN_POLL_SEC, TV_LOGIN_TTL_SEC } from '../../../../shared/constants'
import type {
  DeviceInfo,
  DeviceKind,
  DeviceListResponse,
  DeviceScreen,
  NowPlaying,
  RemoteCommandEnvelope,
  TvLoginLookup,
  TvLoginPoll,
  TvLoginStart,
} from '../../../../shared/devices'
import { httpError, sendApiError } from '../../gateway/errors'
import type { AccountRecord } from '../../kernel/context'
import { createStore } from '../../kernel/store'
import { createHub } from './hub'
import { createFailureGuard, createTokenBuckets } from './limits'
import { defaultDeviceName, uniqueName } from './naming'
import { firstLanIPv4, publicBasePath, publicOrigin, type AddressResolver } from './origin'
import { DEVICE_ID_RE, zApprove, zCommand, zPoll, zRegister, zRename, zState, zTvStart, zUserCodeBody } from './schemas'
import { createTvLoginStore, formatUserCode, normalizeUserCode, type TvLoginEntry } from './tvlogin'

export interface DeviceRecord {
  deviceId: string
  accountId: string
  kind: DeviceKind
  name: string
  /** Kullanıcı adı elle değiştirdiyse kayıt sırasında varsayılan adla ezilmez */
  customName: boolean
  lastSeenAt: string
  profileGuid: string | null
}
interface DevicesState {
  devices: DeviceRecord[]
}

/** Testlerin değiştirebildiği iç bağımlılıklar (saat, yerel ağ adresi çözücü). */
export interface DevicesInternals {
  now: () => number
  lanAddress: AddressResolver
}
const internalsByApp = new WeakMap<FastifyInstance, DevicesInternals>()
export function devicesInternals(app: FastifyInstance): DevicesInternals {
  const i = internalsByApp.get(app)
  if (!i) throw new Error('Cihaz eklentisi bu uygulamada kurulmamış')
  return i
}

/** Akış açık değilse durum bildiriminden bu kadar süre sonra cihaz çevrimdışı sayılır. */
export const ONLINE_WINDOW_MS = 30_000
const BROADCAST_DEBOUNCE_MS = 150
const SWEEP_MS = 5_000
/** Yoklama aralığına tanınan pay (ağ gecikmesi). */
const POLL_SLACK_MS = 500
const WRONG_CODE_LIMIT = 10
const WRONG_CODE_WINDOW_MS = 10 * 60_000

interface LiveState {
  screen: DeviceScreen
  nowPlaying: NowPlaying | null
  at: number
}

export default async function plugin(app: FastifyInstance): Promise<void> {
  const internals: DevicesInternals = { now: () => Date.now(), lanAddress: firstLanIPv4 }
  internalsByApp.set(app, internals)
  const now = () => internals.now()
  const iso = () => new Date(now()).toISOString()

  const store = createStore<DevicesState>(app.config, 'devices', () => ({ devices: [] }))
  if (!Array.isArray(store.get().devices)) store.update((s) => void (s.devices = []))
  const hub = createHub()
  const live = new Map<string, LiveState>()
  const lastOnline = new Map<string, boolean>()
  const pendingBroadcasts = new Map<string, NodeJS.Timeout>()
  const commandBuckets = createTokenBuckets(30, 60, now)
  const startBuckets = createTokenBuckets(0.2, 5, now)
  const wrongCodes = createFailureGuard(WRONG_CODE_LIMIT, WRONG_CODE_WINDOW_MS, now)
  const tvLogins = createTvLoginStore(now)

  /* ───────────── yardımcılar ───────────── */

  const requireMember = (req: FastifyRequest): AccountRecord => {
    const account = req.passport.account
    if (!account || req.passport.membershipStatus !== 'CURRENT_MEMBER') {
      throw httpError(401, 'UNAUTHENTICATED', 'Önce giriş yapmalısınız.')
    }
    return account
  }
  const requireAuthURL = (req: FastifyRequest): void => {
    if (!req.passport.authURLVerified) {
      throw httpError(403, 'CSRF_FAILED', 'Oturum doğrulanamadı; sayfayı yenileyin.')
    }
  }
  const parse = <T>(schema: z.ZodType<T>, body: unknown, code = 'VALIDATION_FAILED', message?: string): T => {
    const r = schema.safeParse(body)
    if (!r.success) throw httpError(400, code, message ?? 'İstek geçersiz: alanları denetleyin.')
    return r.data
  }
  const tooMany = (req: FastifyRequest, reply: FastifyReply, retryMs: number, code: string, message: string) => {
    reply.header('retry-after', String(Math.max(1, Math.ceil(retryMs / 1000))))
    return sendApiError(req, reply, 429, code, message)
  }
  const userAgent = (req: FastifyRequest): string | null => {
    const ua = req.headers['user-agent']
    return typeof ua === 'string' ? ua : null
  }

  const findRecord = (deviceId: string): DeviceRecord | null =>
    store.get().devices.find((d) => d.deviceId === deviceId) ?? null
  const recordOfAccount = (deviceId: string, accountId: string): DeviceRecord | null => {
    const r = DEVICE_ID_RE.test(deviceId) ? findRecord(deviceId) : null
    return r && r.accountId === accountId ? r : null
  }

  const isOnline = (deviceId: string): boolean => {
    if (hub.countOf(deviceId) > 0) return true
    const st = live.get(deviceId)
    return !!st && now() - st.at < ONLINE_WINDOW_MS
  }

  const toInfo = (r: DeviceRecord, viewerDeviceId: string): DeviceInfo => {
    const online = isOnline(r.deviceId)
    const st = online ? live.get(r.deviceId) : undefined
    const profile = r.profileGuid ? app.services.identity.getProfile(r.profileGuid) : null
    return {
      deviceId: r.deviceId,
      kind: r.kind,
      name: r.name,
      online,
      isThisDevice: r.deviceId === viewerDeviceId,
      lastSeenAt: online ? iso() : r.lastSeenAt,
      profileName: profile && profile.accountId === r.accountId ? profile.name : null,
      screen: st?.screen ?? null,
      nowPlaying: st?.nowPlaying ?? null,
    }
  }

  const listFor = (accountId: string, viewerDeviceId: string): DeviceInfo[] =>
    store
      .get()
      .devices.filter((d) => d.accountId === accountId)
      .map((d) => toInfo(d, viewerDeviceId))
      .sort((a, b) => {
        const tv = (a.kind === 'TV' ? 0 : 1) - (b.kind === 'TV' ? 0 : 1)
        return tv || a.name.localeCompare(b.name, 'tr')
      })

  /** Hesaptaki tüm akışlara (her biri kendi `isThisDevice` bakışıyla) güncel listeyi yollar; ~150 ms'de bir toplanır. */
  const scheduleBroadcast = (accountId: string): void => {
    if (pendingBroadcasts.has(accountId)) return
    const t = setTimeout(() => {
      pendingBroadcasts.delete(accountId)
      for (const d of store.get().devices)
        if (d.accountId === accountId) lastOnline.set(d.deviceId, isOnline(d.deviceId))
      for (const conn of hub.connsOfAccount(accountId)) {
        hub.send(conn, 'devices', { devices: listFor(accountId, conn.deviceId) } satisfies DeviceListResponse)
      }
    }, BROADCAST_DEBOUNCE_MS)
    t.unref()
    pendingBroadcasts.set(accountId, t)
  }

  // Akışı olmayan cihazların durum bildirimi zaman aşımına uğrayınca çevrimdışı olduklarını duyur.
  const sweep = setInterval(() => {
    for (const d of store.get().devices) {
      const o = isOnline(d.deviceId)
      if (lastOnline.get(d.deviceId) !== o) {
        lastOnline.set(d.deviceId, o)
        scheduleBroadcast(d.accountId)
      }
    }
    const t = now()
    for (const [id, st] of live) if (t - st.at > ONLINE_WINDOW_MS * 10 && hub.countOf(id) === 0) live.delete(id)
  }, SWEEP_MS)
  sweep.unref()

  app.addHook('preClose', async () => {
    clearInterval(sweep)
    for (const t of pendingBroadcasts.values()) clearTimeout(t)
    pendingBroadcasts.clear()
    hub.closeAll()
  })

  /** Kaydı ekler ya da günceller. Varsayılan ad yalnız tabanı değiştiyse yeniden kurulur ("TV · Chrome 2" korunur). */
  const upsert = (input: {
    deviceId: string
    accountId: string
    kind: DeviceKind
    baseName: string
    profileGuid: string | null
  }): DeviceRecord => {
    const out: { rec?: DeviceRecord } = {}
    store.update((s) => {
      const others = s.devices
        .filter((d) => d.accountId === input.accountId && d.deviceId !== input.deviceId)
        .map((d) => d.name)
      let r = s.devices.find((d) => d.deviceId === input.deviceId)
      if (!r) {
        r = {
          deviceId: input.deviceId,
          accountId: input.accountId,
          kind: input.kind,
          name: uniqueName(input.baseName, others),
          customName: false,
          lastSeenAt: iso(),
          profileGuid: input.profileGuid,
        }
        s.devices.push(r)
      } else {
        if (r.accountId !== input.accountId) {
          // Tarayıcı başka hesaba geçti: eski hesabın listesinden düşer.
          scheduleBroadcast(r.accountId)
          r.accountId = input.accountId
          r.customName = false
        }
        r.kind = input.kind
        const base = input.baseName
        const fits = r.name === base || (r.name.startsWith(`${base} `) && /^\d+$/.test(r.name.slice(base.length + 1)))
        if (!r.customName && !fits) r.name = uniqueName(base, others)
        if (input.profileGuid) r.profileGuid = input.profileGuid
        r.lastSeenAt = iso()
      }
      out.rec = r
    })
    scheduleBroadcast(input.accountId)
    return out.rec!
  }

  const touch = (deviceId: string): void => {
    if (findRecord(deviceId)) {
      store.update((s) => {
        const r = s.devices.find((d) => d.deviceId === deviceId)
        if (r) r.lastSeenAt = iso()
      })
    }
  }

  /* ───────────── cihaz uçları ───────────── */

  app.post(`${ROUTES.DEVICES}/register`, async (req) => {
    const account = requireMember(req)
    const body = parse(zRegister, req.body)
    const profile = req.passport.profile
    const rec = upsert({
      deviceId: req.passport.deviceId,
      accountId: account.accountId,
      kind: body.kind,
      baseName: body.name ?? defaultDeviceName(body.kind, userAgent(req), profile?.name ?? null),
      profileGuid: profile?.guid ?? null,
    })
    return { device: toInfo(rec, req.passport.deviceId) }
  })

  app.get(ROUTES.DEVICES, async (req, reply) => {
    const account = requireMember(req)
    reply.header('cache-control', 'no-store')
    return { devices: listFor(account.accountId, req.passport.deviceId) } satisfies DeviceListResponse
  })

  app.get(ROUTES.DEVICE_STREAM, async (req, reply) => {
    const account = requireMember(req)
    const deviceId = req.passport.deviceId
    reply.hijack()
    const res = reply.raw
    const headers: OutgoingHttpHeaders = {
      ...(reply.getHeaders() as OutgoingHttpHeaders),
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
      'x-accel-buffering': 'no',
      connection: 'keep-alive',
      [HEADERS.TRACE_ID]: req.trace.traceId,
      [HEADERS.SPAN_ID]: req.trace.spanId,
    }
    res.writeHead(200, headers)
    res.write('retry: 2000\n\n')
    const conn = hub.open(deviceId, account.accountId, res, (c) => {
      if (hub.countOf(c.deviceId) === 0) {
        touch(c.deviceId)
        scheduleBroadcast(c.accountId)
      }
    })
    hub.send(conn, 'hello', { deviceId })
    hub.send(conn, 'devices', { devices: listFor(account.accountId, deviceId) } satisfies DeviceListResponse)
    touch(deviceId)
    scheduleBroadcast(account.accountId)
    return reply
  })

  app.post(`${ROUTES.DEVICES}/state`, async (req, reply) => {
    const account = requireMember(req)
    const body = parse(zState, req.body)
    const rec = recordOfAccount(req.passport.deviceId, account.accountId)
    if (!rec) throw httpError(404, 'DEVICE_NOT_REGISTERED', 'Bu cihaz kayıtlı değil; önce kaydolun.')
    live.set(rec.deviceId, { screen: body.screen, nowPlaying: body.nowPlaying, at: now() })
    store.update((s) => {
      const r = s.devices.find((d) => d.deviceId === rec.deviceId)
      if (!r) return
      r.lastSeenAt = iso()
      if (req.passport.profile) r.profileGuid = req.passport.profile.guid
    })
    scheduleBroadcast(account.accountId)
    return reply.code(204).send()
  })

  app.post<{ Params: { deviceId: string } }>(`${ROUTES.DEVICES}/:deviceId/command`, async (req, reply) => {
    const account = requireMember(req)
    requireAuthURL(req)
    const target = recordOfAccount(req.params.deviceId, account.accountId)
    if (!target) throw httpError(404, 'DEVICE_NOT_FOUND', 'Cihaz bulunamadı.')
    const from = req.passport.deviceId
    const rate = commandBuckets.take(from)
    if (!rate.ok) return tooMany(req, reply, rate.retryAfterMs, 'RATE_LIMITED', 'Çok hızlı komut gönderildi.')
    const command = parse(zCommand, req.body, 'INVALID_COMMAND', 'Komut geçersiz.')
    if (command.type === 'TRANSFER' && !recordOfAccount(command.toDeviceId, account.accountId)) {
      throw httpError(400, 'INVALID_COMMAND', 'Aktarılacak cihaz bu hesapta yok.')
    }
    const self = recordOfAccount(from, account.accountId)
    const envelope: RemoteCommandEnvelope = {
      id: randomUUID(),
      at: iso(),
      from: { deviceId: from, name: self?.name ?? 'Bilinmeyen cihaz', kind: self?.kind ?? 'WEB' },
      command,
    }
    const delivered = hub.sendToDevice(target.deviceId, 'command', envelope) > 0
    return { delivered }
  })

  app.patch<{ Params: { deviceId: string } }>(`${ROUTES.DEVICES}/:deviceId`, async (req) => {
    const account = requireMember(req)
    requireAuthURL(req)
    const target = recordOfAccount(req.params.deviceId, account.accountId)
    if (!target) throw httpError(404, 'DEVICE_NOT_FOUND', 'Cihaz bulunamadı.')
    const body = parse(zRename, req.body)
    store.update((s) => {
      const r = s.devices.find((d) => d.deviceId === target.deviceId)
      if (r) {
        r.name = body.name
        r.customName = true
      }
    })
    scheduleBroadcast(account.accountId)
    return { device: toInfo(target, req.passport.deviceId) }
  })

  app.delete<{ Params: { deviceId: string } }>(`${ROUTES.DEVICES}/:deviceId`, async (req, reply) => {
    const account = requireMember(req)
    requireAuthURL(req)
    const target = recordOfAccount(req.params.deviceId, account.accountId)
    if (!target) throw httpError(404, 'DEVICE_NOT_FOUND', 'Cihaz bulunamadı.')
    app.services.identity.revokeDevice(target.deviceId)
    hub.sendToDevice(target.deviceId, 'signout', {})
    hub.closeDevice(target.deviceId)
    store.update((s) => {
      s.devices = s.devices.filter((d) => d.deviceId !== target.deviceId)
    })
    live.delete(target.deviceId)
    lastOnline.delete(target.deviceId)
    scheduleBroadcast(account.accountId)
    return reply.code(204).send()
  })

  /* ───────────── TV'de kodla giriş ───────────── */

  const wrongKeys = (req: FastifyRequest): string[] => {
    const keys = [`d:${req.passport.deviceId}`]
    if (req.passport.account) keys.push(`a:${req.passport.account.accountId}`)
    return keys
  }
  const blockedFor = (req: FastifyRequest): number => Math.max(...wrongKeys(req).map((k) => wrongCodes.blockedFor(k)))
  const wrongCode = (req: FastifyRequest): never => {
    for (const k of wrongKeys(req)) wrongCodes.fail(k)
    throw httpError(404, 'CODE_NOT_FOUND', 'Kod bulunamadı ya da süresi doldu.')
  }
  /** Bekleyen (onaylanmamış, süresi dolmamış) kaydı bulur; yoksa yanlış deneme sayılır. */
  const pendingByCode = (req: FastifyRequest, raw: unknown): TvLoginEntry => {
    const code = typeof raw === 'string' ? normalizeUserCode(raw) : ''
    const entry = /^[A-Z0-9]{8}$/.test(code) ? tvLogins.byUserCode(code) : null
    if (!entry || entry.status !== 'PENDING') return wrongCode(req)
    return entry
  }
  const TV = ROUTES.TV_LOGIN

  app.post(`${TV}/start`, async (req, reply) => {
    const body = parse(zTvStart, req.body ?? undefined)
    const rate = startBuckets.take(req.passport.deviceId)
    if (!rate.ok) return tooMany(req, reply, rate.retryAfterMs, 'RATE_LIMITED', 'Çok sık kod istendi.')
    const origin = publicOrigin(req, internals.lanAddress)
    const entry = tvLogins.create({
      deviceId: req.passport.deviceId,
      deviceName: body?.name ?? defaultDeviceName('TV', userAgent(req), null),
      deviceKind: 'TV',
      ttlMs: TV_LOGIN_TTL_SEC * 1000,
      verificationUrl: (code) => `${origin}${publicBasePath()}/#/bagla?kod=${code}`,
    })
    reply.header('cache-control', 'no-store')
    return {
      deviceCode: entry.deviceCode,
      userCode: formatUserCode(entry.userCode),
      verificationUrl: entry.verificationUrl,
      qrUrl: `${TV}/qr.svg?kod=${entry.userCode}`,
      expiresInSec: TV_LOGIN_TTL_SEC,
      intervalSec: TV_LOGIN_POLL_SEC,
    } satisfies TvLoginStart
  })

  app.get<{ Querystring: { kod?: string } }>(`${TV}/qr.svg`, async (req, reply) => {
    const wait = blockedFor(req)
    if (wait) return tooMany(req, reply, wait, 'RATE_LIMITED', 'Çok fazla hatalı kod denendi.')
    const entry = pendingByCode(req, req.query.kod)
    const svg = await QRCode.toString(entry.verificationUrl, {
      type: 'svg',
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    })
    return reply.header('cache-control', 'no-store').type('image/svg+xml; charset=utf-8').send(svg)
  })

  app.post(`${TV}/poll`, async (req, reply) => {
    const body = parse(zPoll, req.body)
    reply.header('cache-control', 'no-store')
    const entry = tvLogins.byDeviceCode(body.deviceCode)
    if (!entry || entry.deviceId !== req.passport.deviceId) return { status: 'EXPIRED' } satisfies TvLoginPoll
    const t = now()
    const minGap = TV_LOGIN_POLL_SEC * 1000 - POLL_SLACK_MS
    if (entry.lastPollAt !== null && t - entry.lastPollAt < minGap) {
      return tooMany(req, reply, entry.lastPollAt + TV_LOGIN_POLL_SEC * 1000 - t, 'SLOW_DOWN', 'Yoklama çok sık.')
    }
    entry.lastPollAt = t
    if (entry.status === 'PENDING' || entry.consuming) return { status: 'PENDING' } satisfies TvLoginPoll
    if (entry.status === 'DENIED') {
      tvLogins.remove(entry)
      return { status: 'DENIED' } satisfies TvLoginPoll
    }
    // APPROVED: oturum zincirini bu tarayıcıya kur (yalnız bir kez).
    entry.consuming = true
    try {
      const boot = await app.services.identity.loginDevice(req, reply, {
        accountId: entry.accountId!,
        profileGuid: entry.profileGuid,
      })
      tvLogins.remove(entry)
      upsert({
        deviceId: entry.deviceId,
        accountId: entry.accountId!,
        kind: entry.deviceKind,
        baseName: entry.deviceName,
        profileGuid: entry.profileGuid,
      })
      return { status: 'APPROVED', boot } satisfies TvLoginPoll
    } catch (err) {
      entry.consuming = false
      throw err
    }
  })

  app.get<{ Querystring: { kod?: string } }>(`${TV}/lookup`, async (req, reply) => {
    requireMember(req)
    const wait = blockedFor(req)
    if (wait) return tooMany(req, reply, wait, 'RATE_LIMITED', 'Çok fazla hatalı kod denendi.')
    const entry = pendingByCode(req, req.query.kod)
    reply.header('cache-control', 'no-store')
    return {
      userCode: formatUserCode(entry.userCode),
      deviceName: entry.deviceName,
      deviceKind: entry.deviceKind,
      requestedAt: new Date(entry.requestedAt).toISOString(),
      expiresAt: new Date(entry.expiresAt).toISOString(),
    } satisfies TvLoginLookup
  })

  app.post(`${TV}/approve`, async (req, reply) => {
    const account = requireMember(req)
    requireAuthURL(req)
    const wait = blockedFor(req)
    if (wait) return tooMany(req, reply, wait, 'RATE_LIMITED', 'Çok fazla hatalı kod denendi.')
    const body = parse(zApprove, req.body)
    const entry = pendingByCode(req, body.userCode)
    const profileGuid = body.profileGuid ?? null
    if (profileGuid) {
      const p = app.services.identity.getProfile(profileGuid)
      if (!p || p.accountId !== account.accountId) {
        throw httpError(404, 'PROFILE_NOT_FOUND', 'Bu profil bu hesapta bulunamadı.')
      }
    }
    entry.status = 'APPROVED'
    entry.accountId = account.accountId
    entry.profileGuid = profileGuid
    try {
      for (const p of app.services.identity.listProfiles(account.accountId)) {
        app.services.notifications.push(p.guid, {
          kind: 'SYSTEM',
          title: 'Yeni cihazda oturum açıldı',
          body: `${entry.deviceName} hesabına bağlandı.`,
          href: '#/cihazlar',
        })
      }
    } catch (err) {
      req.log.warn({ err }, 'yeni cihaz bildirimi yollanamadı')
    }
    return { ok: true as const, deviceId: entry.deviceId }
  })

  app.post(`${TV}/deny`, async (req, reply) => {
    requireMember(req)
    requireAuthURL(req)
    const wait = blockedFor(req)
    if (wait) return tooMany(req, reply, wait, 'RATE_LIMITED', 'Çok fazla hatalı kod denendi.')
    const body = parse(zUserCodeBody, req.body)
    const entry = pendingByCode(req, body.userCode)
    entry.status = 'DENIED'
    return { ok: true as const }
  })
}
