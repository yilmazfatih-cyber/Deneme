/**
 * Varlık kaydı: eşitlenen bütün kayıt türleri burada listelenir.
 * Sunucu yalnız buradaki koleksiyonları kabul eder; istemci yalnız bunları saklar.
 *
 * Genişletme: yeni varlığı içe aktarın ve ENTITIES'e bir satır ekleyin. Anahtar, varlığın `collection` adıyla
 * AYNI olmalıdır (kural testi bunu denetler: shared/test/entities.test.ts).
 */
import type { z } from 'zod'
import type { EntityDef } from '../entity.ts'
import { listEntity } from './lists.ts'
import { taskEntity } from './tasks.ts'

export * from './lists.ts'
export * from './tasks.ts'

export const ENTITIES = {
  lists: listEntity,
  tasks: taskEntity,
  // YENİ VARLIK BURAYA: `<collection>: <ad>Entity,`
} as const satisfies Record<string, EntityDef>

export type CollectionName = keyof typeof ENTITIES

/** Koleksiyon adından kayıt türü: `DataOf<'tasks'>` → Task. */
export type DataOf<C extends CollectionName> = z.output<(typeof ENTITIES)[C]['schema']>

/** Koleksiyon adından yeni kayıt girdisi türü (varsayılanlı alanlar isteğe bağlı). */
export type InputOf<C extends CollectionName> = z.input<(typeof ENTITIES)[C]['schema']>

export type EntityRegistry = Readonly<Record<string, EntityDef>>

export function getEntity(collection: string, registry: EntityRegistry = ENTITIES): EntityDef | undefined {
  return Object.hasOwn(registry, collection) ? registry[collection] : undefined
}

export function isCollectionName(value: string): value is CollectionName {
  return Object.hasOwn(ENTITIES, value)
}
