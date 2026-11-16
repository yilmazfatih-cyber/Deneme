// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  countByStatus,
  filterTasks,
  groupByList,
  moveOrder,
  orderAtEnd,
  sortTasks,
  type Task,
  type TaskList,
} from '../../src/features/tasks/logic.ts'

const AT = '2026-11-16T09:00:00.000Z'

function task(id: string, data: Partial<Task['data']> = {}, extra: Partial<Task> = {}): Task {
  return {
    id,
    deleted: false,
    createdAt: AT,
    updatedAt: AT,
    data: { listId: null, title: id, note: '', done: false, dueDate: null, priority: 'normal', order: 0, ...data },
    ...extra,
  }
}

function list(id: string, order: number, deleted = false): TaskList {
  return { id, deleted, createdAt: AT, updatedAt: AT, data: { name: id, color: 'blue', order } }
}

describe('görev mantığı', () => {
  const lists = [list('ev', 2), list('is', 1), list('eski', 3, true)]
  const tasks = [
    task('a', { listId: 'ev', title: 'Çamaşır' }),
    task('b', { listId: 'is', title: 'Rapor', done: true }),
    task('c', { listId: 'eski', title: 'Silinmiş listede' }),
    task('d', { title: 'Listesiz', note: 'İLAÇ al' }),
  ]

  it('süzme: durum, liste (silinmiş listedeki görev listesiz sayılır), Türkçe arama', () => {
    expect(filterTasks(tasks, { status: 'open', list: 'all', query: '' }, lists).map((t) => t.id)).toEqual([
      'a',
      'c',
      'd',
    ])
    expect(filterTasks(tasks, { status: 'all', list: 'none', query: '' }, lists).map((t) => t.id)).toEqual(['c', 'd'])
    expect(filterTasks(tasks, { status: 'all', list: 'is', query: '' }, lists).map((t) => t.id)).toEqual(['b'])
    expect(filterTasks(tasks, { status: 'all', list: 'all', query: 'ilac' }, lists).map((t) => t.id)).toEqual(['d'])
    expect(filterTasks(tasks, { status: 'all', list: 'all', query: 'camasir' }, lists).map((t) => t.id)).toEqual(['a'])
  })

  it('gruplama: listelerin kendi sırasıyla, listesizler sonda, boş grup yok', () => {
    expect(groupByList(tasks, lists).map((group) => [group.key, group.tasks.map((t) => t.id)])).toEqual([
      ['is', ['b']],
      ['ev', ['a']],
      ['none', ['c', 'd']],
    ])
  })

  it('sıralama: son tarih (boşlar sonda), öncelik, ad (Türkçe), en yeni', () => {
    const items = [
      task('x', { title: 'Zeytin', dueDate: null, priority: 'high' }),
      task('y', { title: 'Çorba', dueDate: '2026-11-20', priority: 'low' }),
      task('z', { title: 'Cam', dueDate: '2026-11-18' }, { createdAt: '2026-11-17T00:00:00.000Z' }),
    ]
    expect(sortTasks(items, 'due').map((t) => t.id)).toEqual(['z', 'y', 'x'])
    expect(sortTasks(items, 'priority').map((t) => t.id)).toEqual(['x', 'z', 'y'])
    expect(sortTasks(items, 'title').map((t) => t.data.title)).toEqual(['Cam', 'Çorba', 'Zeytin'])
    expect(sortTasks(items, 'created')[0]?.id).toBe('z')
  })

  it('sayılar ve sıra numaraları: sona ekleme ve iki komşunun ortalaması', () => {
    expect(countByStatus(tasks)).toEqual({ open: 3, done: 1, all: 4 })
    const ordered = [task('p', { order: 1 }), task('q', { order: 2 }), task('r', { order: 4 })]
    expect(orderAtEnd(ordered)).toBe(5)
    expect(moveOrder(ordered, 2, -1)).toBe(1.5) // r, p ile q arasına
    expect(moveOrder(ordered, 1, -1)).toBe(0) // q en üste
    expect(moveOrder(ordered, 0, 1)).toBe(3) // p, q ile r arasına
    expect(moveOrder(ordered, 0, -1)).toBeNull()
  })
})
