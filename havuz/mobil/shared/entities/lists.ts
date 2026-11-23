// KOPYA — elle değiştirmeyin. Kaynak: havuz/uygulama/shared/src/entities/lists.ts · Kopyalanma: 2026-11-23 · Yenile: npm run shared:sync
/**
 * Örnek varlık: Liste. Görevleri gruplar (bkz. tasks.ts → `listId`).
 * KOPYALA-UYARLA: yeni bir varlık yazarken bu dosyayı örnek alın.
 */
import { z } from 'zod'
import { defineEntity, type EntityData, type EntityInput } from '../entity.ts'

export const LIST_COLORS = ['blue', 'green', 'amber', 'red', 'violet', 'gray'] as const
export type ListColor = (typeof LIST_COLORS)[number]

export const listEntity = defineEntity({
  collection: 'lists',
  label: { singular: 'Liste', plural: 'Listeler' },
  schema: z.object({
    name: z.string().trim().min(1, 'Listeye bir ad verin.').max(80, 'Ad en çok 80 karakter olabilir.'),
    color: z.enum(LIST_COLORS).default('blue'),
    /** Sıralama anahtarı: küçük olan üstte. Araya eklemek için iki komşunun ortalaması verilir. */
    order: z.number().default(0),
  }),
})

export type List = EntityData<typeof listEntity>
export type ListInput = EntityInput<typeof listEntity>
