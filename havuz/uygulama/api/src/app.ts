/**
 * Uygulama fabrikası: `createApp(deps)` bütün ara katmanları ve modülleri bağlar, Hono uygulamasını döndürür.
 * Bağımlılıklar dışarıdan gelir (veritabanı, saat, rastgele kaynak, postacı, günlük, ayar) → testler ağsız,
 * `app.request(...)` ile koşar. Sunucuyu başlatan dosya: index.ts.
 *
 * Ara katman sırası (değiştirirken düşünün):
 *   istek kimliği + günlük → güvenlik başlıkları → CORS → genel hız sınırı → gövde sınırı → CSRF → oturum → uçlar
 *   → (WEB_DIST varsa) web uygulaması → JSON 404.
 *
 * Genişletme: yeni modül için `src/modules/<ad>/routes.ts` yazın ve aşağıdaki "YENİ MODÜL BURAYA" satırına
 * `app.route('/', <ad>Routes(ctx))` ekleyin. Tarif: TARIFLER.md → "Yeni uç nokta ekle".
 */
import { Hono } from 'hono'
import { createContext, type AppContext, type Deps } from './context.ts'
import { bodyLimits } from './http/bodyLimit.ts'
import { corsMiddleware } from './http/cors.ts'
import { csrfProtection } from './http/csrf.ts'
import { apiNotFound, createErrorHandler } from './http/errors.ts'
import { rateLimit, RATE_RULES } from './http/rateLimit.ts'
import { requestContext } from './http/requestLog.ts'
import { securityHeaders } from './http/securityHeaders.ts'
import { staticWeb } from './http/static.ts'
import type { AppEnv } from './http/types.ts'
import { accountRoutes } from './modules/account/routes.ts'
import { adminRoutes } from './modules/admin/routes.ts'
import { authRoutes } from './modules/auth/routes.ts'
import { sessionMiddleware } from './modules/auth/session.ts'
import { eventRoutes } from './modules/events/routes.ts'
import { healthRoutes } from './modules/health/routes.ts'
import { inviteRoutes } from './modules/invites/routes.ts'
import { syncRoutes } from './modules/sync/routes.ts'
import { workspaceRoutes } from './modules/workspaces/routes.ts'

export interface ServerApp {
  readonly app: Hono<AppEnv>
  readonly ctx: AppContext
  /** Web uygulaması sunuluyor mu (WEB_DIST hazır mı)? */
  readonly servesWeb: boolean
  /** Açık anlık bağlantıları kapatır ve arka plan işlerinin bitmesini bekler. */
  close(): Promise<void>
}

export function createApp(deps: Deps): ServerApp {
  const ctx = createContext(deps)
  const { config } = ctx
  const app = new Hono<AppEnv>()

  app.use('*', requestContext({ logger: ctx.logger, trustProxy: config.trustProxy }))
  app.use('*', securityHeaders({ production: config.isProduction }))
  const cors = corsMiddleware(config.allowedOrigins)
  if (cors) app.use('/api/*', cors)
  app.use(
    '/api/*',
    rateLimit(ctx.limiter, RATE_RULES.general, (c) => c.get('ip')),
  )
  app.use('/api/*', bodyLimits())
  app.use(
    '/api/*',
    csrfProtection({ allowedOrigins: [config.appOrigin, ...config.allowedOrigins], trustProxy: config.trustProxy }),
  )
  app.use('/api/*', sessionMiddleware(ctx))

  app.route('/', healthRoutes(ctx))
  app.route('/', authRoutes(ctx))
  app.route('/', accountRoutes(ctx))
  app.route('/', workspaceRoutes(ctx))
  app.route('/', inviteRoutes(ctx))
  app.route('/', syncRoutes(ctx))
  app.route('/', eventRoutes(ctx))
  app.route('/', adminRoutes(ctx))
  // YENİ MODÜL BURAYA: app.route('/', ornekRoutes(ctx))

  const web = staticWeb(config.webDist)
  if (web) app.get('*', web)
  app.notFound(apiNotFound)
  app.onError(createErrorHandler(ctx.logger))

  return {
    app,
    ctx,
    servesWeb: web !== null,
    async close() {
      ctx.hub.closeAll()
      await ctx.jobs.idle()
    },
  }
}
