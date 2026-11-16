// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { applyQuery } from '../../src/lib/store/query.ts'
import type { Rec } from '../../src/lib/store/records.ts'

function task(id: string, data: Partial<Rec<'tasks'>['data']>, createdAt = '2026-11-16T09:00:00.000Z'): Rec<'tasks'> {
  return {
    id,
    deleted: false,
    createdAt,
    updatedAt: createdAt,
    data: { listId: null, title: id, note: '', done: false, dueDate: null, priority: 'normal', order: 0, ...data },
  }
}

const tasks = [
  task('c', { title: 'Çay al', dueDate: '2026-11-20' }),
  task('a', { title: 'Armut', done: true }),
  task('i', { title: 'ılık süt', dueDate: '2026-11-18' }),
  task('b', { title: 'İlaç', dueDate: null }),
]

describe('kayıt sorgusu (where + sort)', () => {
  it('nesneyle alan eşitliği; işlevle serbest süzgeç', () => {
    expect(applyQuery(tasks, { where: { done: true } }).map((item) => item.id)).toEqual(['a'])
    expect(applyQuery(tasks, { where: (item) => item.data.title.length > 4 }).map((item) => item.id)).toEqual([
      'c',
      'a',
      'i',
    ])
  })

  it("metin Türk alfabesine göre sıralanır (Ç C'den sonra, ı i'den önce)", () => {
    expect(applyQuery(tasks, { sort: 'title' }).map((item) => item.data.title)).toEqual([
      'Armut',
      'Çay al',
      'ılık süt',
      'İlaç',
    ])
  })

  it('boş değerler artan ve azalan sırada hep sonda kalır', () => {
    expect(applyQuery(tasks, { sort: 'dueDate' }).map((item) => item.id)).toEqual(['i', 'c', 'a', 'b'])
    expect(applyQuery(tasks, { sort: '-dueDate' }).map((item) => item.id)).toEqual(['c', 'i', 'a', 'b'])
  })
})
