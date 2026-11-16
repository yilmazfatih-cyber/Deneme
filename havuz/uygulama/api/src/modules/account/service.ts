/**
 * ÖRNEK MODÜL (kopyalanacak kalıp): hesap işleri — adı güncelle, verilerimi dışa aktar, hesabı sil.
 * Yeni bir sunucu özelliği yazarken bu klasörü örnek alın: routes.ts (HTTP: kimlik + gövde doğrulama + yanıt),
 * service.ts (iş kuralı + işlem), *Repo/repo.ts (SQL), test/modules/account.test.ts (mutlu yol + yetki + hata).
 *
 * Hesap silme kuralı: kişisel alan ve kayıtları silinir. Tek sahibi olunan paylaşımlı alanda başka üye varsa
 * sahiplik EN ESKİ üyeye geçer, yoksa alan silinir. Hepsi tek işlemde; hata olursa hiçbir şey silinmez.
 *
 * Genişletme: dışa aktarıma yeni bir veri türü eklenecekse `accountExportSchema`'ya alan ve `exportAccount`'a sorgu.
 */
import {
  AppError,
  serverRecordSchema,
  userSchema,
  workspaceInfoSchema,
  type WorkspaceKind,
  type WorkspaceRole,
} from '@uygulama/shared'
import { z } from 'zod'
import type { AppContext } from '../../context.ts'
import type { RequestMeta } from '../../http/meta.ts'
import { rateLimitKey } from '../../http/clientIp.ts'
import { RATE_RULES } from '../../http/rateLimit.ts'
import type { AuthState, AuthUser } from '../../http/types.ts'
import { MESSAGES } from '../../messages.ts'
import { deleteUser, findUserById, toApiUser, toAuthUser, updateUserName } from '../auth/userRepo.ts'
import { recordsSince, toServerRecord } from '../sync/repo.ts'
import {
  countOwners,
  deleteWorkspace,
  listUserWorkspaces,
  oldestOtherMember,
  updateMemberRole,
} from '../workspaces/repo.ts'
import { pokeWorkspace } from '../workspaces/service.ts'

export const ACCOUNT_EXPORT_FORMAT = 'uygulama-disa-aktarim/1'

/** `GET /api/account/export` yanıtı. Başka kullanıcıların e-postası/adı (üye listeleri) dışa aktarılmaz. */
export const accountExportSchema = z.object({
  format: z.literal(ACCOUNT_EXPORT_FORMAT),
  exportedAt: z.iso.datetime(),
  user: userSchema,
  workspaces: z.array(workspaceInfoSchema),
  records: z.array(serverRecordSchema),
})
export type AccountExport = z.infer<typeof accountExportSchema>

export function updateProfile(ctx: AppContext, auth: AuthState, name: string, meta: RequestMeta): AuthUser {
  return ctx.db.transaction(() => {
    updateUserName(ctx.db, auth.user.id, name, auth.user.email, ctx.clock.now().toISOString())
    ctx.audit.record({
      action: 'account.updated',
      actorId: auth.user.id,
      targetType: 'user',
      targetId: auth.user.id,
      ip: meta.ip,
    })
    const row = findUserById(ctx.db, auth.user.id)
    if (!row) throw new AppError('unauthorized')
    return toAuthUser(row)
  })
}

export function exportAccount(ctx: AppContext, auth: AuthState): AccountExport {
  const workspaces = listUserWorkspaces(ctx.db, auth.user.id)
  const records = workspaces.flatMap((workspace) =>
    recordsSince(ctx.db, workspace.id, 0, Number.MAX_SAFE_INTEGER).map(toServerRecord),
  )
  return {
    format: ACCOUNT_EXPORT_FORMAT,
    exportedAt: ctx.clock.now().toISOString(),
    user: toApiUser(auth.user),
    workspaces,
    records,
  }
}

interface MembershipRow {
  workspace_id: string
  role: WorkspaceRole
  kind: WorkspaceKind
}

export async function deleteAccount(
  ctx: AppContext,
  auth: AuthState,
  password: string,
  meta: RequestMeta,
): Promise<void> {
  const userId = auth.user.id
  ctx.limiter.consume(RATE_RULES.loginAccount, `${rateLimitKey(meta.ip)}|${auth.user.email}`)
  const row = findUserById(ctx.db, userId)
  if (!row || !(await ctx.hasher.verify(password, row.password_hash))) {
    throw new AppError('invalid_credentials', MESSAGES.wrongCurrentPassword, [
      { path: 'password', message: MESSAGES.wrongCurrentPassword },
    ])
  }
  const affected = ctx.db.transaction(() => {
    const memberships = ctx.db.all<MembershipRow>(
      'SELECT m.workspace_id, m.role, w.kind FROM members AS m JOIN workspaces AS w ON w.id = m.workspace_id WHERE m.user_id = ?',
      userId,
    )
    const stillShared: string[] = []
    for (const membership of memberships) {
      const workspaceId = membership.workspace_id
      if (membership.kind === 'personal') {
        deleteWorkspace(ctx.db, workspaceId)
        continue
      }
      if (membership.role === 'owner' && countOwners(ctx.db, workspaceId) === 1) {
        const heir = oldestOtherMember(ctx.db, workspaceId, userId)
        if (!heir) {
          deleteWorkspace(ctx.db, workspaceId)
          continue
        }
        updateMemberRole(ctx.db, workspaceId, heir, 'owner')
        ctx.audit.record({
          action: 'workspace.owner_transferred',
          actorId: userId,
          targetType: 'user',
          targetId: heir,
          workspaceId,
          ip: meta.ip,
        })
      }
      stillShared.push(workspaceId)
    }
    ctx.audit.record({ action: 'account.deleted', actorId: userId, targetType: 'user', targetId: userId, ip: meta.ip })
    deleteUser(ctx.db, userId) // oturumlar, üyelikler, cihazlar, sıfırlama belirteçleri yabancı anahtarla gider
    return stillShared
  })
  ctx.hub.disconnectUser(userId)
  for (const workspaceId of affected) pokeWorkspace(ctx, workspaceId)
}
