/**
 * Davet kabul (/davet?token=… — bağlantı `shared`daki WEB_ROUTES.invite ile kurulur).
 * Önce davetin önizlemesi gösterilir. Giriş yapılmamışsa giriş/kayıt sayfasına `next` ile gidilir ve oradan
 * bu sayfaya dönülür. Kabul edilince alan eşitlenir ve geçerli alan olarak seçilir.
 */
import { WEB_ROUTES } from '@uygulama/shared'
import { MailOpen, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { t } from '../../i18n/index.ts'
import { formatDateTime } from '../../lib/date.ts'
import { errorMessage } from '../../lib/errors.ts'
import { useSession } from '../../lib/session/context.ts'
import { selectWorkspace } from '../../lib/session/workspace.ts'
import { getMeta } from '../../lib/store/meta.ts'
import { useRemote } from '../../lib/useRemote.ts'
import { Button, ButtonLink, Spinner, useToast } from '../../ui/index.ts'
import { AuthLayout } from '../auth/AuthLayout.tsx'
import { ROLE_HINTS, ROLE_LABELS } from './labels.ts'

export function InvitePage() {
  const session = useSession()
  const { api, state } = session
  const navigate = useNavigate()
  const toast = useToast()
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const preview = useRemote(api && token && `davet:${token}`, () =>
    api ? api.invitePreview(token) : Promise.reject(new Error('no api')),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const next = `${WEB_ROUTES.invite}?token=${encodeURIComponent(token)}`

  const accept = async () => {
    if (!api || state.status !== 'account') return
    setBusy(true)
    setError(null)
    try {
      const before = new Set((await getMeta(state.db, 'workspaces')).map((workspace) => workspace.id))
      const accepted = await api.acceptInvite(token)
      await state.engine?.syncNow()
      const after = await getMeta(state.db, 'workspaces')
      const joined = accepted ?? after.find((workspace) => !before.has(workspace.id))?.id ?? null
      if (joined) await selectWorkspace(state.db, joined)
      toast.show({ message: t('invite.accepted', { name: preview.data?.workspaceName ?? '' }), tone: 'success' })
      void navigate('/gorevler', { replace: true })
    } catch (reason) {
      setBusy(false)
      setError(errorMessage(reason))
    }
  }

  if (!token || (preview.error !== undefined && !preview.data))
    return (
      <AuthLayout title={t('invite.invalidTitle')}>
        <p role="alert" className="mb-5">
          {token ? errorMessage(preview.error) : t('invite.noToken')}
        </p>
        <ButtonLink to="/" variant="secondary" block>
          {t('common.goHome')}
        </ButtonLink>
      </AuthLayout>
    )

  if (!preview.data)
    return (
      <AuthLayout title={t('invite.pageTitle')}>
        <Spinner label={t('common.loading')} />
      </AuthLayout>
    )

  const { workspaceName, role, invitedBy, expiresAt } = preview.data
  return (
    <AuthLayout title={t('invite.pageTitle')}>
      <div className="flex flex-col gap-5">
        <div className="flex items-start gap-3 rounded-2xl bg-accent-soft p-4">
          <MailOpen aria-hidden size={24} className="mt-0.5 shrink-0 text-accent-text" />
          <p>{t('invite.summary', { inviter: invitedBy, name: workspaceName, role: t(ROLE_LABELS[role]) })}</p>
        </div>
        <p className="text-sm text-muted">
          {t(ROLE_HINTS[role])} {t('invite.validUntil', { when: formatDateTime(expiresAt) })}
        </p>
        {error && (
          <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 font-medium text-danger">
            {error}
          </p>
        )}
        {state.status === 'account' ? (
          <Button icon={UserPlus} loading={busy} onClick={() => void accept()} block>
            {t('invite.accept')}
          </Button>
        ) : (
          <div className="flex flex-col gap-2">
            <p>{t('invite.loginFirst')}</p>
            <ButtonLink to={`/giris?next=${encodeURIComponent(next)}`} block>
              {t('welcome.login')}
            </ButtonLink>
            <ButtonLink to={`/kayit?next=${encodeURIComponent(next)}`} variant="secondary" block>
              {t('welcome.register')}
            </ButtonLink>
          </div>
        )}
      </div>
    </AuthLayout>
  )
}
