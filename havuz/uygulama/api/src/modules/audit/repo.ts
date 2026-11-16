/**
 * Denetim günlüğü: güvenlikle ilgili olayların kalıcı kaydı (`audit_log` tablosu). Kim, ne zaman, neyi, hangi
 * IP'den yaptı. Parola, belirteç ve e-posta YAZILMAZ; kişiyi `actorId`/`targetId` (kullanıcı kimliği) ile anın.
 * Kayıtlar 180 gün sonra bakım işiyle silinir (src/maintenance.ts).
 *
 * Genişletme: yeni olay türü için AUDIT_ACTIONS'a bir satır ekleyin ve olayın olduğu serviste
 * `ctx.audit.record({ action: '…', … })` çağırın (çok adımlı işte, işlemin İÇİNDE çağırın ki birlikte geri alınsın).
 */
import type { Db } from '../../db/database.ts'
import type { Clock } from '../../lib/random.ts'

export const AUDIT_ACTIONS = [
  'auth.register',
  'auth.login',
  'auth.login_failed',
  'auth.logout_all',
  'auth.password_changed',
  'auth.password_reset_requested',
  'auth.password_reset',
  'account.updated',
  'account.deleted',
  'workspace.created',
  'workspace.renamed',
  'workspace.deleted',
  'workspace.owner_transferred',
  'member.added',
  'member.role_changed',
  'member.removed',
  'invite.created',
  'admin.user_updated',
  // YENİ OLAY BURAYA
] as const

export type AuditAction = (typeof AUDIT_ACTIONS)[number]

export interface AuditEntry {
  readonly action: AuditAction
  readonly actorId?: string | null
  readonly targetType?: 'user' | 'workspace' | 'invite' | null
  readonly targetId?: string | null
  readonly workspaceId?: string | null
  readonly ip?: string | null
  /** Kişisel veri İÇERMEYEN ek bilgi (ör. { role: 'editor' }). */
  readonly details?: Record<string, string | number | boolean | null>
}

export interface AuditRow {
  id: number
  at: string
  action: string
  actor_id: string | null
  target_type: string | null
  target_id: string | null
  workspace_id: string | null
  ip: string | null
  details: string | null
}

export interface AuditLog {
  record(entry: AuditEntry): void
  /** Son kayıtlar (yeniden eskiye). Testler ve ileride bir yönetim ekranı için. */
  recent(limit?: number): AuditRow[]
}

export function createAuditLog(db: Db, clock: Clock): AuditLog {
  return {
    record(entry) {
      db.run(
        'INSERT INTO audit_log (at, action, actor_id, target_type, target_id, workspace_id, ip, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        clock.now().toISOString(),
        entry.action,
        entry.actorId ?? null,
        entry.targetType ?? null,
        entry.targetId ?? null,
        entry.workspaceId ?? null,
        entry.ip ?? null,
        entry.details ? JSON.stringify(entry.details) : null,
      )
    },
    recent(limit = 100) {
      return db.all<AuditRow>('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?', limit)
    },
  }
}
