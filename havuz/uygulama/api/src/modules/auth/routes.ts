/**
 * Kimlik uçları: kayıt, giriş, çıkış, tüm cihazlardan çıkış, ben, şifre değiştir / unuttum / sıfırla.
 * Oturum açan uçlar (kayıt, giriş) tarayıcıya çerez yazar; istek `X-Auth-Mode: token` ile geldiyse çerez yerine
 * belirteci gövdede döndürür (`{ user, token }`), istemci sonra `Authorization: Bearer` kullanır.
 * Gövdesiz başarı yanıtı her yerde `{ "ok": true }`'dur.
 *
 * Genişletme: yeni bir kimlik ucu için hız sınırı kuralını (RATE_RULES) unutmayın; giriş yapılmadan çağrılan
 * uçlar test/rules.test.ts → PUBLIC_ROUTES listesine yazılmalıdır (yoksa test "oturum istemeli" diye düşer).
 */
import {
  changePasswordRequestSchema,
  forgotPasswordRequestSchema,
  loginRequestSchema,
  registerRequestSchema,
  resetPasswordRequestSchema,
  type AuthResponse,
  type MeResponse,
} from '@uygulama/shared'
import { Hono } from 'hono'
import type { AppContext } from '../../context.ts'
import { readJson } from '../../http/body.ts'
import { requestMeta } from '../../http/meta.ts'
import { rateLimitKey } from '../../http/clientIp.ts'
import { RATE_RULES } from '../../http/rateLimit.ts'
import { OK } from '../../http/responses.ts'
import { ROUTES } from '../../http/routes.ts'
import type { AppEnv } from '../../http/types.ts'
import { changePassword, forgotPassword, login, logout, logoutAll, register, resetPassword } from './service.ts'
import { attachSession, clearSessionCookie, requireUser } from './session.ts'
import { toApiUser } from './userRepo.ts'

export function authRoutes(ctx: AppContext): Hono<AppEnv> {
  const app = new Hono<AppEnv>()

  app.post(ROUTES.register, async (c) => {
    ctx.limiter.consume(RATE_RULES.register, rateLimitKey(c.get('ip')))
    const input = await readJson(c, registerRequestSchema)
    const { user, session } = await register(ctx, input, requestMeta(c))
    return c.json({ user: toApiUser(user), ...attachSession(c, ctx, session) } satisfies AuthResponse, 201)
  })

  app.post(ROUTES.login, async (c) => {
    ctx.limiter.consume(RATE_RULES.login, rateLimitKey(c.get('ip')))
    const input = await readJson(c, loginRequestSchema)
    const { user, session } = await login(ctx, input, requestMeta(c))
    return c.json({ user: toApiUser(user), ...attachSession(c, ctx, session) } satisfies AuthResponse)
  })

  // Oturum yoksa da başarılıdır (süresi dolmuş oturumla "çıkış" hata vermesin); çerez her durumda silinir.
  app.post(ROUTES.logout, (c) => {
    logout(ctx, c.get('auth'))
    clearSessionCookie(c, ctx.config)
    return c.json(OK)
  })

  app.post(ROUTES.logoutAll, (c) => {
    logoutAll(ctx, requireUser(c), requestMeta(c))
    clearSessionCookie(c, ctx.config)
    return c.json(OK)
  })

  app.get(ROUTES.me, (c) => {
    const { user } = requireUser(c)
    return c.json({ user: toApiUser(user) } satisfies MeResponse)
  })

  app.post(ROUTES.changePassword, async (c) => {
    const auth = requireUser(c)
    const input = await readJson(c, changePasswordRequestSchema)
    await changePassword(ctx, auth, input, requestMeta(c))
    return c.json(OK)
  })

  app.post(ROUTES.forgotPassword, async (c) => {
    ctx.limiter.consume(RATE_RULES.forgot, rateLimitKey(c.get('ip')))
    const { email } = await readJson(c, forgotPasswordRequestSchema)
    forgotPassword(ctx, email, requestMeta(c))
    return c.json(OK)
  })

  app.post(ROUTES.resetPassword, async (c) => {
    ctx.limiter.consume(RATE_RULES.reset, rateLimitKey(c.get('ip')))
    const input = await readJson(c, resetPasswordRequestSchema)
    await resetPassword(ctx, input, requestMeta(c))
    return c.json(OK)
  })

  return app
}
