/**
 * Listeler sayfası (/listeler): listeleri ekle, adını/rengini değiştir, sırala, sil (geri alınabilir).
 * Silinen listedeki görevler silinmez; "listesiz" görünür. Görev sayısına dokunulunca o listenin görevleri açılır.
 */
import { ArrowDown, ArrowUp, ListChecks, Pencil, Plus, Trash } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import type { ListColor } from '@uygulama/shared'
import { t } from '../../i18n/index.ts'
import { useStore } from '../../lib/store/context.tsx'
import { useRecords, useWrite } from '../../lib/store/hooks.ts'
import { Button, ConfirmDialog, EmptyState, Menu, PageHeader, Skeleton } from '../../ui/index.ts'
import { COLOR_VARS } from './labels.ts'
import { moveOrder, orderAtEnd, sortLists, type TaskList } from './logic.ts'
import { ListDialog } from './ListDialog.tsx'
import { useTaskActions } from './useTaskActions.ts'

type Editing = { mode: 'create' } | { mode: 'edit'; list: TaskList } | null

export function ListsPage() {
  const { workspace } = useStore()
  const lists = useRecords('lists')
  const tasks = useRecords('tasks')
  const writer = useWrite('lists')
  const actions = useTaskActions()
  const [editing, setEditing] = useState<Editing>(null)
  const [confirming, setConfirming] = useState<TaskList | null>(null)

  const live = useMemo(() => sortLists((lists ?? []).filter((list) => !list.deleted)), [lists])
  const openCount = (listId: string) =>
    (tasks ?? []).filter((task) => !task.deleted && !task.data.done && task.data.listId === listId).length
  const taskCount = (listId: string) =>
    (tasks ?? []).filter((task) => !task.deleted && task.data.listId === listId).length

  const remove = (list: TaskList) => {
    if (taskCount(list.id) > 0) setConfirming(list)
    else void actions.removeList(list)
  }

  const save = async (values: { name: string; color: ListColor }) => {
    if (editing?.mode === 'edit') await writer.update(editing.list.id, values)
    else await writer.create({ ...values, order: orderAtEnd(live) })
  }

  return (
    <>
      <PageHeader
        title={t('lists.title')}
        description={t('lists.description')}
        actions={
          workspace.canWrite && (
            <Button icon={Plus} onClick={() => setEditing({ mode: 'create' })}>
              {t('lists.new')}
            </Button>
          )
        }
      />
      {lists === undefined ? (
        <Skeleton lines={3} />
      ) : live.length === 0 ? (
        <EmptyState icon={ListChecks} title={t('lists.empty.title')} message={t('lists.empty.message')} />
      ) : (
        <ul className="flex flex-col gap-2">
          {live.map((list, index) => (
            <li
              key={list.id}
              className="flex items-center gap-3 rounded-2xl border border-line bg-surface py-1 pr-1 pl-4"
            >
              <span
                aria-hidden
                className="size-3.5 shrink-0 rounded-full"
                style={{ background: COLOR_VARS[list.data.color] }}
              />
              <Link
                to={`/gorevler?liste=${list.id}`}
                className="flex min-h-12 min-w-0 flex-1 flex-col justify-center rounded-lg py-2 hover:underline"
              >
                <span className="font-semibold break-words">{list.data.name}</span>
                <span className="text-sm text-muted">{t('lists.openCount', { count: openCount(list.id) })}</span>
              </Link>
              {workspace.canWrite && (
                <Menu
                  label={t('lists.menu', { name: list.data.name })}
                  items={[
                    { label: t('common.edit'), icon: Pencil, onSelect: () => setEditing({ mode: 'edit', list }) },
                    {
                      label: t('tasks.moveUp'),
                      icon: ArrowUp,
                      disabled: index === 0,
                      onSelect: () => {
                        const order = moveOrder(live, index, -1)
                        if (order !== null) void actions.setListOrder(list, order)
                      },
                    },
                    {
                      label: t('tasks.moveDown'),
                      icon: ArrowDown,
                      disabled: index === live.length - 1,
                      onSelect: () => {
                        const order = moveOrder(live, index, 1)
                        if (order !== null) void actions.setListOrder(list, order)
                      },
                    },
                    { label: t('common.delete'), icon: Trash, tone: 'danger', onSelect: () => remove(list) },
                  ]}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <ListDialog
          open
          mode={editing.mode}
          initial={editing.mode === 'edit' ? editing.list.data : { name: '', color: 'blue' }}
          onClose={() => setEditing(null)}
          onSubmit={save}
        />
      )}
      <ConfirmDialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title={t('lists.confirmDelete.title', { name: confirming?.data.name ?? '' })}
        message={t('lists.confirmDelete.message', { count: confirming ? taskCount(confirming.id) : 0 })}
        confirmLabel={t('common.delete')}
        tone="danger"
        onConfirm={async () => {
          if (confirming) await actions.removeList(confirming)
        }}
      />
    </>
  )
}
