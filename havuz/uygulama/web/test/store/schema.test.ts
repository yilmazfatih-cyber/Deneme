/**
 * @vitest-environment node
 * Dexie şema sürümleme düzeninin testi: yeni sürüm eklenince eski veri korunur ve `upgrade` adımı bir kez koşar.
 * Gerçek sürüm listesine (src/lib/store/schema.ts) yeni sürüm eklerken bu testi örnek alın.
 */
import { uuidv7 } from '@uygulama/shared'
import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'
import { AppDb } from '../../src/lib/store/db.ts'
import { DB_VERSIONS, type DbVersion } from '../../src/lib/store/schema.ts'

describe('yerel veritabanı şema sürümleri', () => {
  it('sürüm numaraları artan sırada ve tekildir', () => {
    const versions = DB_VERSIONS.map((item) => item.version)
    expect(versions).toEqual(versions.toSorted((a, b) => a - b))
    expect(new Set(versions).size).toBe(versions.length)
  })

  it('yeni sürüm eski veriyi korur ve yükseltme adımını uygular', async () => {
    const name = `test-surum-${uuidv7()}`
    const v1 = new AppDb(name, DB_VERSIONS)
    const at = '2026-11-16T09:00:00.000Z'
    await v1.records.put({
      workspaceId: 'ws',
      collection: 'tasks',
      id: 'a',
      view: { data: { title: 'Eski' }, deleted: false },
      server: null,
      createdAt: at,
      updatedAt: at,
    })
    await v1.meta.put({ key: 'cursors', value: { ws: 3 } })
    v1.close()

    // Örnek yükseltme: yeni bir dizin + eski kayıtlara yeni bir alan yazılır.
    const v2: DbVersion = {
      version: 2,
      stores: { records: '[workspaceId+collection+id], [workspaceId+collection], updatedAt' },
      upgrade: async (tx) => {
        await tx
          .table('records')
          .toCollection()
          .modify((row: { view: { data: Record<string, unknown> } }) => {
            row.view.data.note = 'yükseltildi'
          })
      },
    }
    const upgraded = new AppDb(name, [...DB_VERSIONS, v2])
    const row = await upgraded.records.get(['ws', 'tasks', 'a'])
    expect(row?.view.data).toEqual({ title: 'Eski', note: 'yükseltildi' })
    expect(await upgraded.records.where('updatedAt').equals(at).count()).toBe(1)
    expect((await upgraded.meta.get('cursors'))?.value).toEqual({ ws: 3 })
    upgraded.close()
    await Dexie.delete(name)
  })
})
