/**
 * Son silinenler (/silinenler): silinen görev ve listeler, en yeni silinen üstte. Her biri tek dokunuşla geri gelir.
 * Silme bir "mezar taşı"dır (docs/ESITLEME.md): öteki cihazlarda da silinir, geri getirilince orada da geri gelir.
 */
import { ListChecks, RotateCcw, SquareCheckBig, Trash } from 'lucide-react'
import { useMemo } from 'react'
import { t } from '../../i18n/index.ts'
import { useClock } from '../../lib/clock.tsx'
import { formatRelative } from '../../lib/date.ts'
import { useStore } from '../../lib/store/context.tsx'
import { useRecords } from '../../lib/store/hooks.ts'
import { Button, EmptyState, PageHeader, Skeleton } from '../../ui/index.ts'
import type { Task, TaskList } from './logic.ts'
import { useTaskActions } from './useTaskActions.ts'

type Entry = { kind: 'task'; record: Task } | { kind: 'list'; record: TaskList }

export function TrashPage() {
  const { workspace } = useStore()
  const clock = useClock()
  const tasks = useRecords('tasks', { includeDeleted: true })
  const lists = useRecords('lists', { includeDeleted: true })
  const actions = useTaskActions()

  const entries = useMemo((): Entry[] => {
    const deletedTasks = (tasks ?? [])
      .filter((task) => task.deleted)
      .map((record) => ({ kind: 'task' as const, record }))
    const deletedLists = (lists ?? [])
      .filter((list) => list.deleted)
      .map((record) => ({ kind: 'list' as const, record }))
    return [...deletedTasks, ...deletedLists].toSorted((a, b) => (a.record.updatedAt < b.record.updatedAt ? 1 : -1))
  }, [tasks, lists])

  return (
    <>
      <PageHeader title={t('trash.title')} description={t('trash.description')} />
      {tasks === undefined || lists === undefined ? (
        <Skeleton lines={3} />
      ) : entries.length === 0 ? (
        <EmptyState icon={Trash} title={t('trash.empty.title')} message={t('trash.empty.message')} />
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((entry) => {
            const Icon = entry.kind === 'task' ? SquareCheckBig : ListChecks
            const name = entry.kind === 'task' ? entry.record.data.title : entry.record.data.name
            return (
              <li
                key={`${entry.kind}-${entry.record.id}`}
                className="flex items-center gap-3 rounded-2xl border border-line bg-surface py-1 pr-1 pl-4"
              >
                <Icon aria-hidden size={20} className="shrink-0 text-muted" />
                <div className="flex min-w-0 flex-1 flex-col py-2">
                  <span className="font-semibold break-words">{name}</span>
                  <span className="text-sm text-muted">
                    {t(entry.kind === 'task' ? 'trash.kind.task' : 'trash.kind.list')} ·{' '}
                    {t('trash.deletedAt', { when: formatRelative(entry.record.updatedAt, clock.now()) })}
                  </span>
                </div>
                {workspace.canWrite && (
                  <Button
                    variant="secondary"
                    icon={RotateCcw}
                    aria-label={t('trash.restoreItem', { name })}
                    onClick={() =>
                      void (entry.kind === 'task'
                        ? actions.restoreTask(entry.record)
                        : actions.restoreList(entry.record))
                    }
                  >
                    <span className="hidden sm:inline">{t('common.restore')}</span>
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
