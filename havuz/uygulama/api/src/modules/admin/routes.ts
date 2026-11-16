/**
 * Yönetim uçları (yalnız `role: 'admin'`): kullanıcı listesi (arama + imleçli sayfalama), kullanıcı güncelle,
 * ölçümler (`GET /api/admin/metrics`).
 * `GET /api/admin/users?q=ayşe&limit=50&cursor=<önceki yanıttaki nextCursor>`
 *
 * Genişletme: yeni yönetici ucu `requireAdmin(c)` ile başlar; olumsuz testi ("yönetici olmayan 403 alır")
 * test/modules/admin.test.ts'e eklenir.
 */
import {
  adminUpdateUserRequestSchema,
  idSchema,
  type AdminMetricsResponse,
  type AdminUserResponse,
  type AdminUsersResponse,
} from '@uygulama/shared'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppContext } from '../../context.ts'
import { readIdParam, readJson, readQuery } from '../../http/body.ts'
import { requestMeta } from '../../http/meta.ts'
import { ROUTES } from '../../http/routes.ts'
import type { AppEnv } from '../../http/types.ts'
import { requireAdmin } from '../auth/session.ts'
import { metrics, searchUsers, updateUser } from './service.ts'

export const adminUsersQuerySchema = z.object({
  q: z.string().trim().max(100, 'Arama en çok 100 karakter olabilir.').default(''),
  cursor: idSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export function adminRoutes(ctx: AppContext): Hono<AppEnv> {
  const app = new Hono<AppEnv>()

  app.get(ROUTES.adminUsers, (c) => {
    requireAdmin(c)
    const query = readQuery(c, adminUsersQuerySchema)
    const result = searchUsers(ctx, { query: query.q, cursor: query.cursor ?? null, limit: query.limit })
    return c.json(result satisfies AdminUsersResponse)
  })

  app.patch(ROUTES.adminUser, async (c) => {
    const auth = requireAdmin(c)
    const userId = readIdParam(c, 'userId')
    const fields = await readJson(c, adminUpdateUserRequestSchema)
    const user = updateUser(ctx, auth, userId, fields, requestMeta(c))
    return c.json({ user } satisfies AdminUserResponse)
  })

  app.get(ROUTES.adminMetrics, (c) => {
    requireAdmin(c)
    return c.json(metrics(ctx) satisfies AdminMetricsResponse)
  })

  return app
}
