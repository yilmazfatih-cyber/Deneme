/**
 * Davet uçları: oluştur (alan sahibi), önizle (oturum gerekmez; bağlantıyı açan herkes görür), kabul et (oturum).
 * Önizleme oturumsuzdur ki giriş yapmamış alıcı "Ayşe sizi 'Ev' alanına davet etti" ekranını görebilsin.
 *
 * Genişletme: davet listesi/iptali gibi yeni uçlar için shared'a adres + şema, buraya işleyici, docs/API.md.
 */
import {
  acceptInviteRequestSchema,
  createInviteRequestSchema,
  tokenSchema,
  type InvitePreview,
  type InviteResponse,
  type WorkspaceResponse,
} from '@uygulama/shared'
import { Hono } from 'hono'
import type { AppContext } from '../../context.ts'
import { readIdParam, readJson } from '../../http/body.ts'
import { requestMeta } from '../../http/meta.ts'
import { ROUTES } from '../../http/routes.ts'
import type { AppEnv } from '../../http/types.ts'
import { requireUser } from '../auth/session.ts'
import { acceptInvite, createInvite, previewInvite } from './service.ts'

export function inviteRoutes(ctx: AppContext): Hono<AppEnv> {
  const app = new Hono<AppEnv>()

  app.post(ROUTES.invites, async (c) => {
    const auth = requireUser(c)
    const workspaceId = readIdParam(c, 'workspaceId')
    const { role } = await readJson(c, createInviteRequestSchema)
    const invite = createInvite(ctx, auth, workspaceId, role, requestMeta(c))
    return c.json({ invite } satisfies InviteResponse, 201)
  })

  // Not: '/api/invites/accept' POST'tur; bu GET kalıbıyla çakışmaz.
  app.get(ROUTES.invitePreview, (c) => {
    const token = tokenSchema.safeParse(c.req.param('token'))
    const preview: InvitePreview = previewInvite(ctx, token.success ? token.data : '')
    return c.json(preview)
  })

  app.post(ROUTES.acceptInvite, async (c) => {
    const auth = requireUser(c)
    const { token } = await readJson(c, acceptInviteRequestSchema)
    const workspace = acceptInvite(ctx, auth, token, requestMeta(c))
    return c.json({ workspace } satisfies WorkspaceResponse)
  })

  return app
}
