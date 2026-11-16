// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { applyImport, BACKUP_FORMAT, exportWorkspace, planImport } from '../../src/lib/backup.ts'
import { createRecord, listRecords, removeRecord } from '../../src/lib/store/records.ts'
import { freshDb } from '../helpers/sync.ts'

describe('JSON yedek', () => {
  it('dışa aktarılan yedek başka bir yere aynen içe aktarılır; silinenler dışarıda kalır', async () => {
    const source = freshDb()
    const listId = await createRecord(source, 'ws', 'lists', { name: 'Ev', color: 'green' })
    await createRecord(source, 'ws', 'tasks', { title: 'Süt al', listId })
    const gone = await createRecord(source, 'ws', 'tasks', { title: 'Silinen' })
    await removeRecord(source, 'ws', 'tasks', gone)
    const backup = await exportWorkspace(source, 'ws', new Date('2026-11-16T09:00:00Z'))
    expect(backup.format).toBe(BACKUP_FORMAT)

    const target = freshDb()
    const check = await planImport(target, 'baska', JSON.parse(JSON.stringify(backup)))
    expect(check.ok).toBe(true)
    if (!check.ok) return
    expect(check.plan.summary).toEqual({
      lists: { added: 1, updated: 0, unchanged: 0 },
      tasks: { added: 1, updated: 0, unchanged: 0 },
    })
    expect(await applyImport(target, 'baska', check.plan)).toBe(2)
    const [task] = await listRecords(target, 'baska', 'tasks')
    expect(task?.data).toMatchObject({ title: 'Süt al', listId })

    const again = await planImport(target, 'baska', backup)
    expect(again.ok && again.plan.writes).toEqual([])
  })

  it('geçersiz kayıtlar atlanır ve bildirilir; biçimi tutmayan dosya reddedilir', async () => {
    const db = freshDb()
    const check = await planImport(db, 'ws', {
      format: BACKUP_FORMAT,
      version: 1,
      exportedAt: '2026-11-16T09:00:00Z',
      collections: {
        tasks: [
          { id: 'a1', data: { title: '' } },
          { id: 'a2', data: { title: 'Geçerli' } },
          { id: 'kötü kimlik', data: { title: 'X' } },
        ],
        bilinmeyen: [{ id: 'x', data: {} }],
      },
    })
    expect(check.ok && check.plan.writes.map((write) => write.recordId)).toEqual(['a2'])
    expect(check.ok && check.plan.problems.map((problem) => problem.collection)).toEqual([
      'tasks',
      'tasks',
      'bilinmeyen',
    ])
    expect(check.ok && check.plan.problems[0]?.message).toBe('Göreve bir başlık yazın.')
    expect(await planImport(db, 'ws', { herhangi: 'şey' })).toEqual({ ok: false, reason: 'format' })
  })
})
