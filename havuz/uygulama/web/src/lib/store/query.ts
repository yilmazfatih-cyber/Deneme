/**
 * Kayıt listesini süzme ve sıralama (saf işlevler). `useRecords(collection, { where, sort })` bunları kullanır.
 *
 *   where: { done: false }                 → alan eşitliği (birden çok alan "ve" ile birleşir)
 *   where: (kayıt) => kayıt.data.done      → serbest süzgeç
 *   sort:  'title' | '-createdAt'          → alana göre (önünde `-` varsa azalan); metin Türkçe sıralanır
 *   sort:  (a, b) => …                     → serbest karşılaştırma
 *
 * Genişletme: yeni bir süzgeç biçimi gerekiyorsa buraya ekleyin ve test/lib/query.test.ts'e testini yazın.
 */
import { compareTr, type CollectionName, type DataOf } from '@uygulama/shared'
import type { Rec } from './records.ts'

export type Where<C extends CollectionName> = Partial<DataOf<C>> | ((record: Rec<C>) => boolean)

type SortField<C extends CollectionName> = Extract<keyof DataOf<C>, string> | 'createdAt' | 'updatedAt'

export type Sort<C extends CollectionName> = SortField<C> | `-${SortField<C>}` | ((a: Rec<C>, b: Rec<C>) => number)

function matches<C extends CollectionName>(record: Rec<C>, where: Where<C>): boolean {
  if (typeof where === 'function') return where(record)
  const data = record.data as Record<string, unknown>
  return Object.entries(where).every(([field, value]) => data[field] === value)
}

/** İki değeri karşılaştırır: boş (null) değerler hep sona; metin Türkçe; sayı ve mantıksal değer doğal sırayla. */
export function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a === null || a === undefined) return 1
  if (b === null || b === undefined) return -1
  if (typeof a === 'string' && typeof b === 'string') return compareTr(a, b)
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'boolean' && typeof b === 'boolean') return a ? 1 : -1
  return compareTr(JSON.stringify(a), JSON.stringify(b))
}

function fieldOf<C extends CollectionName>(record: Rec<C>, field: string): unknown {
  if (field === 'createdAt') return record.createdAt
  if (field === 'updatedAt') return record.updatedAt
  return (record.data as Record<string, unknown>)[field]
}

export function toComparator<C extends CollectionName>(sort: Sort<C>): (a: Rec<C>, b: Rec<C>) => number {
  if (typeof sort === 'function') return sort
  const descending = sort.startsWith('-')
  const field = descending ? sort.slice(1) : sort
  return (a, b) => {
    const result = compareValues(fieldOf(a, field), fieldOf(b, field))
    // Boş değerler azalan sırada da sonda kalsın.
    const emptyA = fieldOf(a, field) == null
    const emptyB = fieldOf(b, field) == null
    if (emptyA !== emptyB) return emptyA ? 1 : -1
    return (descending ? -result : result) || compareValues(a.id, b.id)
  }
}

export function applyQuery<C extends CollectionName>(
  records: readonly Rec<C>[],
  options: { readonly where?: Where<C> | undefined; readonly sort?: Sort<C> | undefined },
): Rec<C>[] {
  const where = options.where
  const filtered = where ? records.filter((record) => matches(record, where)) : [...records]
  return options.sort ? filtered.toSorted(toComparator(options.sort)) : filtered
}
