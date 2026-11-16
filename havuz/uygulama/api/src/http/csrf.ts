/**
 * Siteler arası istek sahteciliği (CSRF) koruması. Çerezle kimlik doğrulayan tarayıcı istemcisini korur:
 * kötü niyetli bir site, kullanıcının tarayıcısına bizim API'mize istek attıramasın.
 *
 * Katmanlar (hepsi birlikte):
 *  1. Çerez `SameSite=Lax`: başka sitelerden gelen POST/PATCH/DELETE isteklerine tarayıcı çerezi eklemez.
 *  2. Bu ara katman: değiştiren (GET/HEAD/OPTIONS dışı) isteklerde `Sec-Fetch-Site` ve `Origin` başlıklarına bakar;
 *     istek kendi kökenimizden, APP_URL'den ya da ALLOWED_ORIGINS listesinden gelmiyorsa 403 döner.
 *     İki başlık da yoksa istek tarayıcıdan gelmiyordur (curl, sunucu) → geçer; çünkü tarayıcılar bu başlıkları
 *     siteler arası isteklerde her zaman gönderir.
 *  3. Gövdeli uçlar `Content-Type: application/json` ister (body.ts): HTML formları JSON gönderemez.
 * `Authorization: Bearer` ile gelen istekler bu denetimden muaftır: belirteci tarayıcı kendiliğinden eklemez.
 *
 * Genişletme: başka bir kökendeki istemciye izin vermek için kod değil ayar değişir: ALLOWED_ORIGINS.
 */
import { AppError } from '@uygulama/shared'
import type { Context, MiddlewareHandler } from 'hono'
import { MESSAGES } from '../messages.ts'
import type { AppEnv } from './types.ts'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/** İsteğin geldiği adresin kökeni (vekil arkasında X-Forwarded-Proto'ya göre). */
export function ownOrigin(c: Context<AppEnv>, trustProxy: number): string {
  const url = new URL(c.req.url)
  const forwardedProto = trustProxy > 0 ? c.req.header('x-forwarded-proto')?.split(',')[0]?.trim() : undefined
  const protocol = forwardedProto === 'https' || forwardedProto === 'http' ? `${forwardedProto}:` : url.protocol
  return `${protocol}//${url.host}`
}

export function isBearerRequest(c: Context<AppEnv>): boolean {
  return /^Bearer\s+/i.test(c.req.header('authorization') ?? '')
}

export function csrfProtection(options: {
  allowedOrigins: readonly string[]
  trustProxy: number
}): MiddlewareHandler<AppEnv> {
  const allowed = new Set(options.allowedOrigins)
  return async (c, next) => {
    if (SAFE_METHODS.has(c.req.method) || isBearerRequest(c)) return next()
    const origin = c.req.header('origin')
    const site = c.req.header('sec-fetch-site')
    const originAllowed = origin !== undefined && (allowed.has(origin) || origin === ownOrigin(c, options.trustProxy))
    if (site !== undefined) {
      if (site === 'same-origin' || site === 'none' || originAllowed) return next()
      throw new AppError('forbidden', MESSAGES.crossSiteBlocked)
    }
    if (origin !== undefined && !originAllowed) throw new AppError('forbidden', MESSAGES.crossSiteBlocked)
    return next()
  }
}
