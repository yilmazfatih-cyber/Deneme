/**
 * Hata → HTTP yanıtı. Her hata sözleşmedeki gövdeyle döner: `{ "error": { "code", "message", "details"? } }`
 * (shared/src/errors.ts). İşleyiciler yalnız `throw new AppError('kod')` yazar; gerisini burası yapar.
 * Beklenmeyen hatalar 500 `internal` olur, ayrıntısı yalnız günlüğe yazılır (istemciye sızmaz).
 *
 * Genişletme: yeni hata kodu shared/src/errors.ts'e eklenir (üç yer); burada değişiklik gerekmez.
 */
import { AppError, isAppError, type ErrorCode } from '@uygulama/shared'
import type { Context, ErrorHandler, NotFoundHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { errorFields, type Logger } from '../lib/logger.ts'
import { MESSAGES } from '../messages.ts'
import type { AppEnv } from './types.ts'

export function errorResponse(c: Context<AppEnv>, error: AppError): Response {
  if (error.code === 'rate_limited') {
    const retryAfter = (error.details as { retryAfter?: unknown } | undefined)?.retryAfter
    if (typeof retryAfter === 'number') c.header('Retry-After', String(retryAfter))
  }
  return c.json(error.toBody(), error.status as ContentfulStatusCode)
}

const HTTP_STATUS_CODES: Partial<Record<number, ErrorCode>> = {
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  413: 'payload_too_large',
}

/** Hono'nun kendi hatalarını (gövde sınırı vb.) sözleşmedeki kodlara çevirir. */
function fromHttpException(error: HTTPException): AppError {
  const code = HTTP_STATUS_CODES[error.status] ?? (error.status < 500 ? 'validation' : 'internal')
  return new AppError(code)
}

export function createErrorHandler(logger: Logger): ErrorHandler<AppEnv> {
  return (error, c) => {
    if (isAppError(error)) return errorResponse(c, error)
    if (error instanceof HTTPException) return errorResponse(c, fromHttpException(error))
    logger.error('beklenmeyen hata', { requestId: c.get('requestId'), ...errorFields(error) })
    return errorResponse(c, new AppError('internal'))
  }
}

/** /api altında bilinmeyen adres: JSON 404 (web uygulamasının yedeğine düşmez). */
export const apiNotFound: NotFoundHandler<AppEnv> = (c) =>
  errorResponse(c, new AppError('not_found', MESSAGES.routeNotFound))
