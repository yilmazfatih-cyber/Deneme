/**
 * CORS: başka bir kökenden (alan adından) çalışan istemcilere izin. Varsayılan KAPALI: ALLOWED_ORIGINS boşsa
 * hiçbir CORS başlığı gönderilmez ve tarayıcı başka kökenden okumayı engeller.
 *
 * Aynı kökenden sunulan web uygulaması (tek servis yayını) CORS'a ihtiyaç duymaz. Başka alan adındaki istemci
 * genellikle `X-Auth-Mode: token` ile giriş yapar ve `Authorization: Bearer` kullanır (bkz. docs/API.md).
 *
 * Genişletme: yeni bir istek başlığı kullanacaksanız `allowHeaders`'a ekleyin.
 */
import type { MiddlewareHandler } from 'hono'
import { cors } from 'hono/cors'
import type { AppEnv } from './types.ts'

export function corsMiddleware(allowedOrigins: readonly string[]): MiddlewareHandler<AppEnv> | null {
  if (allowedOrigins.length === 0) return null
  const allowed = new Set(allowedOrigins)
  return cors({
    origin: (origin) => (allowed.has(origin) ? origin : null),
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Auth-Mode', 'X-Client', 'X-Request-Id'],
    exposeHeaders: ['Retry-After', 'X-Request-Id', 'Content-Disposition'],
    credentials: true,
    maxAge: 600,
  })
}
