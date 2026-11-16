/**
 * Görev satırı: tamamlandı kutusu, başlık (ayrıntıya bağlantı), son tarih / öncelik / liste rozetleri, menü.
 * Son tarih bugünse ve geçmişse vurgulanır. İzleyici rolünde kutu ve menü kapalıdır.
 *
 * KOPYALA-UYARLA: yeni bir varlığın liste satırını yazarken bunu örnek alın.
 */
import { ArrowDown, ArrowUp, CalendarDays, Flag, Pencil, Trash } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { t } from '../../i18n/index.ts'
import { useToday } from '../../lib/clock.tsx'
import { dueState, formatDay } from '../../lib/date.ts'
import { Badge, cx, Menu, type MenuItem } from '../../ui/index.ts'
import { COLOR_VARS, PRIORITY_LABELS } from './labels.ts'
import type { Task, TaskList } from './logic.ts'

export interface TaskRowProps {
  readonly task: Task
  /** Görevin listesi (rozet için); gruplu görünümde verilmez. */
  readonly list?: TaskList | null
  readonly readOnly: boolean
  readonly onToggle: (task: Task) => void
  readonly onRemove: (task: Task) => void
  /** Elle sıralamada yukarı/aşağı taşıma (verilmezse menüde görünmez). */
  readonly onMove?: ((direction: -1 | 1) => void) | undefined
  readonly canMoveUp?: boolean
  readonly canMoveDown?: boolean
}

export function TaskRow({ task, list, readOnly, onToggle, onRemove, onMove, canMoveUp, canMoveDown }: TaskRowProps) {
  const navigate = useNavigate()
  const today = useToday()
  const { title, done, dueDate, priority, note } = task.data
  const due = dueDate ? dueState(dueDate, today) : null
  const href = `/gorevler/${task.id}`

  const items: MenuItem[] = [
    { label: t('common.edit'), icon: Pencil, onSelect: () => void navigate(href) },
    ...(onMove
      ? [
          { label: t('tasks.moveUp'), icon: ArrowUp, onSelect: () => onMove(-1), disabled: !canMoveUp },
          { label: t('tasks.moveDown'), icon: ArrowDown, onSelect: () => onMove(1), disabled: !canMoveDown },
        ]
      : []),
    { label: t('common.delete'), icon: Trash, tone: 'danger', onSelect: () => onRemove(task) },
  ]

  return (
    <li className="group flex items-start gap-1 rounded-2xl border border-line bg-surface py-1 pr-1 pl-1 transition-colors hover:border-line-strong/60">
      <label className="flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-xl">
        <input
          type="checkbox"
          checked={done}
          disabled={readOnly}
          onChange={() => onToggle(task)}
          aria-label={t(done ? 'tasks.markOpen' : 'tasks.markDone', { title })}
          className="task-check"
        />
      </label>
      <div className="flex min-w-0 flex-1 flex-col gap-1 py-2.5">
        <Link
          to={href}
          className={cx(
            'w-fit max-w-full rounded-md font-semibold break-words text-ink hover:underline',
            done && 'text-muted line-through decoration-2',
          )}
        >
          {title}
        </Link>
        {note && <p className="line-clamp-1 text-sm text-muted">{note}</p>}
        {(dueDate || priority !== 'normal' || list) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {dueDate && due && (
              <Badge
                icon={CalendarDays}
                tone={done ? 'neutral' : due === 'overdue' ? 'danger' : due === 'today' ? 'warn' : 'neutral'}
              >
                {due === 'overdue' && !done
                  ? t('tasks.due.overdue', { date: formatDay(dueDate, today) })
                  : formatDay(dueDate, today)}
              </Badge>
            )}
            {priority !== 'normal' && (
              <Badge icon={Flag} tone={priority === 'high' ? 'accent' : 'neutral'}>
                {t(PRIORITY_LABELS[priority])}
              </Badge>
            )}
            {list && (
              <span className="inline-flex items-center gap-1.5 px-1 text-sm text-muted">
                <span
                  aria-hidden
                  className="size-2.5 rounded-full"
                  style={{ background: COLOR_VARS[list.data.color] }}
                />
                {list.data.name}
              </span>
            )}
          </div>
        )}
      </div>
      {!readOnly && <Menu label={t('tasks.menu', { title })} items={items} />}
    </li>
  )
}
