/**
 * Alanlar (/alanlar): üyesi olunan çalışma alanları; yeni paylaşımlı alan açma. Bir alana dokununca ayrıntısı açılır.
 * Liste son eşitlemeden gelir (çevrimdışıyken de görünür); yeni alan açmak çevrimiçi olmayı gerektirir.
 */
import { workspaceNameSchema } from '@uygulama/shared'
import { ChevronRight, Layers, Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { t } from '../../i18n/index.ts'
import { errorMessage } from '../../lib/errors.ts'
import { validate } from '../../lib/form.ts'
import { useSession } from '../../lib/session/context.ts'
import { selectWorkspace, useWorkspaceState } from '../../lib/session/workspace.ts'
import { Badge, Button, Dialog, EmptyState, PageHeader, TextField } from '../../ui/index.ts'
import { KIND_LABELS, ROLE_LABELS } from './labels.ts'
import { useWorkspaceApi } from './useWorkspaceApi.ts'

export function WorkspacesPage() {
  const { state } = useSession()
  const { current, workspaces } = useWorkspaceState(state)
  const [creating, setCreating] = useState(false)

  return (
    <>
      <PageHeader
        title={t('workspace.title')}
        description={t('workspace.description')}
        actions={
          <Button icon={Plus} onClick={() => setCreating(true)}>
            {t('workspace.new')}
          </Button>
        }
      />
      {workspaces.length === 0 ? (
        <EmptyState icon={Layers} title={t('workspace.emptyTitle')} message={t('workspace.emptyMessage')} />
      ) : (
        <ul className="flex flex-col gap-2">
          {workspaces.map((workspace) => (
            <li key={workspace.id}>
              <Link
                to={`/alanlar/${workspace.id}`}
                className="flex min-h-16 items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 hover:border-line-strong/60"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2 font-semibold">
                    <span className="break-words">{workspace.name}</span>
                    {workspace.id === current?.id && <Badge tone="accent">{t('workspace.current')}</Badge>}
                  </span>
                  <span className="text-sm text-muted">
                    {t(KIND_LABELS[workspace.kind])} · {t(ROLE_LABELS[workspace.role])} ·{' '}
                    {t('workspace.memberCount', { count: workspace.memberCount })}
                  </span>
                </div>
                <ChevronRight aria-hidden size={20} className="text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {creating && <CreateWorkspaceDialog onClose={() => setCreating(false)} />}
    </>
  )
}

function CreateWorkspaceDialog({ onClose }: { onClose: () => void }) {
  const { state } = useSession()
  const { api, refresh, toast } = useWorkspaceApi()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const result = validate(workspaceNameSchema, name)
    if (!result.ok) return setError(Object.values(result.errors)[0])
    if (!api || state.status !== 'account') return
    setBusy(true)
    try {
      const { workspace } = await api.createWorkspace(result.data)
      await refresh()
      await selectWorkspace(state.db, workspace.id)
      toast.show({ message: t('workspace.created', { name: workspace.name }), tone: 'success' })
      onClose()
    } catch (reason) {
      setBusy(false)
      setError(errorMessage(reason))
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('workspace.new')}
      description={t('workspace.newHint')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="alan-formu" loading={busy}>
            {t('workspace.create')}
          </Button>
        </>
      }
    >
      <form id="alan-formu" onSubmit={(event) => void submit(event)} noValidate>
        <TextField
          label={t('workspace.field.name')}
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            setError(undefined)
          }}
          error={error}
          autoFocus
          autoComplete="off"
        />
      </form>
    </Dialog>
  )
}
