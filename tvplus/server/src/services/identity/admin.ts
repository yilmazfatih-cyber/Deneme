/**
 * Yönetici kipi: iç işleyişi (Stüdyo, "Kaputun altı", Yönetici Paneli) yalnız yöneticiye açar.
 *
 *   POST /api/admin/unlock  { code } → AdminState { isAdmin: true } + tvpadm çerezi   (üye + authURL)
 *   POST /api/admin/lock             → AdminState { isAdmin: false }, çerez silinir    (üye + authURL)
 *
 * Kod yalnız özetiyle karşılaştırılır: sha256(ADMIN_CODE_SALT + normalizeAdminCode(kod)) (kernel/config adminCodeHashOf);
 * karşılaştırma sabit sürelidir. Art arda 5 yanlış denemede cihaz 60 sn kilitlenir (429 ADMIN_LOCKED).
 *
 * Çerez (`tvpadm`, sanal cihazda `tvpadm__<ad>`): v=1&exp=<epoch ms>&mac=<b64url HMAC("aid|deviceId|exp")>
 * Anahtar deriveKey(config, 'admin'). Hesap ve cihaz kimliği değere yazılmaz, MAC'e bağlanır: başka hesabın ya da
 * başka cihazın çerezi geçmez. HttpOnly, path /, SameSite=Lax (oturum çereziyle aynı), 30 gün.
 * Çıkışta ve kilitlemede silinir.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { ROUTES } from '../../../../shared/constants'
import type { AdminState } from '../../../../shared/types'
import { httpError } from '../../gateway/errors'
import { adminCodeHashOf } from '../../kernel/config'
import { safeEqual } from './crypto'
import { cookieNames, sessionOf } from './passport'
import { pinClock } from './pin'
import { ADMIN_TTL_MS, encodeAdminToken } from './session'

export { ADMIN_TTL_MS, encodeAdminToken, verifyAdminToken } from './session'

export const ADMIN_MAX_FAILS = 5
export const ADMIN_LOCK_MS = 60_000
/** Kod uzunluğunun üst sınırı (özet hesabı öncesi; çok uzun gövdeler doğrulamada reddedilir) */
const CODE_MAX = 128

const zUnlock = z.object({ code: z.string().min(1).max(CODE_MAX) })

/** Cihaz başına yanlış deneme sayacı ve kilit (pin.ts createPinGuard ile aynı fikir; saat pinClock). */
export function createAdminGuard() {
  const state = new Map<string, { fails: number; lockedUntil: number }>()
  return {
    /** Kilitliyse kalan süre (ms), değilse 0 */
    lockedFor(key: string): number {
      const s = state.get(key)
      if (!s || s.lockedUntil === 0) return 0
      const left = s.lockedUntil - pinClock.now()
      if (left > 0) return left
      state.delete(key)
      return 0
    },
    /** Yanlış deneme; kilit başladıysa true */
    fail(key: string): boolean {
      const s = state.get(key) ?? { fails: 0, lockedUntil: 0 }
      s.fails++
      if (s.fails >= ADMIN_MAX_FAILS) {
        s.fails = 0
        s.lockedUntil = pinClock.now() + ADMIN_LOCK_MS
      }
      state.set(key, s)
      return s.lockedUntil > 0
    },
    reset(key: string): void {
      state.delete(key)
    },
  }
}
export type AdminGuard = ReturnType<typeof createAdminGuard>

export function clearAdminCookie(req: FastifyRequest, reply: FastifyReply): void {
  reply.clearCookie(cookieNames(req).ADMIN, { path: '/' })
}

function lockedError(reply: FastifyReply, leftMs: number) {
  const sec = Math.max(1, Math.ceil(leftMs / 1000))
  reply.header('retry-after', String(sec))
  return httpError(429, 'ADMIN_LOCKED', `Çok fazla yanlış deneme. ${sec} sn sonra yeniden dene.`, {
    retryAfterSec: sec,
  })
}

export function registerAdminRoutes(app: FastifyInstance, deps: { key: Buffer; guard: AdminGuard }): void {
  const { key, guard } = deps

  /** Üye + authURL (profiller uçlarıyla aynı kural) */
  function requireMutation(req: FastifyRequest): { accountId: string } {
    const account = req.passport.account
    if (!account || !sessionOf(req)) throw httpError(401, 'UNAUTHENTICATED', 'Önce giriş yapmalısın.')
    if (!req.passport.authURLVerified) throw httpError(403, 'CSRF_FAILED', 'İstek doğrulanamadı; sayfayı yenile.')
    return account
  }

  app.post(ROUTES.ADMIN_UNLOCK, async (req, reply): Promise<AdminState> => {
    const account = requireMutation(req)
    reply.header('cache-control', 'no-store')
    const want = app.config.adminCodeHash
    if (!want) throw httpError(403, 'ADMIN_DISABLED', 'Yönetici kipi bu sunucuda kapalı.')
    const deviceId = req.passport.deviceId
    const left = guard.lockedFor(deviceId)
    if (left > 0) throw lockedError(reply, left)
    const parsed = zUnlock.safeParse(req.body)
    if (!parsed.success) throw httpError(400, 'VALIDATION_FAILED', 'Yönetici kodunu yaz.')
    if (!safeEqual(adminCodeHashOf(parsed.data.code), want)) {
      if (guard.fail(deviceId)) throw lockedError(reply, guard.lockedFor(deviceId))
      throw httpError(403, 'ADMIN_CODE_INVALID', 'Yönetici kodu yanlış.')
    }
    guard.reset(deviceId)
    reply.setCookie(cookieNames(req).ADMIN, encodeAdminToken(key, account.accountId, deviceId), {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: req.protocol === 'https',
      maxAge: Math.floor(ADMIN_TTL_MS / 1000),
      encode: encodeURIComponent,
    })
    req.passport = { ...req.passport, isAdmin: true }
    return { isAdmin: true }
  })

  app.post(ROUTES.ADMIN_LOCK, async (req, reply): Promise<AdminState> => {
    requireMutation(req)
    clearAdminCookie(req, reply)
    req.passport = { ...req.passport, isAdmin: false }
    reply.header('cache-control', 'no-store')
    return { isAdmin: false }
  })
}
