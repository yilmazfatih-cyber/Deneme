/**
 * Hata biçimi: her REST hatası `{ error: { code, message, traceId } }` (shared/types ApiError) olarak döner.
 * Yığın izi ya da iç hata metni istemciye sızmaz; gerçek hata sunucu günlüğüne yazılır.
 * Bilinmeyen adresler JSON 404 döner; SPA kabuğu kendi geri dönüşünü `setNotFoundFallback` ile ekler.
 */
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { ApiError } from '../../../shared/types'

/** Kodu ve Türkçe iletisi belli bir HTTP hatası. Uçlar bunu fırlatır; hata işleyici olduğu gibi yansıtır. */
export class ApiHttpError extends Error {
  statusCode: number
  code: string
  constructor(statusCode: number, code: string, message: string) {
    super(message)
    this.statusCode = statusCode
    this.code = code
  }
}

export const httpError = (statusCode: number, code: string, message: string): ApiHttpError =>
  new ApiHttpError(statusCode, code, message)

export function apiErrorBody(req: FastifyRequest, code: string, message: string): ApiError {
  return { error: { code, message, traceId: req.trace?.traceId } }
}

/** Kısayol: hata gövdesini durum koduyla yollar. */
export function sendApiError(req: FastifyRequest, reply: FastifyReply, status: number, code: string, message: string) {
  return reply
    .code(status)
    .type('application/json; charset=utf-8')
    .send(apiErrorBody(req, code, message))
}

/** Bulunamayan adres için ek işleyici (SPA kabuğu). true dönerse yanıtı kendisi vermiştir. */
export type NotFoundFallback = (req: FastifyRequest, reply: FastifyReply) => boolean | Promise<boolean>
const fallbacks = new WeakMap<FastifyInstance, NotFoundFallback>()

export function setNotFoundFallback(app: FastifyInstance, fn: NotFoundFallback): void {
  fallbacks.set(app, fn)
}

const STATUS_MESSAGES: Record<number, { code: string; message: string }> = {
  400: { code: 'BAD_REQUEST', message: 'İstek işlenemedi.' },
  401: { code: 'UNAUTHENTICATED', message: 'Önce giriş yapmalısınız.' },
  403: { code: 'FORBIDDEN', message: 'Bu işlem için izniniz yok.' },
  404: { code: 'NOT_FOUND', message: 'Aradığınız adres bulunamadı.' },
  405: { code: 'METHOD_NOT_ALLOWED', message: 'Bu yöntem bu adreste desteklenmiyor.' },
  413: { code: 'PAYLOAD_TOO_LARGE', message: 'İstek gövdesi çok büyük.' },
  415: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Desteklenmeyen içerik türü.' },
  429: { code: 'RATE_LIMITED', message: 'Çok fazla istek gönderildi; biraz sonra yeniden deneyin.' },
}

/** Fastify'ın kendi hata kodları için Türkçe karşılıklar. */
const FASTIFY_CODES: Record<string, { code: string; message: string }> = {
  FST_ERR_CTP_INVALID_JSON_BODY: { code: 'INVALID_BODY', message: 'İstek gövdesi geçerli JSON değil.' },
  FST_ERR_CTP_EMPTY_JSON_BODY: { code: 'INVALID_BODY', message: 'İstek gövdesi boş.' },
  FST_ERR_CTP_BODY_TOO_LARGE: { code: 'PAYLOAD_TOO_LARGE', message: 'İstek gövdesi çok büyük.' },
  FST_ERR_CTP_INVALID_MEDIA_TYPE: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Desteklenmeyen içerik türü.' },
  FST_ERR_CTP_INVALID_CONTENT_LENGTH: { code: 'INVALID_BODY', message: 'İstek gövdesinin uzunluğu hatalı.' },
}

export default async function plugin(app: FastifyInstance): Promise<void> {
  app.setErrorHandler((err: FastifyError, req, reply) => {
    if (err instanceof ApiHttpError) {
      return sendApiError(req, reply, err.statusCode, err.code, err.message)
    }
    if (err.validation) {
      return sendApiError(req, reply, 400, 'VALIDATION_FAILED', 'İstek geçersiz: alanları denetleyin.')
    }
    const status =
      typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500
    if (status >= 500) {
      req.log.error({ err, traceId: req.trace?.traceId }, 'beklenmeyen sunucu hatası')
      return sendApiError(req, reply, 500, 'INTERNAL', 'Beklenmeyen bir sunucu hatası oluştu.')
    }
    const known = (err.code && FASTIFY_CODES[err.code]) || STATUS_MESSAGES[status] || STATUS_MESSAGES[400]!
    req.log.info({ code: err.code, msg: err.message }, 'istemci hatası')
    return sendApiError(req, reply, status, known.code, known.message)
  })

  app.setNotFoundHandler(async (req, reply) => {
    const fallback = fallbacks.get(app)
    if (fallback && (await fallback(req, reply))) return reply
    return sendApiError(req, reply, 404, 'NOT_FOUND', 'Aradığınız adres bulunamadı.')
  })
}
