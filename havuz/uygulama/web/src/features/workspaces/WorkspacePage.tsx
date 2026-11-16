/**
 * Alan ayrıntısı (/alanlar/:id): ad, üyeler ve roller, davet bağlantısı, alandan ayrılma, alanı silme.
 * Yetki sunucuda denetlenir; burada yalnız rolün yapamayacağı denetimler gizlenir.
 */
import { workspaceNameSchema, type WorkspaceInfo } from '@uygulama/shared'
import { ArrowRightLeft, DoorOpen, SearchX, Trash } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { t } from '../../i18n/index.ts'
import { errorMessage } from '../../lib/errors.ts'
import { validate } from '../../lib/form.ts'
import { useSession } from '../../lib/session/context.ts'
import { selectWorkspace, useWorkspaceState } from '../../lib/session/workspace.ts'
import { Badge, Button, ButtonLink, Card, ConfirmDialog, EmptyState, PageHeader, TextField } from '../../ui/index.ts'
import { InviteCard } from './InviteCard.tsx'
import { KIND_LABELS, ROLE_LABELS } from './labels.ts'
import { MembersCard } from './MembersCard.tsx'
import { useWorkspaceApi } from './useWorkspaceApi.ts'

const BACK = { to: '/alanlar', label: t('workspace.title') }

export function WorkspacePage() {
  const { id } = useParams()
  const { state } = useSession()
  const { current, workspaces } = useWorkspaceState(state)
  const workspace = workspaces.find((item) => item.id === id)
  const navigate = useNavigate()

  if (!workspace)
    return (
      <>
        <PageHeader title={t('workspace.notFound')} back={BACK} />
        <EmptyState
          icon={SearchX}
          title={t('workspace.notFound')}
          message={t('workspace.notFoundHint')}
          action={<ButtonLink to="/alanlar">{t('workspace.title')}</ButtonLink>}
        />
      </>
    )

  return (
    <>
      <PageHeader
        title={workspace.name}
        back={BACK}
        description={
          <span className="flex flex-wrap gap-2">
            <Badge>{t(KIND_LABELS[workspace.kind])}</Badge>
            <Badge tone="accent">{t(ROLE_LABELS[workspace.role])}</Badge>
          </span>
        }
        actions={
          current?.id !== workspace.id &&
          state.status === 'account' && (
            <Button
              variant="secondary"
              icon={ArrowRightLeft}
              onClick={() => void selectWorkspace(state.db, workspace.id).then(() => navigate('/gorevler'))}
            >
              {t('workspace.switchTo')}
            </Button>
          )
        }
      />
      <div className="flex flex-col gap-5">
        {workspace.role === 'owner' && <RenameCard workspace={workspace} />}
        {workspace.kind === 'shared' && <MembersCard workspace={workspace} />}
        {workspace.kind === 'shared' && workspace.role === 'owner' && <InviteCard workspace={workspace} />}
        {workspace.kind === 'shared' && <DangerCard workspace={workspace} />}
      </div>
    </>
  )
}

function RenameCard({ workspace }: { workspace: WorkspaceInfo }) {
  const { api, refresh, toast } = useWorkspaceApi()
  const [name, setName] = useState(workspace.name)
  const [error, setError] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const result = validate(workspaceNameSchema, name)
    if (!result.ok) return setError(Object.values(result.errors)[0])
    if (!api || result.data === workspace.name) return
    setBusy(true)
    try {
      await api.renameWorkspace(workspace.id, result.data)
      await refresh()
      toast.show({ message: t('common.saved'), tone: 'success' })
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title={t('workspace.rename')}>
      <form
        onSubmit={(event) => void submit(event)}
        noValidate
        className="flex flex-col gap-3 sm:flex-row sm:items-start"
      >
        <TextField
          label={t('workspace.field.name')}
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            setError(undefined)
          }}
          error={error}
          className="flex-1"
          autoComplete="off"
        />
        <Button type="submit" variant="secondary" loading={busy} className="sm:mt-7">
          {t('common.save')}
        </Button>
      </form>
    </Card>
  )
}

function DangerCard({ workspace }: { workspace: WorkspaceInfo }) {
  const { api, refresh, userId, toast } = useWorkspaceApi()
  const navigate = useNavigate()
  const [confirm, setConfirm] = useState<'leave' | 'delete' | null>(null)
  const owner = workspace.role === 'owner'

  const run = async () => {
    if (!api || !userId) return
    if (confirm === 'delete') await api.deleteWorkspace(workspace.id)
    else await api.removeMember(workspace.id, userId)
    await refresh()
    toast.show({ message: t(confirm === 'delete' ? 'workspace.deleted' : 'workspace.left', { name: workspace.name }) })
    void navigate('/alanlar')
  }

  return (
    <Card title={t('workspace.danger')}>
      <div className="flex flex-col items-start gap-2">
        {owner ? (
          <>
            <p className="text-muted">{t('workspace.deleteHint')}</p>
            <Button variant="secondary" icon={Trash} className="text-danger" onClick={() => setConfirm('delete')}>
              {t('workspace.delete')}
            </Button>
          </>
        ) : (
          <>
            <p className="text-muted">{t('workspace.leaveHint')}</p>
            <Button variant="secondary" icon={DoorOpen} onClick={() => setConfirm('leave')}>
              {t('workspace.leave')}
            </Button>
          </>
        )}
      </div>
      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={t(confirm === 'delete' ? 'workspace.deleteTitle' : 'workspace.leaveTitle', { name: workspace.name })}
        message={t(confirm === 'delete' ? 'workspace.deleteMessage' : 'workspace.leaveMessage')}
        confirmLabel={t(confirm === 'delete' ? 'workspace.delete' : 'workspace.leave')}
        tone="danger"
        onConfirm={run}
      />
    </Card>
  )
}
