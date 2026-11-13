/**
 * Kimlik servisi: hesap/profil kayıtları, çerez zinciri, pasaport kancası ve açılış/giriş uçları.
 * Bu ürün gerçek kimlik bilgisi toplamaz: "giriş" demo hesabına kimlik bilgisi istemeden oturum açar.
 */
import { randomBytes } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { HEADERS, ROUTES } from '../../../../shared/constants'
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
  sessionOf,
  setProfileGate,
  writeSessionCookies,
  type IdentityKeys,
} from './passport'

export const DEMO_ACCOUNT_ID = 'acc_demo'

interface IdentityState {
  accounts: AccountRecord[]
  profiles: ProfileRecord[]
}

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
  }
}

const zSwitchBody = z.object({ guid: z.string().min(1).max(64) })

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

  const service: IdentityService = {
    getAccount: (accountId) => store.get().accounts.find((a) => a.accountId === accountId) ?? null,
    getProfile: (guid) => store.get().profiles.find((p) => p.guid === guid) ?? null,
    listProfiles: (accountId) => store.get().profiles.filter((p) => p.accountId === accountId),
  }
  app.services.identity = service

  // Pasaport: çerez ayrıştırmasından sonra, her istekte.
  app.addHook('onRequest', async (req, reply) => {
    req.passport = resolvePassport(req, reply, keys, service)
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
    const claims = { aid: account.accountId, sid: randomBytes(16).toString('base64url'), iat: Date.now() }
    writeSessionCookies(req, reply, keys, claims, null)
    setProfileGate(req, reply, false)
    req.passport = { ...req.passport, membershipStatus: 'CURRENT_MEMBER', account, profile: null, authURLVerified: false }
    reply.header('cache-control', 'no-store')
    return buildBootContext(app, req)
  })

  app.post(ROUTES.LOGOUT, async (req, reply) => {
    clearSessionCookies(reply)
    req.passport = anonymousPassport(req.passport.deviceId, req.passport.esn)
    reply.removeHeader(HEADERS.PASSPORT_PROFILE)
    reply.header('cache-control', 'no-store')
    return buildBootContext(app, req)
  })

  app.post(ROUTES.PROFILE_SWITCH, async (req, reply) => {
    const account = req.passport.account
    const session = sessionOf(req)
    if (!account || !session) throw httpError(401, 'UNAUTHENTICATED', 'Profil seçmek için önce giriş yapın.')
    const parsed = zSwitchBody.safeParse(req.body)
    if (!parsed.success) throw httpError(400, 'VALIDATION_FAILED', 'Profil kimliği eksik ya da geçersiz.')
    const profile = service.getProfile(parsed.data.guid)
    if (!profile || profile.accountId !== account.accountId) {
      throw httpError(404, 'PROFILE_NOT_FOUND', 'Bu profil bu hesapta bulunamadı.')
    }
    writeSessionCookies(req, reply, keys, session, profile.guid)
    setProfileGate(req, reply, true)
    req.passport = { ...req.passport, profile }
    reply.header(HEADERS.PASSPORT_PROFILE, profile.guid)
    reply.header('cache-control', 'no-store')
    return buildBootContext(app, req)
  })
}
