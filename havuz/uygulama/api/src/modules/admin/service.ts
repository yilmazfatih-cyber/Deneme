/**
 * Yönetici işleri: kullanıcıları listele/ara, hesabı kapat/aç, rol değiştir, ölçümleri oku.
 * Kural: yönetici kendi rolünü değiştiremez ve kendi hesabını kapatamaz ("kendini kilitleyemez"); böylece en az
 * bir yönetici her zaman kalır. Hesap kapatılınca bütün oturumları silinir ve anlık bağlantıları kesilir.
 * İlk yöneticiler ADMIN_EMAILS ayarından gelir (kayıtta ve sunucu açılışında yükseltilir) ya da
 * `npm run create-admin` ile atanır.
 *
 * Genişletme: yeni bir yönetici işlemi için önce bir kural (kendine uygulanabilir mi?) yazın, sonra denetim
 * günlüğüne `admin.*` olayı ekleyin (modules/audit/repo.ts → AUDIT_ACTIONS).
 */
import {
  AppError,
  type AdminMetricsResponse,
  type AdminUser,
  type AdminUsersResponse,
  type Role,
} from '@uygulama/shared'
import type { AppContext } from '../../context.ts'
import type { RequestMeta } from '../../http/meta.ts'
import type { AuthState } from '../../http/types.ts'
import { MESSAGES } from '../../messages.ts'
import { deleteUserSessions } from '../auth/sessionRepo.ts'
import { findUserById, toAdminUser, toAuthUser, updateUserAdminFields } from '../auth/userRepo.ts'
import { counts, listUsers } from './repo.ts'

export function searchUsers(
  ctx: AppContext,
  input: { query: string; cursor: string | null; limit: number },
): AdminUsersResponse {
  const rows = listUsers(ctx.db, { ...input, limit: input.limit + 1 })
  const page = rows.slice(0, input.limit)
  const nextCursor = rows.length > input.limit ? (page.at(-1)?.id ?? null) : null
  return { users: page.map((row) => toAdminUser(toAuthUser(row))), nextCursor }
}

export function updateUser(
  ctx: AppContext,
  auth: AuthState,
  targetId: string,
  fields: { disabled?: boolean; role?: Role },
  meta: RequestMeta,
): AdminUser {
  if (targetId === auth.user.id) throw new AppError('forbidden', MESSAGES.adminSelfLock)
  const user = ctx.db.transaction(() => {
    if (!findUserById(ctx.db, targetId)) throw new AppError('not_found', MESSAGES.userNotFound)
    updateUserAdminFields(ctx.db, targetId, fields, ctx.clock.now().toISOString())
    if (fields.disabled === true) deleteUserSessions(ctx.db, targetId)
    ctx.audit.record({
      action: 'admin.user_updated',
      actorId: auth.user.id,
      targetType: 'user',
      targetId,
      ip: meta.ip,
      details: {
        ...(fields.disabled === undefined ? {} : { disabled: fields.disabled }),
        ...(fields.role ? { role: fields.role } : {}),
      },
    })
    const row = findUserById(ctx.db, targetId)
    if (!row) throw new AppError('not_found', MESSAGES.userNotFound)
    return toAdminUser(toAuthUser(row))
  })
  if (fields.disabled === true) ctx.hub.disconnectUser(targetId)
  return user
}

/** Sunucunun anlık durumu: sürüm, çalışma süresi, sayımlar, açık anlık bağlantılar, veritabanı boyutu. */
export function metrics(ctx: AppContext): AdminMetricsResponse {
  const now = ctx.clock.now()
  return {
    version: ctx.config.version,
    time: now.toISOString(),
    uptimeSeconds: Math.max(0, Math.floor((now.getTime() - ctx.startedAt.getTime()) / 1000)),
    ...counts(ctx.db, now.toISOString()),
    liveConnections: ctx.hub.size,
  }
}
