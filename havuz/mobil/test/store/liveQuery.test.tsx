/**
 * Canlı okuma: sorgu sonucu yazmadan SONRA kendiliğinden yenilenir; ilgisiz tablodaki yazma yeniden sorgulatmaz;
 * anahtar değişince eski sonuç gösterilmez.
 */
import { renderHook, waitFor } from '@testing-library/react-native'
import { useLiveQuery } from '../../src/lib/store/liveQuery.ts'
import { setMeta } from '../../src/lib/store/meta.ts'
import { createRecord, listRecords } from '../../src/lib/store/records.ts'
import { freshDb } from '../support/db.ts'

describe('canlı okuma (useLiveQuery)', () => {
  it('yazmadan sonra yenilenir; ilgisiz tablo sorguyu yeniden çalıştırmaz', async () => {
    const db = await freshDb()
    let runs = 0
    const { result } = await renderHook(() =>
      useLiveQuery(db, ['records'], 'gorevler', async () => {
        runs += 1
        return (await listRecords(db, 'ws', 'tasks')).map((record) => record.data.title)
      }),
    )
    await waitFor(() => expect(result.current).toEqual([]))
    await createRecord(db, 'ws', 'tasks', { title: 'Süt al' })
    await waitFor(() => expect(result.current).toEqual(['Süt al']))
    const before = runs
    await db.write((sql) => setMeta(sql, 'lastSyncedAt', '2026-11-16T09:00:00.000Z'))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(runs).toBe(before)
  })

  it('anahtar değişince eski sonuç gösterilmez', async () => {
    const db = await freshDb()
    await createRecord(db, 'a', 'tasks', { title: 'A alanı' })
    await createRecord(db, 'b', 'tasks', { title: 'B alanı' })
    const { result, rerender } = await renderHook(
      ({ ws }: { ws: string }) =>
        useLiveQuery(db, ['records'], ws, async () => (await listRecords(db, ws, 'tasks')).map((r) => r.data.title)),
      { initialProps: { ws: 'a' } },
    )
    await waitFor(() => expect(result.current).toEqual(['A alanı']))
    await rerender({ ws: 'b' })
    expect(result.current).not.toEqual(['A alanı'])
    await waitFor(() => expect(result.current).toEqual(['B alanı']))
  })
})
