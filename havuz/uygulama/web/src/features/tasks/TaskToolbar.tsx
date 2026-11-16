/**
 * Görev listesinin süzme ve sıralama denetimleri: arama (Türkçe'ye duyarlı) ve yanında "Süz ve sırala" düğmesi;
 * düğme liste, sıralama ve gruplama seçeneklerini açar/kapar. Durum adres çubuğundadır
 * (?ara=…&liste=…&sira=…&grup=…): yenilemede ve geri tuşunda korunur.
 */
import { Search, SlidersHorizontal } from 'lucide-react'
import { useId, useState } from 'react'
import { t } from '../../i18n/index.ts'
import { Badge, cx, Field, Input, SelectField, Switch } from '../../ui/index.ts'
import { SORT_LABELS } from './labels.ts'
import { TASK_SORTS, type ListFilter, type TaskList, type TaskSort } from './logic.ts'

export interface TaskToolbarProps {
  readonly query: string
  readonly onQuery: (query: string) => void
  readonly list: ListFilter
  readonly onList: (list: ListFilter) => void
  readonly sort: TaskSort
  readonly onSort: (sort: TaskSort) => void
  readonly grouped: boolean
  readonly onGrouped: (grouped: boolean) => void
  readonly lists: readonly TaskList[]
}

export function TaskToolbar(props: TaskToolbarProps) {
  const active = (props.list !== 'all' ? 1 : 0) + (props.sort !== 'manual' ? 1 : 0)
  const [open, setOpen] = useState(active > 0)
  const panelId = useId()
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <Field label={t('tasks.search.label')} hideLabel className="flex-1">
          {(control) => (
            <div className="relative">
              <Search
                aria-hidden
                size={20}
                className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted"
              />
              <Input
                {...control}
                type="search"
                value={props.query}
                onChange={(event) => props.onQuery(event.target.value)}
                placeholder={t('tasks.search.placeholder')}
                className="pl-11"
              />
            </div>
          )}
        </Field>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
          className={cx(
            'inline-flex min-h-12 shrink-0 items-center gap-2 rounded-xl border px-3 font-semibold transition-colors',
            open ? 'border-accent bg-accent-soft text-accent-text' : 'border-line-strong bg-surface hover:bg-surface-2',
          )}
        >
          <SlidersHorizontal aria-hidden size={20} />
          <span className="sr-only sm:not-sr-only">{t('tasks.filters')}</span>
          {active > 0 && <Badge tone="accent">{active}</Badge>}
        </button>
      </div>
      <div id={panelId} hidden={!open} className="rounded-2xl border border-line bg-surface p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            label={t('tasks.filter.list')}
            value={props.list}
            onChange={(event) => props.onList(event.target.value)}
          >
            <option value="all">{t('tasks.filter.allLists')}</option>
            <option value="none">{t('tasks.filter.noList')}</option>
            {props.lists.map((list) => (
              <option key={list.id} value={list.id}>
                {list.data.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={t('tasks.filter.sort')}
            value={props.sort}
            onChange={(event) => props.onSort(event.target.value as TaskSort)}
          >
            {TASK_SORTS.map((sort) => (
              <option key={sort} value={sort}>
                {t(SORT_LABELS[sort])}
              </option>
            ))}
          </SelectField>
          <div className="sm:col-span-2">
            <Switch
              label={t('tasks.filter.group')}
              description={t('tasks.filter.groupHint')}
              checked={props.grouped}
              onChange={props.onGrouped}
              disabled={props.list !== 'all'}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
