/**
 * Profil yönetimi (shared/devices.ts "Profil yönetimi"):
 *   GET    /api/profiles                 → ProfilesResponse                       (üye)
 *   POST   /api/profiles                 { name, avatarKey, isKids }  → { profile } (üye + authURL)
 *   PATCH  /api/profiles/:guid           { name?, avatarKey?, isKids?, pin? }     (üye + authURL)
 *   DELETE /api/profiles/:guid           → 204                                    (üye + authURL; son profil silinemez)
 *   POST   /api/profiles/switch          { guid, pin? } → BootContext             (üye; kilitli profilde PIN)
 * Kurallar: en çok 5 profil · ad 1–20 karakter, hesapta benzersiz (Türkçe harf ve büyük/küçük harf duyarsız) ·
 * çocuk profili olgunluk 40, yetişkin 110 · PIN tam 4 hane, yalnız tuzlu özet saklanır · 5 yanlış PIN → 60 sn kilit.
 * Kilitli bir profili düzenlemek/silmek için o profil bu oturumda etkin olmalı ya da gövdede `currentPin` gelmeli.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { HEADERS, ROUTES } from '../../../../shared/constants'
import type { ManagedProfile, ProfilesResponse } from '../../../../shared/devices'
import { norm } from '../../../../shared/text'
import { httpError } from '../../gateway/errors'
import type { AccountRecord } from '../../kernel/context'
import type { Store } from '../../kernel/store'
import {
  AVATAR_KEYS,
  AVATAR_PICKER_WIDTH,
  avatarFieldOf,
  avatarKeyOf,
  avatarOptions,
  isAvatarKey,
  profileAvatarArtwork,
} from './avatars'
import { buildBootContext } from './boot'
import { stableGuid } from './crypto'
import { sessionOf, setProfileGate, writeSessionCookies, type IdentityKeys } from './passport'
import { hashPin, PIN_RE, verifyPin, type PinGuard } from './pin'
import { publicProfile, type IdentityState, type StoredProfile } from './records'

export const MAX_PROFILES = 5
export const NAME_MAX = 20
export const KIDS_MATURITY = 40
export const ADULT_MATURITY = 110

const zName = z.string().trim().min(1).max(NAME_MAX)
const zPin = z.string().regex(PIN_RE)
const zCreate = z.object({ name: zName, avatarKey: z.string().optional(), isKids: z.boolean().optional() })
const zPatch = z.object({
  name: zName.optional(),
  avatarKey: z.string().optional(),
  isKids: z.boolean().optional(),
  pin: zPin.nullable().optional(),
  currentPin: z.string().optional(),
})
const zDelete = z.object({ currentPin: z.string().optional() }).nullish()
const zSwitch = z.object({ guid: z.string().min(1).max(64), pin: z.string().max(16).optional() })

interface Deps {
  store: Store<IdentityState>
  keys: IdentityKeys
  stored: (guid: string) => StoredProfile | null
  guard: PinGuard
}

/** Ad karşılaştırması: Türkçe harfler düzleştirilmiş, büyük/küçük harf ve noktalama duyarsız */
const nameKey = (name: string) => norm(name) || name.trim().toLocaleLowerCase('tr-TR')

export function registerProfileRoutes(app: FastifyInstance, deps: Deps): void {
  const { store, keys, stored, guard } = deps

  const managed = (p: StoredProfile): ManagedProfile => ({
    guid: p.guid,
    name: p.name,
    avatarKey: avatarKeyOf(p.avatar),
    avatarUrl: profileAvatarArtwork(app.config, p, { width: AVATAR_PICKER_WIDTH }).url,
    isKids: p.isKids,
    isLocked: !!p.pin,
    maturityLevel: p.maturityLevel,
  })
  const accountProfiles = (accountId: string) => store.get().profiles.filter((p) => p.accountId === accountId)

  function requireMember(req: FastifyRequest): AccountRecord {
    const account = req.passport.account
    if (!account || !sessionOf(req)) throw httpError(401, 'UNAUTHENTICATED', 'Önce giriş yapmalısın.')
    return account
  }
  function requireMutation(req: FastifyRequest): AccountRecord {
    const account = requireMember(req)
    if (!req.passport.authURLVerified) throw httpError(403, 'CSRF_FAILED', 'İstek doğrulanamadı; sayfayı yenile.')
    return account
  }
  function ownProfile(account: AccountRecord, guid: string): StoredProfile {
    const p = stored(guid)
    if (!p || p.accountId !== account.accountId) throw httpError(404, 'PROFILE_NOT_FOUND', 'Bu profil bulunamadı.')
    return p
  }
  function checkName(account: AccountRecord, name: string, exceptGuid: string | null): void {
    const key = nameKey(name)
    if (accountProfiles(account.accountId).some((p) => p.guid !== exceptGuid && nameKey(p.name) === key))
      throw httpError(409, 'PROFILE_NAME_TAKEN', 'Bu adla bir profil zaten var.')
  }
  function checkAvatar(key: string | undefined): void {
    if (key !== undefined && !isAvatarKey(key)) throw httpError(400, 'VALIDATION_FAILED', 'Bu avatar seçilemez.')
  }

  /** PIN denemesi: kilit, eksik, yanlış durumlarında fırlatır; doğruysa sayaç sıfırlanır. */
  async function attemptPin(reply: FastifyReply, p: StoredProfile, pin: string | undefined): Promise<void> {
    if (!p.pin) return
    const left = guard.lockedFor(p.guid)
    if (left > 0) {
      reply.header('retry-after', String(Math.ceil(left / 1000)))
      throw httpError(429, 'PIN_LOCKED', `Çok fazla deneme. ${Math.ceil(left / 1000)} sn sonra yeniden dene.`)
    }
    if (pin === undefined || pin === '') throw httpError(403, 'PIN_REQUIRED', 'Bu profil kilitli. PIN gir.')
    if (await verifyPin(pin, p.pin)) {
      guard.reset(p.guid)
      return
    }
    if (guard.fail(p.guid)) {
      reply.header('retry-after', String(Math.ceil(guard.lockedFor(p.guid) / 1000)))
      throw httpError(429, 'PIN_LOCKED', 'Çok fazla yanlış deneme. 60 sn sonra yeniden dene.')
    }
    throw httpError(403, 'PIN_INVALID', 'PIN yanlış.')
  }

  /** Kilitli profili değiştirmek: bu oturumda etkin profil o ise serbest, değilse currentPin gerekir. */
  async function authorizeLocked(
    req: FastifyRequest,
    reply: FastifyReply,
    p: StoredProfile,
    currentPin: string | undefined,
  ): Promise<void> {
    if (!p.pin || req.passport.profile?.guid === p.guid) return
    await attemptPin(reply, p, currentPin)
  }

  app.get(ROUTES.PROFILES, async (req, reply): Promise<ProfilesResponse> => {
    const account = requireMember(req)
    reply.header('cache-control', 'no-store')
    return {
      profiles: accountProfiles(account.accountId).map(managed),
      avatars: avatarOptions(app.config),
      maxProfiles: MAX_PROFILES,
    }
  })

  app.post(ROUTES.PROFILES, async (req, reply) => {
    const account = requireMutation(req)
    const parsed = zCreate.safeParse(req.body)
    if (!parsed.success) throw httpError(400, 'VALIDATION_FAILED', 'Profil adı 1–20 karakter olmalı.')
    const { name, avatarKey, isKids } = parsed.data
    if (accountProfiles(account.accountId).length >= MAX_PROFILES)
      throw httpError(409, 'PROFILE_LIMIT', `En çok ${MAX_PROFILES} profil açabilirsin.`)
    checkAvatar(avatarKey)
    checkName(account, name, null)
    // Avatar verilmezse kullanılmayan ilk üretilmiş yüz
    const used = new Set(accountProfiles(account.accountId).map((p) => avatarKeyOf(p.avatar)))
    const key = avatarKey ?? AVATAR_KEYS.find((k) => k.startsWith('yuz-') && !used.has(k)) ?? 'yuz-01'
    const profile: StoredProfile = {
      guid: stableGuid(`${account.accountId}|${name}|${Date.now()}|${Math.random()}`),
      accountId: account.accountId,
      name,
      avatar: avatarFieldOf(key),
      isKids: !!isKids,
      maturityLevel: isKids ? KIDS_MATURITY : ADULT_MATURITY,
      language: 'tr',
      pin: null,
    }
    store.update((s) => {
      s.profiles.push(profile)
    })
    reply.header('cache-control', 'no-store')
    return { profile: managed(profile) }
  })

  app.patch<{ Params: { guid: string } }>(`${ROUTES.PROFILES}/:guid`, async (req, reply) => {
    const account = requireMutation(req)
    const parsed = zPatch.safeParse(req.body ?? {})
    if (!parsed.success)
      throw httpError(400, 'VALIDATION_FAILED', 'Alanları denetle: ad 1–20 karakter, PIN tam 4 hane.')
    const body = parsed.data
    const p = ownProfile(account, req.params.guid)
    await authorizeLocked(req, reply, p, body.currentPin)
    checkAvatar(body.avatarKey)
    if (body.name !== undefined) checkName(account, body.name, p.guid)
    const pin = body.pin === undefined ? undefined : body.pin === null ? null : await hashPin(body.pin)
    store.update(() => {
      if (body.name !== undefined) p.name = body.name
      if (body.avatarKey !== undefined) p.avatar = avatarFieldOf(body.avatarKey)
      if (body.isKids !== undefined) {
        p.isKids = body.isKids
        p.maturityLevel = body.isKids ? KIDS_MATURITY : ADULT_MATURITY
      }
      if (pin !== undefined) p.pin = pin
    })
    if (pin !== undefined) guard.reset(p.guid)
    // Etkin profil değiştiyse pasaport da güncel kaydı görsün
    if (req.passport.profile?.guid === p.guid) req.passport = { ...req.passport, profile: publicProfile(p) }
    reply.header('cache-control', 'no-store')
    return { profile: managed(p) }
  })

  app.delete<{ Params: { guid: string } }>(`${ROUTES.PROFILES}/:guid`, async (req, reply) => {
    const account = requireMutation(req)
    const parsed = zDelete.safeParse(req.body)
    const p = ownProfile(account, req.params.guid)
    await authorizeLocked(req, reply, p, parsed.success ? (parsed.data?.currentPin ?? undefined) : undefined)
    if (accountProfiles(account.accountId).length <= 1) throw httpError(409, 'LAST_PROFILE', 'Son profil silinemez.')
    store.update((s) => {
      s.profiles = s.profiles.filter((x) => x.guid !== p.guid)
    })
    guard.reset(p.guid)
    app.services.progress?.forgetProfile?.(p.guid)
    // Etkin profil silindiyse seçim temizlenir: çerezdeki GUID boşalır, profil kapısı yeniden görünür.
    const session = sessionOf(req)
    if (req.passport.profile?.guid === p.guid && session) {
      writeSessionCookies(req, reply, keys, session, null)
      setProfileGate(req, reply, false)
      req.passport = { ...req.passport, profile: null }
      reply.removeHeader(HEADERS.PASSPORT_PROFILE)
    }
    reply.header('cache-control', 'no-store')
    return reply.code(204).send()
  })

  app.post(ROUTES.PROFILE_SWITCH, async (req, reply) => {
    const account = req.passport.account
    const session = sessionOf(req)
    if (!account || !session) throw httpError(401, 'UNAUTHENTICATED', 'Profil seçmek için önce giriş yap.')
    const parsed = zSwitch.safeParse(req.body)
    if (!parsed.success) throw httpError(400, 'VALIDATION_FAILED', 'Profil kimliği eksik ya da geçersiz.')
    const p = stored(parsed.data.guid)
    if (!p || p.accountId !== account.accountId) {
      throw httpError(404, 'PROFILE_NOT_FOUND', 'Bu profil bu hesapta bulunamadı.')
    }
    await attemptPin(reply, p, parsed.data.pin)
    const profile = publicProfile(p)
    writeSessionCookies(req, reply, keys, session, profile.guid)
    setProfileGate(req, reply, true)
    req.passport = { ...req.passport, profile }
    reply.header(HEADERS.PASSPORT_PROFILE, profile.guid)
    reply.header('cache-control', 'no-store')
    return buildBootContext(app, req)
  })
}
