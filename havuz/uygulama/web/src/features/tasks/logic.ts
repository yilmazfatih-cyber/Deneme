/**
 * Görevler özelliğinin saf mantığı: süzme, sıralama, listelere göre gruplama, sıra numarası hesabı.
 * React'ten ve veritabanından bağımsızdır; testi: test/features/tasks-logic.test.ts.
 *
 * KOPYALA-UYARLA: yeni bir özellik yazarken süzme/sıralama mantığını böyle ayrı bir dosyada tutun.
 */
import { compareTr, matchesTr, type TaskPriority } from '@uygulama/shared'
import type { Rec } from '../../lib/store/records.ts'

export type Task = Rec<'tasks'>
export type TaskList = Rec<'lists'>

export const TASK_STATUSES = ['open', 'done', 'all'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const TASK_SORTS = ['manual', 'due', 'priority', 'title', 'created'] as const
export type TaskSort = (typeof TASK_SORTS)[number]

/** Liste süzgeci: bütün listeler, listesizler ya da belirli bir liste. */
export type ListFilter = 'all' | 'none' | (string & {})

export interface TaskFilter {
  readonly status: TaskStatus
  readonly list: ListFilter
  readonly query: string
}

/** Görevin listesi hâlâ var mı (silinmiş listedeki görev "listesiz" sayılır). */
function liveListId(task: Task, liveLists: ReadonlySet<string>): string | null {
  const id = task.data.listId
  return id !== null && liveLists.has(id) ? id : null
}

export function filterTasks(tasks: readonly Task[], filter: TaskFilter, lists: readonly TaskList[]): Task[] {
  const liveLists = new Set(lists.filter((list) => !list.deleted).map((list) => list.id))
  return tasks.filter((task) => {
    if (filter.status === 'open' && task.data.done) return false
    if (filter.status === 'done' && !task.data.done) return false
    const listId = liveListId(task, liveLists)
    if (filter.list === 'none' && listId !== null) return false
    if (filter.list !== 'all' && filter.list !== 'none' && listId !== filter.list) return false
    return matchesTr(`${task.data.title} ${task.data.note}`, filter.query)
  })
}

const PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, normal: 1, low: 2 }

const byDue = (a: Task, b: Task) => {
  if (a.data.dueDate === b.data.dueDate) return 0
  if (a.data.dueDate === null) return 1
  if (b.data.dueDate === null) return -1
  return a.data.dueDate < b.data.dueDate ? -1 : 1
}
const byPriority = (a: Task, b: Task) => PRIORITY_RANK[a.data.priority] - PRIORITY_RANK[b.data.priority]
const byOrder = (a: Task, b: Task) => a.data.order - b.data.order
const byCreated = (a: Task, b: Task) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0)

const COMPARATORS: Record<TaskSort, (a: Task, b: Task) => number> = {
  manual: (a, b) => byOrder(a, b) || byCreated(a, b),
  due: (a, b) => byDue(a, b) || byPriority(a, b) || byOrder(a, b),
  priority: (a, b) => byPriority(a, b) || byDue(a, b) || byOrder(a, b),
  title: (a, b) => compareTr(a.data.title, b.data.title) || byCreated(a, b),
  created: (a, b) => byCreated(b, a),
}

export function sortTasks(tasks: readonly Task[], sort: TaskSort): Task[] {
  return tasks.toSorted((a, b) => COMPARATORS[sort](a, b) || (a.id < b.id ? -1 : 1))
}

export function sortLists(lists: readonly TaskList[]): TaskList[] {
  return lists.toSorted((a, b) => a.data.order - b.data.order || compareTr(a.data.name, b.data.name))
}

export interface TaskGroup {
  /** Liste kimliği; listesizler için `none`. */
  readonly key: string
  readonly list: TaskList | null
  readonly tasks: Task[]
}

/** Görevleri listelerin sırasıyla gruplar; listesizler sonda. Boş gruplar atlanır. */
export function groupByList(tasks: readonly Task[], lists: readonly TaskList[]): TaskGroup[] {
  const live = sortLists(lists.filter((list) => !list.deleted))
  const liveIds = new Set(live.map((list) => list.id))
  const groups: TaskGroup[] = live.map((list) => ({ key: list.id, list, tasks: [] }))
  const none: TaskGroup = { key: 'none', list: null, tasks: [] }
  const byId = new Map(groups.map((group) => [group.key, group]))
  for (const task of tasks) {
    const listId = liveListId(task, liveIds)
    ;(listId === null ? none : (byId.get(listId) ?? none)).tasks.push(task)
  }
  return [...groups, none].filter((group) => group.tasks.length > 0)
}

export function countByStatus(tasks: readonly Task[]): Record<TaskStatus, number> {
  const done = tasks.filter((task) => task.data.done).length
  return { open: tasks.length - done, done, all: tasks.length }
}

/** Sona eklenecek kaydın sıra numarası. */
export function orderAtEnd(items: readonly { data: { order: number } }[]): number {
  return items.reduce((max, item) => Math.max(max, item.data.order), 0) + 1
}

/**
 * Sıralı listede `index`teki öğeyi bir yukarı (-1) ya da aşağı (+1) taşımak için yeni sıra numarası.
 * İki komşunun ortalaması alınır; böylece yalnız taşınan kayıt değişir (öteki cihazların sırası bozulmaz).
 */
export function moveOrder(
  sorted: readonly { data: { order: number } }[],
  index: number,
  direction: -1 | 1,
): number | null {
  const target = index + direction
  const neighbour = sorted[target]
  if (!sorted[index] || !neighbour) return null
  const beyond = sorted[target + direction]
  if (!beyond) return neighbour.data.order + direction
  return (neighbour.data.order + beyond.data.order) / 2
}
