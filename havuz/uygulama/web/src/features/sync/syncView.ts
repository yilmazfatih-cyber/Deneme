/**
 * Eşitleme göstergesinin durumu: motor durumu + ağ + bekleyen sayısı → kullanıcıya gösterilecek TEK durum.
 *   local      hesapsız kip: veriler yalnız bu cihazda
 *   expired    oturum süresi doldu: yeniden giriş gerekiyor
 *   blocked    kullanıcı kararı bekleniyor (reset) ya da sayfa yenilenmeli
 *   offline    çevrimdışı (değişiklikler bekliyor)
 *   syncing    eşitleniyor
 *   error      sorun var (kendiliğinden yeniden denenecek)
 *   pending    gönderilmeyi bekleyen değişiklik var
 *   synced     eşitlendi
 *
 * Genişletme: yeni durum → `SyncView`'e ekleyin; LABELS ve ICONS eksik olanı derlemede gösterir.
 */
import {
  CloudCheck,
  CloudOff,
  CloudUpload,
  RefreshCw,
  Smartphone,
  TriangleExclamationPoint,
  UserRoundX,
  type LucideIcon,
} from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { t, type MessageKey } from '../../i18n/index.ts'
import { useSession, useSyncStatus } from '../../lib/session/context.ts'
import { usePendingCount } from '../../lib/store/hooks.ts'

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

export const SYNC_ICONS: Record<SyncView, LucideIcon> = {
  local: Smartphone,
  expired: UserRoundX,
  blocked: TriangleExclamationPoint,
  offline: CloudOff,
  syncing: RefreshCw,
  error: TriangleExclamationPoint,
  pending: CloudUpload,
  synced: CloudCheck,
}

export function syncLabel(view: SyncView): string {
  return t(LABELS[view])
}

function subscribeOnline(listener: () => void): () => void {
  window.addEventListener('online', listener)
  window.addEventListener('offline', listener)
  return () => {
    window.removeEventListener('online', listener)
    window.removeEventListener('offline', listener)
  }
}

/** Tarayıcı çevrimiçi mi (anlık). */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  )
}

export function useSyncView(): SyncView {
  const { state } = useSession()
  const status = useSyncStatus()
  const online = useOnline()
  const pending = usePendingCount() ?? 0
  if (state.status !== 'account') return 'local'
  if (state.session.expired || status.blocked === 'unauthorized') return 'expired'
  if (status.blocked) return 'blocked'
  if (!online || status.phase === 'offline') return 'offline'
  if (status.phase === 'syncing') return 'syncing'
  if (status.phase === 'error') return 'error'
  if (pending > 0) return 'pending'
  return 'synced'
}
