/**
 * "Bu cihazdaki kayıtları hesabıma taşı" (/hesaba-tasi?next=…): giriş yapınca, hesapsız yazılmış kayıt varsa açılır.
 * Taşı → kayıtlar kişisel alana `put` olarak yazılır ve eşitlenir; Şimdi değil → kayıtlar bu cihazda kalır
 * (Ayarlar → Veri'den sonra da taşınabilir).
 */
import { isAppError } from '@uygulama/shared'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRightLeft } from 'lucide-react'
import { useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { t } from '../../i18n/index.ts'
import { errorMessage } from '../../lib/errors.ts'
import { useSession } from '../../lib/session/context.ts'
import { countLocalRecords, migrateLocalToAccount, totalCount } from '../../lib/session/migrate.ts'
import { LOCAL_DB_NAME, openDb } from '../../lib/store/db.ts'
import { getMeta, setMeta } from '../../lib/store/meta.ts'
import { Button, Spinner, useToast } from '../../ui/index.ts'
import { safeNext } from './afterLogin.ts'
import { AuthLayout } from './AuthLayout.tsx'

export function MigratePage() {
  const { state } = useSession()
  const navigate = useNavigate()
  const toast = useToast()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const localDb = openDb(LOCAL_DB_NAME)
  const counts = useLiveQuery(() => countLocalRecords(localDb), [localDb])
  const userDb = state.status === 'account' ? state.db : null
  const workspaces = useLiveQuery(async () => (userDb ? getMeta(userDb, 'workspaces') : []), [userDb])
  const personal = workspaces?.find((workspace) => workspace.kind === 'personal')

  if (state.status !== 'account') return <Navigate to="/giris" replace />
  if (counts !== undefined && totalCount(counts) === 0) return <Navigate to={next} replace />

  const move = async () => {
    if (!userDb || !personal) return
    setBusy(true)
    try {
      const moved = await migrateLocalToAccount(localDb, userDb, personal.id)
      toast.show({ message: t('migrate.done', { count: moved }), tone: 'success' })
      void navigate(next, { replace: true })
    } catch (reason) {
      setBusy(false)
      setError(isAppError(reason) ? reason.message : errorMessage(reason))
    }
  }

  const later = async () => {
    await setMeta(state.db, 'migrationDismissed', true)
    void navigate(next, { replace: true })
  }

  return (
    <AuthLayout title={t('migrate.title')} description={t('migrate.description')}>
      {counts === undefined ? (
        <Spinner label={t('common.loading')} />
      ) : (
        <div className="flex flex-col gap-5">
          <ul className="flex flex-col gap-2 rounded-2xl bg-surface-2 p-4">
            {counts.tasks !== undefined && <li>{t('migrate.count.tasks', { count: counts.tasks })}</li>}
            {counts.lists !== undefined && <li>{t('migrate.count.lists', { count: counts.lists })}</li>}
          </ul>
          <p className="text-sm text-muted">{t('migrate.note')}</p>
          {error && (
            <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 font-medium text-danger">
              {error}
            </p>
          )}
          {personal ? (
            <Button icon={ArrowRightLeft} loading={busy} onClick={() => void move()} block>
              {t('migrate.submit')}
            </Button>
          ) : (
            <Spinner label={t('migrate.preparing')} />
          )}
          <Button variant="ghost" onClick={() => void later()} disabled={busy} block>
            {t('migrate.later')}
          </Button>
        </div>
      )}
    </AuthLayout>
  )
}
