/**
 * Çalışma alanı işleri: listele, oluştur, yeniden adlandır, sil, üyeleri yönet. Yetki kuralları permissions.ts'te.
 * Birden çok yazma içeren her iş tek işlemde (db.transaction) yapılır; denetim günlüğü de işlemin içindedir.
 * İş bitince ilgili kullanıcılara `poke` gönderilir (istemciler eşitleyip yeni alan listesini alır).
 *
 * Genişletme: yeni bir alan işlemi için önce permissions.ts'e kural, sonra buraya işlev, sonra routes.ts'e uç.
 */
import { AppError, type Member, type WorkspaceInfo, type WorkspaceRole } from '@uygulama/shared'
import type { AppContext } from '../../context.ts'
import type { RequestMeta } from '../../http/meta.ts'
import type { AuthState } from '../../http/types.ts'
import { newId } from '../../lib/random.ts'
import { MESSAGES } from '../../messages.ts'
import {
  assertCanDelete,
  assertCanLeave,
  assertCanManageMembers,
  assertCanRename,
  assertNotLastOwner,
  requireMembership,
} from './permissions.ts'
import {
  deleteMember,
  deleteWorkspace,
  findMember,
  insertMember,
  insertWorkspace,
  listMembers,
  listUserWorkspaces,
  memberUserIds,
  renameWorkspace,
  updateMemberRole,
  workspaceInfoFor,
} from './repo.ts'

/** Alan değişti: üyelere (ve gerekiyorsa çıkarılana) "eşitle" dürtmesi. */
export function pokeWorkspace(ctx: AppContext, workspaceId: string, extraUserIds: readonly string[] = []): void {
  const rev = ctx.db.get<{ rev: number }>('SELECT rev FROM workspaces WHERE id = ?', workspaceId)?.rev ?? 0
  ctx.hub.poke([...memberUserIds(ctx.db, workspaceId), ...extraUserIds], { workspaceId, rev, clientId: null })
}

function infoOrThrow(ctx: AppContext, workspaceId: string, userId: string): WorkspaceInfo {
  const info = workspaceInfoFor(ctx.db, workspaceId, userId)
  if (!info) throw new AppError('not_found', MESSAGES.workspaceNotFound)
  return info
}

/** Yeni kullanıcının kişisel alanını açar (kayıt işleminin içinde çağrılır). */
export function createPersonalWorkspace(ctx: AppContext, userId: string, now: string): string {
  const id = newId(ctx.clock, ctx.random)
  insertWorkspace(ctx.db, { id, name: MESSAGES.personalWorkspaceName, kind: 'personal', createdBy: userId, now })
  insertMember(ctx.db, { workspaceId: id, userId, role: 'owner', now })
  return id
}

export function listWorkspaces(ctx: AppContext, auth: AuthState): WorkspaceInfo[] {
  return listUserWorkspaces(ctx.db, auth.user.id)
}

export function createSharedWorkspace(
  ctx: AppContext,
  auth: AuthState,
  name: string,
  meta: RequestMeta,
): WorkspaceInfo {
  const userId = auth.user.id
  const id = ctx.db.transaction(() => {
    const workspaceId = newId(ctx.clock, ctx.random)
    const now = ctx.clock.now().toISOString()
    insertWorkspace(ctx.db, { id: workspaceId, name, kind: 'shared', createdBy: userId, now })
    insertMember(ctx.db, { workspaceId, userId, role: 'owner', now })
    ctx.audit.record({
      action: 'workspace.created',
      actorId: userId,
      targetType: 'workspace',
      targetId: workspaceId,
      workspaceId,
      ip: meta.ip,
    })
    return workspaceId
  })
  pokeWorkspace(ctx, id)
  return infoOrThrow(ctx, id, userId)
}

export function renameSharedWorkspace(
  ctx: AppContext,
  auth: AuthState,
  workspaceId: string,
  name: string,
  meta: RequestMeta,
): WorkspaceInfo {
  ctx.db.transaction(() => {
    assertCanRename(requireMembership(ctx.db, workspaceId, auth.user.id))
    renameWorkspace(ctx.db, workspaceId, name, ctx.clock.now().toISOString())
    ctx.audit.record({
      action: 'workspace.renamed',
      actorId: auth.user.id,
      targetType: 'workspace',
      targetId: workspaceId,
      workspaceId,
      ip: meta.ip,
    })
  })
  pokeWorkspace(ctx, workspaceId)
  return infoOrThrow(ctx, workspaceId, auth.user.id)
}

export function removeWorkspace(ctx: AppContext, auth: AuthState, workspaceId: string, meta: RequestMeta): void {
  const formerMembers = ctx.db.transaction(() => {
    assertCanDelete(requireMembership(ctx.db, workspaceId, auth.user.id))
    const members = memberUserIds(ctx.db, workspaceId)
    deleteWorkspace(ctx.db, workspaceId)
    ctx.audit.record({
      action: 'workspace.deleted',
      actorId: auth.user.id,
      targetType: 'workspace',
      targetId: workspaceId,
      workspaceId,
      ip: meta.ip,
    })
    return members
  })
  ctx.hub.poke(formerMembers, { workspaceId, rev: 0, clientId: null })
}

export function membersOf(ctx: AppContext, auth: AuthState, workspaceId: string): Member[] {
  requireMembership(ctx.db, workspaceId, auth.user.id)
  return listMembers(ctx.db, workspaceId)
}

export function changeMemberRole(
  ctx: AppContext,
  auth: AuthState,
  workspaceId: string,
  targetUserId: string,
  role: WorkspaceRole,
  meta: RequestMeta,
): Member {
  const member = ctx.db.transaction(() => {
    assertCanManageMembers(requireMembership(ctx.db, workspaceId, auth.user.id))
    const target = findMember(ctx.db, workspaceId, targetUserId)
    if (!target) throw new AppError('not_found', MESSAGES.memberNotFound)
    if (target.role === role) return target
    if (role !== 'owner') assertNotLastOwner(ctx.db, workspaceId, target.role)
    updateMemberRole(ctx.db, workspaceId, targetUserId, role)
    ctx.audit.record({
      action: 'member.role_changed',
      actorId: auth.user.id,
      targetType: 'user',
      targetId: targetUserId,
      workspaceId,
      ip: meta.ip,
      details: { from: target.role, to: role },
    })
    return { ...target, role }
  })
  pokeWorkspace(ctx, workspaceId)
  return member
}

/** Üyeyi çıkarır; kendini çıkarmak "ayrılmak"tır. */
export function removeMember(
  ctx: AppContext,
  auth: AuthState,
  workspaceId: string,
  targetUserId: string,
  meta: RequestMeta,
): void {
  ctx.db.transaction(() => {
    const membership = requireMembership(ctx.db, workspaceId, auth.user.id)
    if (targetUserId === auth.user.id) {
      assertCanLeave(ctx.db, membership)
    } else {
      assertCanManageMembers(membership)
      const target = findMember(ctx.db, workspaceId, targetUserId)
      if (!target) throw new AppError('not_found', MESSAGES.memberNotFound)
      assertNotLastOwner(ctx.db, workspaceId, target.role)
    }
    deleteMember(ctx.db, workspaceId, targetUserId)
    ctx.audit.record({
      action: 'member.removed',
      actorId: auth.user.id,
      targetType: 'user',
      targetId: targetUserId,
      workspaceId,
      ip: meta.ip,
      details: { self: targetUserId === auth.user.id },
    })
  })
  pokeWorkspace(ctx, workspaceId, [targetUserId])
}
