/**
 * Görevler sayfası (/gorevler): hızlı ekleme, arama, süzme, sıralama, listelere göre gruplama, durum sekmeleri.
 * Veri Dexie'den canlı okunur (useRecords); başka cihazdan gelen değişiklik kendiliğinden görünür.
 *
 * KOPYALA-UYARLA: yeni bir varlığın liste sayfası için başlangıç noktası budur
 * (`npm run gen -- entity <ad>` bunun sadeleştirilmiş bir kopyasını üretir).
 */
import { Eye, Inbox, Plus, SearchX } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { t } from '../../i18n/index.ts'
import { useStore } from '../../lib/store/context.tsx'
import { useRecords } from '../../lib/store/hooks.ts'
import { Button, ButtonLink, EmptyState, PageHeader, Skeleton, Tabs } from '../../ui/index.ts'
import { STATUS_LABELS } from './labels.ts'
import {
  countByStatus,
  filterTasks,
  groupByList,
  moveOrder,
  orderAtEnd,
  sortLists,
  sortTasks,
  TASK_SORTS,
  TASK_STATUSES,
  type ListFilter,
  type Task,
  type TaskList,
  type TaskSort,
  type TaskStatus,
} from './logic.ts'
import { QuickAdd } from './QuickAdd.tsx'
import { TaskRow } from './TaskRow.tsx'
import { TaskToolbar } from './TaskToolbar.tsx'
import { useTaskActions } from './useTaskActions.ts'

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

export function TasksPage() {
  const { workspace } = useStore()
  const tasks = useRecords('tasks')
  const lists = useRecords('lists')
  const actions = useTaskActions()
  const [params, setParams] = useSearchParams()

  const status = pick(params.get('durum'), TASK_STATUSES, 'open')
  const sort = pick(params.get('sira'), TASK_SORTS, 'manual')
  const list: ListFilter = params.get('liste') ?? 'all'
  const query = params.get('ara') ?? ''
  const groupWanted = list === 'all' && params.get('grup') !== '0'

  const update = (key: string, value: string, fallback: string) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (value === fallback) next.delete(key)
        else next.set(key, value)
        return next
      },
      { replace: true },
    )

  const liveLists = useMemo(() => sortLists((lists ?? []).filter((item) => !item.deleted)), [lists])
  // Hiç liste yoksa gruplamak anlamsız: düz liste gösterilir.
  const grouped = groupWanted && liveLists.length > 0
  const scoped = useMemo(
    () => filterTasks(tasks ?? [], { status: 'all', list, query }, lists ?? []),
    [tasks, lists, list, query],
  )
  const visible = useMemo(
    () => sortTasks(filterTasks(scoped, { status, list: 'all', query: '' }, lists ?? []), sort),
    [scoped, status, sort, lists],
  )
  const counts = countByStatus(scoped)
  const readOnly = !workspace.canWrite
  const listById = new Map(liveLists.map((item) => [item.id, item]))
  const quickListId = list !== 'all' && list !== 'none' && listById.has(list) ? list : null

  const renderRows = (rows: Task[], showList: boolean) => (
    <ul className="flex flex-col gap-2">
      {rows.map((task, index) => (
        <TaskRow
          key={task.id}
          task={task}
          list={showList && task.data.listId ? (listById.get(task.data.listId) ?? null) : null}
          readOnly={readOnly}
          onToggle={(item) => void actions.toggleDone(item)}
          onRemove={(item) => void actions.removeTask(item)}
          onMove={
            sort === 'manual'
              ? (direction) => {
                  const order = moveOrder(rows, index, direction)
                  if (order !== null) void actions.setOrder(task, order)
                }
              : undefined
          }
          canMoveUp={index > 0}
          canMoveDown={index < rows.length - 1}
        />
      ))}
    </ul>
  )

  let content: ReactNode
  if (tasks === undefined || lists === undefined) content = <Skeleton lines={4} />
  else if (tasks.filter((task) => !task.deleted).length === 0)
    content = <EmptyState icon={Inbox} title={t('tasks.empty.title')} message={t('tasks.empty.message')} />
  else if (visible.length === 0)
    content = (
      <EmptyState
        icon={SearchX}
        title={t('tasks.noMatch.title')}
        message={t('tasks.noMatch.message')}
        action={
          <Button variant="secondary" onClick={() => setParams({}, { replace: true })}>
            {t('tasks.noMatch.clear')}
          </Button>
        }
      />
    )
  else if (grouped)
    content = (
      <div className="flex flex-col gap-6">
        {groupByList(visible, lists).map((group) => (
          <GroupSection key={group.key} list={group.list} count={group.tasks.length}>
            {renderRows(group.tasks, false)}
          </GroupSection>
        ))}
      </div>
    )
  else content = renderRows(visible, list === 'all')

  return (
    <>
      <PageHeader
        title={t('tasks.title')}
        description={t('tasks.summary', { workspace: workspace.name, count: counts.open })}
        actions={
          !readOnly && (
            <ButtonLink
              to={quickListId ? `/gorevler/yeni?liste=${quickListId}` : '/gorevler/yeni'}
              variant="secondary"
              icon={Plus}
            >
              {t('tasks.new')}
            </ButtonLink>
          )
        }
      />
      <div className="flex flex-col gap-4">
        {readOnly && (
          <p className="flex items-center gap-2 rounded-2xl bg-warn-soft px-4 py-3 font-medium text-warn">
            <Eye aria-hidden size={20} />
            {t('workspace.viewerNotice')}
          </p>
        )}
        {!readOnly && <QuickAdd listId={quickListId} order={orderAtEnd(tasks ?? [])} disabled={false} />}
        <TaskToolbar
          query={query}
          onQuery={(value) => update('ara', value, '')}
          list={list}
          onList={(value) => update('liste', value, 'all')}
          sort={sort}
          onSort={(value: TaskSort) => update('sira', value, 'manual')}
          grouped={groupWanted}
          onGrouped={(value) => update('grup', value ? '1' : '0', '1')}
          lists={liveLists}
        />
        <Tabs
          label={t('tasks.status.label')}
          value={status}
          onChange={(value: TaskStatus) => update('durum', value, 'open')}
          tabs={TASK_STATUSES.map((value) => ({ value, label: t(STATUS_LABELS[value]), count: counts[value] }))}
        >
          {content}
        </Tabs>
      </div>
    </>
  )
}

function GroupSection({ list, count, children }: { list: TaskList | null; count: number; children: ReactNode }) {
  const name = list?.data.name ?? t('tasks.noList')
  return (
    <section aria-label={name} className="flex flex-col gap-2">
      <h2 className="flex items-center gap-2 px-1 font-bold text-muted">
        <span
          aria-hidden
          className="size-2.5 rounded-full"
          style={{ background: list ? `var(--list-${list.data.color})` : 'var(--line-strong)' }}
        />
        {name}
        <span className="font-semibold tabular-nums">· {count}</span>
      </h2>
      {children}
    </section>
  )
}
