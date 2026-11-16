/**
 * Eşitleme olaylarını kullanıcıya bildirir:
 *   - reddedilen değişiklik → bildirim ("Ayrıntı" → Ayarlar)
 *   - erişimi kalkan alan   → bildirim
 *   - sürüm uyuşmazlığı     → kalıcı "Sayfayı yenileyin" bildirimi
 *   - reset                 → engelleyici pencere: "buradakini gönder" ya da "sunucudakini al"
 * Uygulama kabuğu (Shell) bunu bir kez çizer.
 */
import { CloudUpload, Download } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { t } from '../../i18n/index.ts'
import { errorMessage } from '../../lib/errors.ts'
import { useSession } from '../../lib/session/context.ts'
import { useMeta } from '../../lib/store/hooks.ts'
import { Button, Dialog, useToast } from '../../ui/index.ts'

export function SyncNotices() {
  const session = useSession()
  const toast = useToast()
  const navigate = useNavigate()

  useEffect(
    () =>
      session.subscribeSyncEvents((event) => {
        switch (event.type) {
          case 'rejected':
            toast.show({
              message:
                event.rejections.length === 1
                  ? t('sync.rejectedOne', { message: event.rejections[0]?.message ?? '' })
                  : t('sync.rejectedMany', { count: event.rejections.length }),
              tone: 'error',
              action: { label: t('sync.details'), onAction: () => void navigate('/ayarlar') },
            })
            break
          case 'dropped':
            for (const workspace of event.workspaces)
              toast.show({ message: t('sync.dropped', { name: workspace.name }), durationMs: 10_000 })
            break
          case 'upgrade_required':
            toast.show({
              key: 'surum',
              message: t('error.upgrade'),
              durationMs: null,
              action: { label: t('common.reload'), onAction: () => location.reload() },
            })
            break
          case 'unauthorized':
            toast.show({ key: 'oturum', message: t('sync.view.expired'), durationMs: 10_000 })
            break
          case 'reset':
            break // pencere aşağıda üst veriden açılır
        }
      }),
    [session, toast, navigate],
  )

  return <ResetDialog />
}

function ResetDialog() {
  const { state } = useSession()
  const resets = useMeta('resetWorkspaceIds') ?? []
  const workspaces = useMeta('workspaces') ?? []
  const [busy, setBusy] = useState<'push' | 'pull' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const engine = state.status === 'account' ? state.engine : null
  const workspaceId = resets[0]
  const name = workspaces.find((workspace) => workspace.id === workspaceId)?.name ?? ''

  const resolve = async (choice: 'push' | 'pull') => {
    if (!engine || !workspaceId) return
    setBusy(choice)
    setError(null)
    try {
      await engine.resolveReset(workspaceId, choice)
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog
      open={engine !== null && workspaceId !== undefined}
      onClose={() => {}}
      dismissible={false}
      title={t('sync.reset.title')}
      description={t('sync.reset.message', { name })}
      footer={
        <>
          <Button
            variant="secondary"
            icon={Download}
            loading={busy === 'pull'}
            disabled={busy !== null}
            onClick={() => void resolve('pull')}
          >
            {t('sync.reset.pull')}
          </Button>
          <Button
            icon={CloudUpload}
            loading={busy === 'push'}
            disabled={busy !== null}
            onClick={() => void resolve('push')}
          >
            {t('sync.reset.push')}
          </Button>
        </>
      }
    >
      <ul className="flex list-disc flex-col gap-2 pl-5">
        <li>{t('sync.reset.pushHint')}</li>
        <li>{t('sync.reset.pullHint')}</li>
      </ul>
      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-danger">
          {error}
        </p>
      )}
    </Dialog>
  )
}
