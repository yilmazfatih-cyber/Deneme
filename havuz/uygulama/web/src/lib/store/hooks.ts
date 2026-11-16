/**
 * React kancaları: yerel depodan CANLI okuma (veri değişince bileşen kendiliğinden yenilenir) ve yazma.
 * Tek doğruluk kaynağı Dexie'dir; ayrıca önbellek ya da durum deposu kurmayın.
 *
 *   const tasks = useRecords('tasks', { where: { done: false }, sort: 'title' })  // undefined = yükleniyor
 *   const task = useRecord('tasks', id)                                         // null = bulunamadı
 *   const { create, update, remove, restore } = useWrite('tasks')
 *
 * Kayıtlar geçerli çalışma alanından (useStore().workspace) okunur ve oraya yazılır.
 * Genişletme: yeni bir okuma biçimi → `useLiveQuery` ile buraya yeni bir kanca ekleyin.
 */
import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import type { CollectionName, InputOf } from '@uygulama/shared'
import { useDb, useStore } from './context.tsx'
import { getMeta, type MetaKey, type MetaValue } from './meta.ts'
import { applyQuery, type Sort, type Where } from './query.ts'
import { createRecord, getRecord, listRecords, removeRecord, restoreRecord, updateRecord, type Rec } from './records.ts'

export interface UseRecordsOptions<C extends CollectionName> {
  readonly where?: Where<C>
  readonly sort?: Sort<C>
  /** Silinmiş kayıtlar da gelsin mi ("son silinenler" ekranı için). */
  readonly includeDeleted?: boolean
}

/** Geçerli alandaki kayıtlar. Yüklenirken `undefined` döner. */
export function useRecords<C extends CollectionName>(
  collection: C,
  options: UseRecordsOptions<C> = {},
): Rec<C>[] | undefined {
  const { db, workspace } = useStore()
  const includeDeleted = options.includeDeleted === true
  const records = useLiveQuery(
    () => listRecords(db, workspace.id, collection, { includeDeleted }),
    [db, workspace.id, collection, includeDeleted],
  )
  const { where, sort } = options
  return useMemo(() => records && applyQuery(records, { where, sort }), [records, where, sort])
}

/** Tek kayıt. Yüklenirken `undefined`, yoksa `null` döner (silinmiş kayıt `deleted: true` ile gelir). */
export function useRecord<C extends CollectionName>(collection: C, id: string | undefined): Rec<C> | null | undefined {
  const { db, workspace } = useStore()
  return useLiveQuery(
    async () => (id ? getRecord(db, workspace.id, collection, id) : null),
    [db, workspace.id, collection, id],
  )
}

export interface Writer<C extends CollectionName> {
  /** Yeni kayıt; kimliğini döndürür. Geçersiz veride `AppError('validation')` fırlatır (details: alan iletileri). */
  create: (input: InputOf<C>) => Promise<string>
  /** Yalnız değişen alanlar gönderilir. Değişiklik yoksa `false`. */
  update: (id: string, changes: Partial<InputOf<C>>) => Promise<boolean>
  /** Silinmiş işaretler (geri alınabilir). */
  remove: (id: string) => Promise<void>
  restore: (id: string) => Promise<void>
}

/** Geçerli alana yazan işlevler. */
export function useWrite<C extends CollectionName>(collection: C): Writer<C> {
  const { db, workspace } = useStore()
  return useMemo(
    () => ({
      create: (input) => createRecord(db, workspace.id, collection, input),
      update: (id, changes) => updateRecord(db, workspace.id, collection, id, changes),
      remove: (id) => removeRecord(db, workspace.id, collection, id),
      restore: (id) => restoreRecord(db, workspace.id, collection, id),
    }),
    [db, workspace.id, collection],
  )
}

/** Üst veriden canlı okuma (eşitleme zamanı, reddedilenler…). Yüklenirken `undefined`. */
export function useMeta<K extends MetaKey>(key: K): MetaValue<K> | undefined {
  const db = useDb()
  return useLiveQuery(() => getMeta(db, key), [db, key])
}

/** Sunucuya gönderilmeyi bekleyen değişiklik sayısı. */
export function usePendingCount(): number | undefined {
  const db = useDb()
  return useLiveQuery(() => db.outbox.count(), [db])
}
