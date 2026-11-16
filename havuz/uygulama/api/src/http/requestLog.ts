/**
 * İstek bağlamı + erişim günlüğü. Her isteğe bir kimlik verir (`X-Request-Id`; istemci geçerli bir değer
 * gönderdiyse o kullanılır), IP'yi çözer ve bitince tek satırlık JSON günlük yazar.
 *
 * Günlüğe adres KALIBI yazılır (`/api/invites/:token`), gerçek adres değil: adreste belirteç olabilir.
 * Sorgu dizgisi (?q=…) hiç yazılmaz (arama metni e-posta içerebilir).
 *
 * Genişletme: günlüğe alan eklerken logger.ts'teki YASAK listesine uyun (parola, belirteç, e-posta yok).
 */
import { randomUUID } from 'node:crypto'
import type { MiddlewareHandler } from 'hono'
import { matchedRoutes } from 'hono/route'
import type { Logger } from '../lib/logger.ts'
import { clientIp } from './clientIp.ts'
import type { AppEnv } from './types.ts'

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/
const CLIENT_PATTERN = /^[\w./ -]{1,40}$/

export function requestContext(options: { logger: Logger; trustProxy: number }): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const started = performance.now()
    const incoming = c.req.header('x-request-id')
    const requestId = incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID()
    c.set('requestId', requestId)
    c.set('ip', clientIp(c, options.trustProxy))
    c.set('auth', null)
    c.set('authError', null)
    await next()
    c.res.headers.set('X-Request-Id', requestId)
    const isApi = c.req.path.startsWith('/api/')
    const route = isApi
      ? (matchedRoutes(c)
          .filter((item) => item.method !== 'ALL')
          .at(-1)?.path ?? '(eşleşmeyen)')
      : c.req.path
    const client = c.req.header('x-client')
    const status = c.res.status
    const fields = {
      requestId,
      method: c.req.method,
      route,
      status,
      ms: Math.round(performance.now() - started),
      ip: c.get('ip'),
      userId: c.get('auth')?.user.id,
      client: client && CLIENT_PATTERN.test(client) ? client : undefined,
    }
    if (status >= 500) options.logger.warn('istek', fields)
    else options.logger.info('istek', fields)
  }
}
