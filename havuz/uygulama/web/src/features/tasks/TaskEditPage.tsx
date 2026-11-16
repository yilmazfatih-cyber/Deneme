/**
 * Görev ayrıntısı / düzenleme (/gorevler/:id) ve yeni görev (/gorevler/yeni?liste=…).
 * Silinmiş görev açılırsa "geri getir" sunulur; bulunamazsa görevlere dönüş bağlantısı gösterilir.
 */
import { RotateCcw, SearchX, Trash } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { t } from '../../i18n/index.ts'
import { useStore } from '../../lib/store/context.tsx'
import { useRecord, useRecords, useWrite } from '../../lib/store/hooks.ts'
import { Button, ButtonLink, EmptyState, PageHeader, Skeleton, useToast } from '../../ui/index.ts'
import { orderAtEnd, sortLists } from './logic.ts'
import { EMPTY_TASK, TaskForm, type TaskFormValues } from './TaskForm.tsx'
import { useTaskActions } from './useTaskActions.ts'

const BACK = { to: '/gorevler', label: t('tasks.title') }

export function TaskEditPage() {
  const { id } = useParams()
  return id === undefined || id === 'yeni' ? <NewTask /> : <EditTask id={id} />
}

function useLiveLists() {
  const lists = useRecords('lists')
  return useMemo(() => lists && sortLists(lists.filter((list) => !list.deleted)), [lists])
}

function NewTask() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const toast = useToast()
  const { create } = useWrite('tasks')
  const tasks = useRecords('tasks')
  const lists = useLiveLists()
  const { workspace } = useStore()
  if (!lists || !tasks) return <Skeleton lines={5} />
  const preset = params.get('liste')
  const initial: TaskFormValues = {
    ...EMPTY_TASK,
    listId: lists.some((list) => list.id === preset) ? (preset ?? '') : '',
  }
  return (
    <>
      <PageHeader title={t('tasks.new')} back={BACK} />
      {workspace.canWrite ? (
        <TaskForm
          mode="create"
          initial={initial}
          lists={lists}
          onSubmit={async (input) => {
            await create({ ...input, order: orderAtEnd(tasks) })
            toast.show({ message: t('tasks.created'), tone: 'success' })
            void navigate('/gorevler')
          }}
        />
      ) : (
        <p className="text-muted">{t('workspace.viewerNotice')}</p>
      )}
    </>
  )
}

function EditTask({ id }: { id: string }) {
  const navigate = useNavigate()
  const toast = useToast()
  const { workspace } = useStore()
  const task = useRecord('tasks', id)
  const lists = useLiveLists()
  const { update } = useWrite('tasks')
  const actions = useTaskActions()

  if (task === undefined || lists === undefined) return <Skeleton lines={5} />
  if (task === null)
    return (
      <>
        <PageHeader title={t('tasks.notFound.title')} back={BACK} />
        <EmptyState
          icon={SearchX}
          title={t('tasks.notFound.title')}
          message={t('tasks.notFound.message')}
          action={<ButtonLink to="/gorevler">{t('tasks.backToList')}</ButtonLink>}
        />
      </>
    )
  if (task.deleted)
    return (
      <>
        <PageHeader title={task.data.title} back={BACK} />
        <EmptyState
          icon={Trash}
          title={t('tasks.deletedNotice')}
          action={
            workspace.canWrite && (
              <Button icon={RotateCcw} onClick={() => void actions.restoreTask(task)}>
                {t('common.restore')}
              </Button>
            )
          }
        />
      </>
    )

  const initial: TaskFormValues = {
    title: task.data.title,
    note: task.data.note,
    listId: task.data.listId ?? '',
    dueDate: task.data.dueDate ?? '',
    priority: task.data.priority,
    done: task.data.done,
  }

  return (
    <>
      <PageHeader title={task.data.title} back={BACK} />
      {workspace.canWrite ? (
        <TaskForm
          key={task.id}
          mode="edit"
          initial={initial}
          lists={lists}
          onSubmit={async (input) => {
            const changed = await update(task.id, input)
            toast.show({ message: changed ? t('common.saved') : t('common.noChanges'), tone: 'success' })
            void navigate('/gorevler')
          }}
          secondary={
            <Button
              variant="ghost"
              icon={Trash}
              className="text-danger"
              onClick={() => {
                void actions.removeTask(task)
                void navigate('/gorevler')
              }}
            >
              {t('common.delete')}
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-muted">{t('workspace.viewerNotice')}</p>
          {task.data.note && <p className="whitespace-pre-wrap">{task.data.note}</p>}
        </div>
      )}
    </>
  )
}
