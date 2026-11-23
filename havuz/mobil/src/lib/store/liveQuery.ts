/**
 * Canlı sorgu kancası: sorgunun sonucunu döndürür ve veritabanında ilgili tablolardan biri değişince (yazma işlemi
 * bittikten sonra) sorguyu yeniden çalıştırır. Yüklenirken `undefined` döner.
 *
 *   const count = useLiveQuery(db, ['outbox'], 'bekleyen', () => db.read(countOutbox))
 *
 * `key`: sorgunun kimliği. Değişince (ör. başka alan seçildi) eski sonuç bir an bile gösterilmez.
 * Geç gelen eski sonuç yenisini ezmez (sürüm sayacı). Hata konsola yazılır, son iyi sonuç kalır.
 *
 * Genişletme: yeni bir okuma kancası → hooks.ts'te bunu kullanan bir işlev yazın; bunu değiştirmeniz gerekmez.
 */
import { useEffect, useEffectEvent, useState } from 'react'
import type { LocalDb } from './localDb.ts'

export function useLiveQuery<T>(
  db: LocalDb,
  tables: readonly string[],
  key: string,
  query: () => Promise<T>,
): T | undefined {
  const [state, setState] = useState<{ readonly db: LocalDb; readonly key: string; readonly value: T } | null>(null)
  const runQuery = useEffectEvent(() => query())
  const tableList = tables.join(',')

  useEffect(() => {
    let active = true
    let version = 0
    const watched = tableList.split(',')
    const run = () => {
      const mine = ++version
      runQuery().then(
        (value) => {
          if (active && mine === version) setState({ db, key, value })
        },
        (error: unknown) => {
          if (active && !db.isClosed) console.error(`Canlı sorgu başarısız (${key}):`, error)
        },
      )
    }
    run()
    const unsubscribe = db.subscribe((changed) => {
      if (changed.has('*') || watched.some((table) => changed.has(table))) run()
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [db, key, tableList])

  return state !== null && state.db === db && state.key === key ? state.value : undefined
}
