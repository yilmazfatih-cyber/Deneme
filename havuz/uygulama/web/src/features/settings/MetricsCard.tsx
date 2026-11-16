/**
 * Yönetim özeti (yalnız yönetici): kullanıcı, alan, kayıt, oturum sayıları ve veritabanı boyutu.
 * Veri `GET /api/admin/metrics`ten tek seferlik okunur (eşitlenmez); "Yenile" ile tazelenir.
 */
import { RefreshCw } from 'lucide-react'
import { t, type MessageKey } from '../../i18n/index.ts'
import { errorMessage } from '../../lib/errors.ts'
import { useSession } from '../../lib/session/context.ts'
import { formatBytes } from '../../lib/storage.ts'
import { useRemote } from '../../lib/useRemote.ts'
import { Button, Card, Skeleton } from '../../ui/index.ts'

const ROWS: {
  key: 'users' | 'disabledUsers' | 'workspaces' | 'records' | 'activeSessions' | 'liveConnections'
  label: MessageKey
}[] = [
  { key: 'users', label: 'admin.metrics.users' },
  { key: 'disabledUsers', label: 'admin.metrics.disabledUsers' },
  { key: 'workspaces', label: 'admin.metrics.workspaces' },
  { key: 'records', label: 'admin.metrics.records' },
  { key: 'activeSessions', label: 'admin.metrics.sessions' },
  { key: 'liveConnections', label: 'admin.metrics.connections' },
]

const number = new Intl.NumberFormat('tr-TR')

export function MetricsCard() {
  const { api } = useSession()
  const metrics = useRemote(api && 'yonetim-ozeti', () =>
    api ? api.adminMetrics() : Promise.reject(new Error('no api')),
  )

  return (
    <Card
      title={t('admin.metrics.title')}
      actions={
        <Button variant="ghost" icon={RefreshCw} loading={metrics.loading} onClick={metrics.reload}>
          <span className="sr-only">{t('common.reload')}</span>
        </Button>
      }
    >
      {metrics.data ? (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {ROWS.map((row) => (
            <div key={row.key} className="rounded-2xl bg-surface-2 px-4 py-3">
              <dt className="text-sm text-muted">{t(row.label)}</dt>
              <dd className="text-2xl font-bold tabular-nums">{number.format(metrics.data?.[row.key] ?? 0)}</dd>
            </div>
          ))}
          <div className="rounded-2xl bg-surface-2 px-4 py-3">
            <dt className="text-sm text-muted">{t('admin.metrics.database')}</dt>
            <dd className="text-2xl font-bold tabular-nums">{formatBytes(metrics.data.databaseBytes)}</dd>
          </div>
        </dl>
      ) : metrics.error ? (
        <p role="alert" className="text-muted">
          {errorMessage(metrics.error)}
        </p>
      ) : (
        <Skeleton lines={2} />
      )}
    </Card>
  )
}
