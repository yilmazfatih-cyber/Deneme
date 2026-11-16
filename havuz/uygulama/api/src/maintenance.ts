/**
 * Bakım işi: süresi dolmuş oturumları, kullanılmış/eskimiş belirteçleri, eski denetim kayıtlarını ve geliştirme
 * e-posta kutusunu temizler; hız sınırı belleğini süpürür. Sunucu açıkken saatte bir koşar (index.ts).
 * Silinen satır sayılarını döndürür (günlüğe yazılır).
 *
 * Genişletme: yeni bir "süresi dolan" tablo eklediğinizde temizliğini RETENTION'a ve buraya ekleyin;
 * testini test/maintenance.test.ts'e yazın.
 */
import type { AppContext } from './context.ts'
import { addDays } from './lib/random.ts'

export const RETENTION = {
  /** Kullanılmış ya da süresi dolmuş sıfırlama belirteci bu kadar gün sonra silinir. */
  passwordResetsDays: 1,
  /** Süresi dolmuş davet bu kadar gün sonra silinir. */
  invitesDays: 30,
  auditDays: 180,
  outboxDays: 7,
} as const

export interface MaintenanceResult {
  readonly sessions: number
  readonly passwordResets: number
  readonly invites: number
  readonly audit: number
  readonly outbox: number
}

export function runMaintenance(ctx: AppContext): MaintenanceResult {
  const now = ctx.clock.now()
  const iso = (days: number) => addDays(now, -days).toISOString()
  const result = ctx.db.transaction(() => ({
    sessions: ctx.db.run('DELETE FROM sessions WHERE expires_at <= ?', now.toISOString()).changes,
    passwordResets: ctx.db.run(
      'DELETE FROM password_resets WHERE expires_at <= ? OR (used_at IS NOT NULL AND used_at <= ?)',
      iso(RETENTION.passwordResetsDays),
      iso(RETENTION.passwordResetsDays),
    ).changes,
    invites: ctx.db.run('DELETE FROM invites WHERE expires_at <= ?', iso(RETENTION.invitesDays)).changes,
    audit: ctx.db.run('DELETE FROM audit_log WHERE at <= ?', iso(RETENTION.auditDays)).changes,
    outbox: ctx.db.run('DELETE FROM mail_outbox WHERE created_at <= ?', iso(RETENTION.outboxDays)).changes,
  }))
  ctx.limiter.sweep()
  return result
}
