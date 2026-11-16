/**
 * Eşitleme göstergesi (üst çubukta / yan menüde): simge + kısa durum + bekleyen değişiklik sayısı.
 * Dokununca ayrıntı penceresi açılır: son eşitleme, hata, "Şimdi eşitle".
 */
import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { t } from '../../i18n/index.ts'
import { useClock } from '../../lib/clock.tsx'
import { formatRelative } from '../../lib/date.ts'
import { useSession, useSyncStatus } from '../../lib/session/context.ts'
import { useMeta, usePendingCount } from '../../lib/store/hooks.ts'
import { Button, cx, Dialog } from '../../ui/index.ts'
import { SYNC_ICONS, syncLabel, useSyncView, type SyncView } from './syncView.ts'

const TONE: Record<SyncView, string> = {
  local: 'text-muted',
  expired: 'text-warn',
  blocked: 'text-warn',
  offline: 'text-muted',
  syncing: 'text-accent-text',
  error: 'text-danger',
  pending: 'text-accent-text',
  synced: 'text-ok',
}

export function SyncIndicator({ compact = false }: { compact?: boolean }) {
  const session = useSession()
  const navigate = useNavigate()
  const view = useSyncView()
  const status = useSyncStatus()
  const pending = usePendingCount() ?? 0
  const lastSyncedAt = useMeta('lastSyncedAt')
  const clock = useClock()
  const [open, setOpen] = useState(false)
  const Icon = SYNC_ICONS[view]
  const label = syncLabel(view)
  const engine = session.state.status === 'account' ? session.state.engine : null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        // Simgeli (dar) hâlde ad aria-label'dan; yazılı hâlde görünen yazıdan gelir (görünen ad = okunan ad).
        aria-label={
          compact ? (pending > 0 ? t('sync.indicatorPending', { state: label, count: pending }) : label) : undefined
        }
        className={cx(
          'inline-flex min-h-12 min-w-12 items-center gap-2 rounded-xl px-2.5 font-semibold transition-colors hover:bg-surface-2',
          compact ? 'justify-center' : 'w-full justify-start',
          TONE[view],
        )}
      >
        <Icon aria-hidden size={20} className={cx(view === 'syncing' && 'animate-spin')} />
        {!compact && <span className="text-sm">{label}</span>}
        {!compact && pending > 0 && view !== 'local' && (
          <span className="sr-only">{t('sync.indicatorPendingTail', { count: pending })}</span>
        )}
        {pending > 0 && view !== 'local' && (
          <span aria-hidden className="rounded-full bg-accent px-1.5 text-xs font-bold text-accent-ink tabular-nums">
            {pending}
          </span>
        )}
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={label}
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setOpen(false)
                void navigate('/ayarlar')
              }}
            >
              {t('sync.details')}
            </Button>
            {engine && (
              <Button icon={RefreshCw} loading={status.phase === 'syncing'} onClick={() => void engine.syncNow()}>
                {t('sync.now')}
              </Button>
            )}
          </>
        }
      >
        <div className="flex flex-col gap-2">
          <p>{t(view === 'local' ? 'sync.localOnly' : 'sync.explain')}</p>
          {view !== 'local' && (
            <p className="text-muted">
              {t('sync.pendingLine', { count: pending })} ·{' '}
              {lastSyncedAt ? t('sync.lastLine', { when: formatRelative(lastSyncedAt, clock.now()) }) : t('sync.never')}
            </p>
          )}
          {status.error && (
            <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-danger">
              {status.error.message}
            </p>
          )}
        </div>
      </Dialog>
    </>
  )
}
