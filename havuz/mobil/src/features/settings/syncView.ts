/**
 * Eşitleme durumunun kullanıcıya gösterilecek TEK hâli: motor durumu + bekleyen sayısı → bir durum.
 *   local      hesapsız kip: veriler yalnız bu telefonda
 *   expired    oturum süresi doldu: yeniden giriş gerekiyor
 *   blocked    kullanıcı kararı bekleniyor (reset) ya da uygulama güncellenmeli
 *   offline    çevrimdışı (değişiklikler bekliyor)
 *   syncing    eşitleniyor
 *   error      sorun var (kendiliğinden yeniden denenecek)
 *   pending    gönderilmeyi bekleyen değişiklik var
 *   synced     eşitlendi
 *
 * Kaynak: uygulama/web/src/features/sync/syncView.ts. Genişletme: yeni durum → `SyncView`, LABELS ve ICONS.
 */
import { t, type MessageKey } from '../../i18n/index.ts'
import type { SessionState } from '../../lib/session/context.ts'
import type { SyncStatus } from '../../lib/sync/status.ts'
import type { IconName } from '../../ui/index.ts'

export type SyncView = 'local' | 'expired' | 'blocked' | 'offline' | 'syncing' | 'error' | 'pending' | 'synced'

const LABELS: Record<SyncView, MessageKey> = {
  local: 'sync.view.local',
  expired: 'sync.view.expired',
  blocked: 'sync.view.blocked',
  offline: 'sync.view.offline',
  syncing: 'sync.view.syncing',
  error: 'sync.view.error',
  pending: 'sync.view.pending',
  synced: 'sync.view.synced',
}

export const SYNC_ICONS: Record<SyncView, IconName> = {
  local: 'phone-portrait-outline',
  expired: 'person-circle-outline',
  blocked: 'alert-circle-outline',
  offline: 'cloud-offline-outline',
  syncing: 'sync',
  error: 'alert-circle-outline',
  pending: 'sync',
  synced: 'cloud-done-outline',
}

export function syncLabel(view: SyncView): string {
  return t(LABELS[view])
}

export function syncViewOf(state: SessionState, status: SyncStatus, pending: number): SyncView {
  if (state.status !== 'account') return 'local'
  if (state.session.expired || status.blocked === 'unauthorized') return 'expired'
  if (status.blocked) return 'blocked'
  if (status.phase === 'offline') return 'offline'
  if (status.phase === 'syncing') return 'syncing'
  if (status.phase === 'error') return 'error'
  if (pending > 0) return 'pending'
  return 'synced'
}
