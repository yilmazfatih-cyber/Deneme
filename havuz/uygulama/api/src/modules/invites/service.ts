/**
 * Davetler: alan sahibi tek kullanımlık, süreli (INVITE_TTL: 7 gün) bir bağlantı üretir; bağlantıyı açan kişi
 * önizler (alan adı, rol, davet eden) ve giriş yapmışsa kabul eder.
 *
 * Güvenlik: belirteç 32 bayt rastgeledir, yalnız özeti saklanır; kullanılmış, süresi dolmuş ya da bilinmeyen
 * belirteç aynı yanıtı alır (`invalid_token`). Zaten üye olan biri kabul ederse davet HARCANMAZ (asıl alıcı
 * yine kullanabilsin). Davetle `owner` verilmez; sahiplik üyeler arasında rol değişikliğiyle devredilir.
 *
 * Genişletme: davetin e-postayla gönderilmesi istenirse mail/templates.ts'e şablon ekleyip `createInvite` sonunda
 * `ctx.jobs.run(...)` ile gönderin (alıcı e-postasını isteğe eklemek shared şemasında değişiklik ister).
 */
import { AppError, type Invite, type InvitePreview, type InviteRole, type WorkspaceInfo } from '@uygulama/shared'
import type { AppContext } from '../../context.ts'
import type { RequestMeta } from '../../http/meta.ts'
import type { AuthState } from '../../http/types.ts'
import { addDays, hashToken, isTokenFormat, newToken } from '../../lib/random.ts'
import { MESSAGES } from '../../messages.ts'
import { findUserById } from '../auth/userRepo.ts'
import { assertCanInvite, requireMembership } from '../workspaces/permissions.ts'
import { findRole, findWorkspace, insertMember, workspaceInfoFor } from '../workspaces/repo.ts'
import { pokeWorkspace } from '../workspaces/service.ts'
import { findInvite, insertInvite, markInviteUsed, type InviteRow } from './repo.ts'

export function createInvite(
  ctx: AppContext,
  auth: AuthState,
  workspaceId: string,
  role: InviteRole,
  meta: RequestMeta,
): Invite {
  return ctx.db.transaction(() => {
    assertCanInvite(requireMembership(ctx.db, workspaceId, auth.user.id))
    const now = ctx.clock.now()
    const token = newToken(ctx.random)
    const expiresAt = addDays(now, ctx.config.inviteTtlDays).toISOString()
    insertInvite(ctx.db, {
      tokenHash: hashToken(token),
      workspaceId,
      role,
      createdBy: auth.user.id,
      now: now.toISOString(),
      expiresAt,
    })
    ctx.audit.record({
      action: 'invite.created',
      actorId: auth.user.id,
      targetType: 'workspace',
      targetId: workspaceId,
      workspaceId,
      ip: meta.ip,
      details: { role },
    })
    return { token, role, expiresAt }
  })
}

/** Geçerli (var, kullanılmamış, süresi dolmamış) daveti bulur; yoksa `invalid_token`. */
function usableInvite(ctx: AppContext, token: string): InviteRow {
  const invite = isTokenFormat(token) ? findInvite(ctx.db, hashToken(token)) : undefined
  if (!invite || invite.used_at !== null || invite.expires_at <= ctx.clock.now().toISOString()) {
    throw new AppError('invalid_token')
  }
  return invite
}

export function previewInvite(ctx: AppContext, token: string): InvitePreview {
  const invite = usableInvite(ctx, token)
  const workspace = findWorkspace(ctx.db, invite.workspace_id)
  if (!workspace) throw new AppError('invalid_token')
  const inviter = invite.created_by ? findUserById(ctx.db, invite.created_by) : undefined
  return {
    workspaceName: workspace.name,
    role: invite.role,
    invitedBy: inviter?.name ?? MESSAGES.unknownInviter,
    expiresAt: invite.expires_at,
  }
}

export function acceptInvite(ctx: AppContext, auth: AuthState, token: string, meta: RequestMeta): WorkspaceInfo {
  const userId = auth.user.id
  const workspaceId = ctx.db.transaction(() => {
    const invite = usableInvite(ctx, token)
    if (findRole(ctx.db, invite.workspace_id, userId)) return invite.workspace_id
    const now = ctx.clock.now().toISOString()
    insertMember(ctx.db, { workspaceId: invite.workspace_id, userId, role: invite.role, now })
    markInviteUsed(ctx.db, invite.token_hash, userId, now)
    ctx.audit.record({
      action: 'member.added',
      actorId: userId,
      targetType: 'user',
      targetId: userId,
      workspaceId: invite.workspace_id,
      ip: meta.ip,
      details: { role: invite.role, via: 'invite' },
    })
    return invite.workspace_id
  })
  pokeWorkspace(ctx, workspaceId)
  const info = workspaceInfoFor(ctx.db, workspaceId, userId)
  if (!info) throw new AppError('invalid_token')
  return info
}
