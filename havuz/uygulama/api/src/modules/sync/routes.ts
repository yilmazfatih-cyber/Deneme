/**
 * `POST /api/sync`: tek eşitleme ucu. Oturum ister, kullanıcı başına hız sınırı uygular, işi service.ts'e verir,
 * işlem bittikten SONRA değişen alanların üyelerine `poke` gönderir (değişikliği yapan cihaz `clientId` ile
 * kendi dürtmesini tanır ve yok sayar).
 *
 * Genişletme: burada iş mantığı yazmayın; protokol davranışı service.ts + shared'dadır.
 */
import type { SyncResponse } from '@uygulama/shared'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppContext } from '../../context.ts'
import { readJson } from '../../http/body.ts'
import { RATE_RULES } from '../../http/rateLimit.ts'
import { ROUTES } from '../../http/routes.ts'
import type { AppEnv } from '../../http/types.ts'
import { requireUser } from '../auth/session.ts'
import { memberUserIds } from '../workspaces/repo.ts'
import { runSync } from './service.ts'

export function syncRoutes(ctx: AppContext): Hono<AppEnv> {
  const app = new Hono<AppEnv>()
  const deps = { db: ctx.db, clock: ctx.clock, registry: ctx.registry, pageSize: ctx.config.syncPageSize }

  app.post(ROUTES.sync, async (c) => {
    const { user } = requireUser(c)
    ctx.limiter.consume(RATE_RULES.sync, user.id)
    // Gövde burada yalnız JSON olarak okunur; şema doğrulaması (ve hata iletisi) service.ts'tedir.
    const raw = await readJson(c, z.unknown())
    const { response, changed, clientId } = runSync(deps, user.id, raw)
    for (const [workspaceId, rev] of changed) {
      ctx.hub.poke(memberUserIds(ctx.db, workspaceId), { workspaceId, rev, clientId })
    }
    return c.json(response satisfies SyncResponse)
  })

  return app
}
