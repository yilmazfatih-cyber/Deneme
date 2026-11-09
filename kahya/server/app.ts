// Uygulama: API yönlendiricileri, güvenlik başlıkları, hata yakalama ve (derlenmişse) arayüz dosyaları.
import { join } from 'node:path'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { csrf } from 'hono/csrf'
import { HTTPException } from 'hono/http-exception'
import { secureHeaders } from 'hono/secure-headers'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { ZodError } from 'zod'
import { residentOnly, staffOnly } from './auth/auth.ts'
import { HttpError, type Deps, type Env } from './http.ts'
import { adminRoutes } from './routes/admin.ts'
import { authRoutes } from './routes/auth.ts'
import { financeRoutes } from './routes/finance.ts'
import { governanceRoutes } from './routes/governance.ts'
import { opsRoutes } from './routes/ops.ts'
import { portalRoutes } from './routes/portal.ts'
import { portfolioRoutes } from './routes/portfolio.ts'
import { webhookRoutes } from './routes/webhooks.ts'

export const VERSION = '0.1.0'

export function createApp(deps: Deps, opts: { staticDir?: string } = {}) {
  const app = new Hono<Env>()

  app.use(
    '*',
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameSrc: ['https://www.paytr.com'],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
      },
      referrerPolicy: 'strict-origin-when-cross-origin',
    }),
  )
  app.use('/api/*', bodyLimit({ maxSize: 8 * 1024 * 1024, onError: (c) => c.json({ error: 'İstek çok büyük' }, 413) }))
  const sameOrigin = csrf({
    origin: (origin, c) => origin === new URL(c.req.url).origin || origin === deps.config.publicUrl,
  })
  app.use('/api/auth/*', sameOrigin)
  app.use('/api/y/*', sameOrigin)
  app.use('/api/portal/*', sameOrigin)

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message }, err.status as ContentfulStatusCode)
    if (err instanceof HTTPException) {
      return c.json(
        { error: err.status === 403 ? 'İstek reddedildi (kaynak doğrulanamadı)' : err.message || 'İstek reddedildi' },
        err.status,
      )
    }
    if (err instanceof ZodError)
      return c.json({ error: `Eksik veya hatalı alan — ${err.issues.map((i) => i.message).join('; ')}` }, 400)
    console.error('[hata]', err)
    return c.json({ error: 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.' }, 500)
  })

  app.get('/api/health', (c) =>
    c.json({
      ok: true,
      version: VERSION,
      ai: deps.ai.describe().engine,
      demo: deps.config.demo,
      time: deps.now().toISOString(),
    }),
  )
  app.route('/api/auth', authRoutes(deps))
  app.route('/api/webhooks', webhookRoutes(deps))

  const staff = new Hono<Env>()
  staff.use('*', staffOnly(deps))
  staff.route('/', adminRoutes(deps))
  staff.route('/', portfolioRoutes(deps))
  staff.route('/', financeRoutes(deps))
  staff.route('/', opsRoutes(deps))
  staff.route('/', governanceRoutes(deps))
  app.route('/api/y', staff)

  const portal = new Hono<Env>()
  portal.use('*', residentOnly(deps))
  portal.route('/', portalRoutes(deps))
  app.route('/api/portal', portal)

  app.all('/api/*', (c) => c.json({ error: 'Bulunamadı' }, 404))

  if (opts.staticDir) {
    const root = opts.staticDir
    app.use('/assets/*', async (c, next) => {
      await next()
      c.header('Cache-Control', 'public, max-age=31536000, immutable')
    })
    app.use('/*', serveStatic({ root }))
    // Tek sayfa uygulaması: bilinmeyen yollar index.html'e düşer (BrowserRouter)
    app.get('*', serveStatic({ path: join(root, 'index.html') }))
  }
  return app
}
