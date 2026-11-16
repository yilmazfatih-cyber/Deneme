/**
 * Hesap (/hesap): ad, şifre değiştir, verilerimi indir, çıkış (isteğe bağlı "bu cihazdaki veriyi de sil"),
 * tüm cihazlardan çıkış, hesabı sil (şifre onaylı). Oturum süresi dolmuşsa önce yeniden giriş istenir.
 */
import { nameSchema } from '@uygulama/shared'
import { Download, KeyRound, LogIn, LogOut, MonitorSmartphone, Trash } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { t } from '../../i18n/index.ts'
import { downloadJson } from '../../lib/backup.ts'
import { toIsoDate } from '../../lib/date.ts'
import { errorMessage } from '../../lib/errors.ts'
import { validate } from '../../lib/form.ts'
import { useSession } from '../../lib/session/context.ts'
import { usePendingCount } from '../../lib/store/hooks.ts'
import { Button, ButtonLink, Card, Checkbox, ConfirmDialog, PageHeader, TextField, useToast } from '../../ui/index.ts'
import { ChangePasswordDialog, DeleteAccountDialog } from './AccountDialogs.tsx'

export function AccountPage() {
  const session = useSession()
  const { state, api } = session
  const navigate = useNavigate()
  const toast = useToast()
  const pending = usePendingCount() ?? 0
  const [dialog, setDialog] = useState<'password' | 'logout' | 'logoutAll' | 'delete' | null>(null)
  const [deleteLocal, setDeleteLocal] = useState(false)
  if (state.status !== 'account') return null
  const { user, expired } = state.session

  const exportData = async () => {
    try {
      downloadJson(t('account.exportFile', { date: toIsoDate(new Date()) }), await api?.exportAccount())
    } catch (error) {
      toast.show({ message: errorMessage(error), tone: 'error' })
    }
  }

  return (
    <>
      <PageHeader title={t('account.title')} description={user.email} />
      <div className="flex flex-col gap-5">
        {expired && (
          <Card title={t('account.expiredTitle')} description={t('account.expiredMessage')}>
            <ButtonLink to={`/giris?eposta=${encodeURIComponent(user.email)}`} icon={LogIn}>
              {t('welcome.login')}
            </ButtonLink>
          </Card>
        )}
        <ProfileCard name={user.name} disabled={expired} />
        <Card title={t('account.security')}>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={KeyRound} disabled={expired} onClick={() => setDialog('password')}>
              {t('account.changePassword')}
            </Button>
            <Button
              variant="secondary"
              icon={MonitorSmartphone}
              disabled={expired}
              onClick={() => setDialog('logoutAll')}
            >
              {t('account.logoutAll')}
            </Button>
          </div>
        </Card>
        <Card title={t('account.data')} description={t('account.dataHint')}>
          <Button variant="secondary" icon={Download} disabled={expired} onClick={() => void exportData()}>
            {t('account.export')}
          </Button>
        </Card>
        <Card title={t('account.session')}>
          <Button variant="secondary" icon={LogOut} onClick={() => setDialog('logout')}>
            {t('account.logout')}
          </Button>
        </Card>
        <Card title={t('account.danger')} description={t('account.deleteHint')}>
          <Button
            variant="secondary"
            icon={Trash}
            className="text-danger"
            disabled={expired}
            onClick={() => setDialog('delete')}
          >
            {t('account.delete')}
          </Button>
        </Card>
      </div>

      <ConfirmDialog
        open={dialog === 'logout'}
        onClose={() => setDialog(null)}
        title={t('account.logoutTitle')}
        message={pending > 0 ? t('account.logoutPending', { count: pending }) : t('account.logoutMessage')}
        confirmLabel={t('account.logout')}
        tone={deleteLocal ? 'danger' : 'default'}
        onConfirm={async () => {
          await session.logout({ deleteLocalData: deleteLocal })
          void navigate('/', { replace: true })
        }}
      >
        <Checkbox
          label={t('account.deleteLocal')}
          description={t('account.deleteLocalHint')}
          checked={deleteLocal}
          onChange={(event) => setDeleteLocal(event.target.checked)}
        />
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === 'logoutAll'}
        onClose={() => setDialog(null)}
        title={t('account.logoutAllTitle')}
        message={t('account.logoutAllMessage')}
        confirmLabel={t('account.logoutAll')}
        onConfirm={async () => {
          await session.logout({ deleteLocalData: false, everywhere: true })
          void navigate('/', { replace: true })
        }}
      />
      <ChangePasswordDialog open={dialog === 'password'} onClose={() => setDialog(null)} />
      <DeleteAccountDialog open={dialog === 'delete'} onClose={() => setDialog(null)} />
    </>
  )
}

function ProfileCard({ name: initial, disabled }: { name: string; disabled: boolean }) {
  const session = useSession()
  const toast = useToast()
  const [name, setName] = useState(initial)
  const [error, setError] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const result = validate(nameSchema, name)
    if (!result.ok) return setError(Object.values(result.errors)[0])
    if (!session.api) return
    setBusy(true)
    try {
      const { user } = await session.api.updateProfile(result.data)
      await session.updateUser(user)
      toast.show({ message: t('common.saved'), tone: 'success' })
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title={t('account.profile')}>
      <form
        onSubmit={(event) => void submit(event)}
        noValidate
        className="flex flex-col gap-3 sm:flex-row sm:items-start"
      >
        <TextField
          label={t('auth.field.name')}
          autoComplete="name"
          value={name}
          disabled={disabled}
          onChange={(event) => {
            setName(event.target.value)
            setError(undefined)
          }}
          error={error}
          className="flex-1"
        />
        <Button type="submit" variant="secondary" loading={busy} disabled={disabled} className="sm:mt-7">
          {t('common.save')}
        </Button>
      </form>
    </Card>
  )
}
