/**
 * Eşitleme durumu: son eşitleme, bekleyen değişiklik sayısı, son hata, "Şimdi eşitle" ve kaydedilemeyen
 * (sunucunun reddettiği) değişikliklerin listesi. Hesapsız kipte "veriler yalnız bu cihazda" bilgisi gösterilir.
 */
import { RefreshCw } from 'lucide-react'
import { t } from '../../i18n/index.ts'
import { useClock } from '../../lib/clock.tsx'
import { formatDateTime, formatRelative } from '../../lib/date.ts'
import { useSession, useSyncStatus } from '../../lib/session/context.ts'
import { useMeta, usePendingCount } from '../../lib/store/hooks.ts'
import { Button, ButtonLink, Card } from '../../ui/index.ts'
import { syncLabel, useSyncView } from '../sync/syncView.ts'

export function SyncCard() {
  const session = useSession()
  const status = useSyncStatus()
  const view = useSyncView()
  const clock = useClock()
  const pending = usePendingCount() ?? 0
  const lastSyncedAt = useMeta('lastSyncedAt')
  const rejections = useMeta('rejections') ?? []
  const engine = session.state.status === 'account' ? session.state.engine : null

  if (session.state.status !== 'account')
    return (
      <Card title={t('settings.sync')} description={t('sync.localOnly')}>
        {session.api && (
          <ButtonLink to="/giris" variant="secondary">
            {t('welcome.login')}
          </ButtonLink>
        )}
      </Card>
    )

  return (
    <Card title={t('settings.sync')}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        <dt className="text-muted">{t('sync.state')}</dt>
        <dd className="font-semibold">{syncLabel(view)}</dd>
        <dt className="text-muted">{t('sync.pending')}</dt>
        <dd className="font-semibold tabular-nums">{pending}</dd>
        <dt className="text-muted">{t('sync.last')}</dt>
        <dd className="font-semibold">{lastSyncedAt ? formatRelative(lastSyncedAt, clock.now()) : t('sync.never')}</dd>
      </dl>
      {status.error && (
        <p role="alert" className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-danger">
          {status.error.message}
        </p>
      )}
      <Button
        variant="secondary"
        icon={RefreshCw}
        className="mt-4"
        disabled={!engine}
        loading={status.phase === 'syncing'}
        onClick={() => void engine?.syncNow()}
      >
        {t('sync.now')}
      </Button>
      {rejections.length > 0 && (
        <div className="mt-5 flex flex-col gap-2">
          <h3 className="font-bold">{t('sync.rejectedTitle')}</h3>
          <p className="text-sm text-muted">{t('sync.rejectedHint')}</p>
          <ul className="flex flex-col gap-1.5">
            {rejections.toReversed().map((item) => (
              <li key={`${item.at}-${item.recordId}-${item.op}`} className="rounded-xl bg-surface-2 px-3 py-2 text-sm">
                <span className="font-semibold">{formatDateTime(item.at)}</span> · {item.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}
