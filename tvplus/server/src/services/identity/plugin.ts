/**
 * Kimlik servisi: hesap/profil kayıtları, çerez zinciri, pasaport kancası ve açılış/giriş uçları.
 * Bu ürün gerçek kimlik bilgisi toplamaz: "giriş" demo hesabına kimlik bilgisi istemeden oturum açar.
 * Sanal cihaz (`x-tvplus-vd` / `?vd=`) her yerde geçerlidir: çerez adlarını passport.ts `cookieNames` belirler.
 */
import { randomBytes } from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { HEADERS, ROUTES } from '../../../../shared/constants'
import type { BootContext } from '../../../../shared/types'
import { httpError } from '../../gateway/errors'
import { deriveKey } from '../../kernel/config'
import type { AccountRecord, ProfileRecord } from '../../kernel/context'
import type { IdentityService } from '../../kernel/services'
import { createStore } from '../../kernel/store'
import { buildBootContext } from './boot'
import { stableGuid } from './crypto'
import {
  anonymousPassport,
  checkAuthURL,
  clearSessionCookies,
  resolvePassport,
  setProfileGate,
  writeSessionCookies,
  type IdentityKeys,
} from './passport'
import { createPinGuard } from './pin'
import { registerProfileRoutes } from './profiles'
import { publicProfile, type IdentityState } from './records'
import type { SessionClaims } from './session'

export { publicProfile, type IdentityState, type StoredProfile } from './records'

export const DEMO_ACCOUNT_ID = 'acc_demo'

/** Demo hesabı ve profilleri. GUID'ler addan türetilir: yeniden başlatmada (ve veri klasörü silinse de) aynı kalır. */
export function seedIdentity(): IdentityState {
  return {
    accounts: [{ accountId: DEMO_ACCOUNT_ID, planName: 'TV+ Premium', products: ['tvplus-temel'] }],
    profiles: [
      {
        guid: stableGuid(`${DEMO_ACCOUNT_ID}|Deniz`),
        accountId: DEMO_ACCOUNT_ID,
        name: 'Deniz',
        avatar: 'avatar-1.png',
        isKids: false,
        maturityLevel: 110,
        language: 'tr',
      },
      {
        guid: stableGuid(`${DEMO_ACCOUNT_ID}|Çocuk`),
        accountId: DEMO_ACCOUNT_ID,
        name: 'Çocuk',
        avatar: 'avatar-2.png',
        isKids: true,
        maturityLevel: 40,
        language: 'tr',
      },
    ],
    revokedDevices: {},
  }
}

export default async function plugin(app: FastifyInstance): Promise<void> {
  const config = app.config
  const keys: IdentityKeys = {
    cookie: deriveKey(config, 'cookie'),
    authUrl: deriveKey(config, 'authurl'),
    esn: deriveKey(config, 'esn'),
  }

  const store = createStore<IdentityState>(config, 'identity', seedIdentity)
  // Eski/eksik kayıtta demo hesabı yoksa tamamla.
  if (!store.get().accounts?.some((a) => a.accountId === DEMO_ACCOUNT_ID)) {
    store.update((s) => {
      const seed = seedIdentity()
      s.accounts = [...(s.accounts ?? []), ...seed.accounts]
      s.profiles = [...(s.profiles ?? []).filter((p) => p.accountId !== DEMO_ACCOUNT_ID), ...seed.profiles]
    })
  }
  app.addHook('onClose', async () => {
    if (!config.isTest) store.flush()
  })

  const stored = (guid: string) => store.get().profiles.find((p) => p.guid === guid) ?? null
  const revokedAt = (deviceId: string) => store.get().revokedDevices?.[deviceId] ?? null

  /** Yeni oturum iddiaları; uzaktan kapatılmış cihazda iat kapanış anından sonraya alınır. */
  const newClaims = (accountId: string, deviceId: string): SessionClaims => {
    const revoked = revokedAt(deviceId)
    const now = Date.now()
    return {
      aid: accountId,
      sid: randomBytes(16).toString('base64url'),
      iat: revoked !== null && now <= revoked ? revoked + 1 : now,
    }
  }

  /** İsteğin tarayıcısında (sanal cihaz dahil) hesaba oturum açar; pasaportu da günceller. */
  function signIn(req: FastifyRequest, reply: FastifyReply, account: AccountRecord, profile: ProfileRecord | null) {
    const claims = newClaims(account.accountId, req.passport.deviceId)
    writeSessionCookies(req, reply, keys, claims, profile?.guid ?? null)
    setProfileGate(req, reply, !!profile)
    req.passport = {
      ...req.passport,
      membershipStatus: 'CURRENT_MEMBER',
      account,
      profile,
      authURLVerified: false,
    }
    if (profile) reply.header(HEADERS.PASSPORT_PROFILE, profile.guid)
    else reply.removeHeader(HEADERS.PASSPORT_PROFILE)
    reply.header('cache-control', 'no-store')
  }

  const service: IdentityService = {
    getAccount: (accountId) => store.get().accounts.find((a) => a.accountId === accountId) ?? null,
    getProfile: (guid) => {
      const p = stored(guid)
      return p ? publicProfile(p) : null
    },
    listProfiles: (accountId) =>
      store
        .get()
        .profiles.filter((p) => p.accountId === accountId)
        .map(publicProfile),
    isProfileLocked: (guid) => !!stored(guid)?.pin,
    async loginDevice(req, reply, opts): Promise<BootContext> {
      const account = service.getAccount(opts.accountId)
      if (!account) throw httpError(404, 'ACCOUNT_NOT_FOUND', 'Hesap bulunamadı.')
      const p = opts.profileGuid ? stored(opts.profileGuid) : null
      // Kilitli profil başka cihazda PIN'siz açılmaz: o cihaz profil kapısında PIN sorar.
      const profile = p && p.accountId === account.accountId && !p.pin ? publicProfile(p) : null
      signIn(req, reply, account, profile)
      return buildBootContext(app, req)
    },
    revokeDevice(deviceId) {
      store.update((s) => {
        s.revokedDevices = { ...(s.revokedDevices ?? {}), [deviceId]: Date.now() }
      })
    },
  }
  app.services.identity = service

  // Pasaport: çerez ayrıştırmasından sonra, her istekte.
  app.addHook('onRequest', async (req, reply) => {
    req.passport = resolvePassport(req, reply, keys, { ...service, revokedAt })
  })

  // Form gövdesindeki authURL (Falcor `authURL=`) gövde ayrıştırıldıktan sonra doğrulanır.
  app.addHook('preHandler', async (req) => {
    if (!req.passport || req.passport.authURLVerified || !req.passport.account) return
    const body = req.body
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      const token = (body as Record<string, unknown>).authURL
      const value = Array.isArray(token) ? token[0] : token
      if (typeof value === 'string') req.passport.authURLVerified = checkAuthURL(req, keys, value)
    }
  })

  app.get(ROUTES.BOOT, async (req, reply) => {
    reply.header('cache-control', 'no-store')
    return buildBootContext(app, req)
  })

  app.post(ROUTES.LOGIN, async (req, reply) => {
    // Gövde yok sayılır: kimlik bilgisi toplanmaz.
    const account = service.getAccount(DEMO_ACCOUNT_ID)
    if (!account) throw httpError(500, 'INTERNAL', 'Demo hesabı bulunamadı.')
    signIn(req, reply, account, null)
    return buildBootContext(app, req)
  })

  app.post(ROUTES.LOGOUT, async (req, reply) => {
    clearSessionCookies(req, reply)
    req.passport = anonymousPassport(req.passport.deviceId, req.passport.esn)
    reply.removeHeader(HEADERS.PASSPORT_PROFILE)
    reply.header('cache-control', 'no-store')
    return buildBootContext(app, req)
  })

  registerProfileRoutes(app, { store, keys, stored, guard: createPinGuard() })
}
