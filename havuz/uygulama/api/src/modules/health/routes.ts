/**
 * Sağlık ucu: `GET /api/health` → `{ ok: true, version, time }`. Barındırma servisi (Render, Docker
 * HEALTHCHECK) ve uçtan uca testler sunucunun ayakta olduğunu buradan anlar. Veritabanına bir sorgu atar;
 * veritabanı yanıt vermezse 500 döner. Oturum gerekmez.
 *
 * Genişletme: en küçük uç örneğidir; oturumsuz yeni bir uç eklerken test/rules.test.ts → PUBLIC_ROUTES'a da yazın.
 */
import type { HealthResponse } from '@uygulama/shared'
import { Hono } from 'hono'
import type { AppContext } from '../../context.ts'
import { ROUTES } from '../../http/routes.ts'
import type { AppEnv } from '../../http/types.ts'

export function healthRoutes(ctx: AppContext): Hono<AppEnv> {
  const app = new Hono<AppEnv>()

  app.get(ROUTES.health, (c) => {
    ctx.db.get('SELECT 1')
    return c.json({
      ok: true,
      version: ctx.config.version,
      time: ctx.clock.now().toISOString(),
    } satisfies HealthResponse)
  })

  return app
}
