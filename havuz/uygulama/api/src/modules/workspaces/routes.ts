/**
 * Çalışma alanı uçları: listele, oluştur, yeniden adlandır, sil; üyeleri listele, rol değiştir, çıkar/ayrıl.
 * Her uç oturum ister (`requireUser`); yetki kuralları servis → permissions.ts'te.
 * Döküm ve curl örnekleri: docs/API.md → "Çalışma alanları".
 *
 * Genişletme: yeni uç için önce shared/src/api.ts'e şema + API_PATHS, sonra src/http/routes.ts'e kalıp, sonra
 * buraya işleyici (gövde `readJson`, parametre `readIdParam`), sonra docs/API.md + test.
 */
import {
  createWorkspaceRequestSchema,
  updateMemberRequestSchema,
  updateWorkspaceRequestSchema,
  type MemberResponse,
  type MembersResponse,
  type WorkspaceResponse,
  type WorkspacesResponse,
} from '@uygulama/shared'
import { Hono } from 'hono'
import type { AppContext } from '../../context.ts'
import { readIdParam, readJson } from '../../http/body.ts'
import { requestMeta } from '../../http/meta.ts'
import { OK } from '../../http/responses.ts'
import { ROUTES } from '../../http/routes.ts'
import type { AppEnv } from '../../http/types.ts'
import { requireUser } from '../auth/session.ts'
import {
  changeMemberRole,
  createSharedWorkspace,
  listWorkspaces,
  membersOf,
  removeMember,
  removeWorkspace,
  renameSharedWorkspace,
} from './service.ts'

export function workspaceRoutes(ctx: AppContext): Hono<AppEnv> {
  const app = new Hono<AppEnv>()

  app.get(ROUTES.workspaces, (c) => {
    const auth = requireUser(c)
    return c.json({ workspaces: listWorkspaces(ctx, auth) } satisfies WorkspacesResponse)
  })

  app.post(ROUTES.workspaces, async (c) => {
    const auth = requireUser(c)
    const { name } = await readJson(c, createWorkspaceRequestSchema)
    const workspace = createSharedWorkspace(ctx, auth, name, requestMeta(c))
    return c.json({ workspace } satisfies WorkspaceResponse, 201)
  })

  app.patch(ROUTES.workspace, async (c) => {
    const auth = requireUser(c)
    const workspaceId = readIdParam(c, 'workspaceId')
    const { name } = await readJson(c, updateWorkspaceRequestSchema)
    const workspace = renameSharedWorkspace(ctx, auth, workspaceId, name, requestMeta(c))
    return c.json({ workspace } satisfies WorkspaceResponse)
  })

  app.delete(ROUTES.workspace, (c) => {
    const auth = requireUser(c)
    removeWorkspace(ctx, auth, readIdParam(c, 'workspaceId'), requestMeta(c))
    return c.json(OK)
  })

  app.get(ROUTES.members, (c) => {
    const auth = requireUser(c)
    return c.json({ members: membersOf(ctx, auth, readIdParam(c, 'workspaceId')) } satisfies MembersResponse)
  })

  app.patch(ROUTES.member, async (c) => {
    const auth = requireUser(c)
    const workspaceId = readIdParam(c, 'workspaceId')
    const userId = readIdParam(c, 'userId')
    const { role } = await readJson(c, updateMemberRequestSchema)
    const member = changeMemberRole(ctx, auth, workspaceId, userId, role, requestMeta(c))
    return c.json({ member } satisfies MemberResponse)
  })

  app.delete(ROUTES.member, (c) => {
    const auth = requireUser(c)
    removeMember(ctx, auth, readIdParam(c, 'workspaceId'), readIdParam(c, 'userId'), requestMeta(c))
    return c.json(OK)
  })

  return app
}
