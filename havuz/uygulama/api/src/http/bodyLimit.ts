/**
 * İstek gövdesi boyut sınırı: çok büyük gövdeyle belleği doldurma saldırısını keser. Aşılırsa 413
 * `payload_too_large` döner (istemci eşitlemede bunu görünce daha küçük parti gönderebilir).
 *
 * Eşitleme ucu daha büyük sınır alır: bir istekte en çok 100 değişiklik × kayıt başına 64 KiB (+ JSON payı).
 *
 * Genişletme: dosya yükleme gibi büyük gövdeli yeni bir uç için LIMITS'e satır ekleyip `bodyLimits` içinde
 * o adrese özel sınırı seçin.
 */
import { AppError, SYNC_LIMITS } from '@uygulama/shared'
import type { MiddlewareHandler } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { ROUTES } from './routes.ts'
import type { AppEnv } from './types.ts'

export const BODY_LIMITS = {
  /** Kimlik, hesap, alan uçları: küçük JSON gövdeler. */
  default: 64 * 1024,
  /** Eşitleme: 100 × 64 KiB + şemada olmayan alanlar ve JSON yükü için pay. */
  sync: SYNC_LIMITS.maxMutationsPerRequest * SYNC_LIMITS.maxRecordBytes + 2 * 1024 * 1024,
} as const

export function bodyLimits(): MiddlewareHandler<AppEnv> {
  const tooLarge = (): never => {
    throw new AppError('payload_too_large')
  }
  const small = bodyLimit({ maxSize: BODY_LIMITS.default, onError: tooLarge })
  const large = bodyLimit({ maxSize: BODY_LIMITS.sync, onError: tooLarge })
  return (c, next) => (c.req.path === ROUTES.sync ? large(c, next) : small(c, next))
}
