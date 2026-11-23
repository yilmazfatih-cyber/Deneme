// KOPYA — elle değiştirmeyin. Kaynak: havuz/uygulama/shared/src/entities/tasks.ts · Kopyalanma: 2026-11-23 · Yenile: npm run shared:sync
/**
 * Örnek varlık: Görev. Bir listeye bağlı olabilir (`listId`), son tarihi ve önceliği vardır.
 * KOPYALA-UYARLA: başka bir kayda bağlanan (ilişkili) varlık yazarken bu dosyayı örnek alın.
 *
 * İlişki notu: `listId` yalnız bir kimliktir; sunucu "o liste var mı" diye bakmaz (çevrimdışı yazılan kayıtlar
 * her sırayla gelebilir). Liste silinmişse görev "listesiz" gibi gösterilir; bunu arayüz ele alır.
 */
import { z } from 'zod'
import { defineEntity, type EntityData, type EntityInput } from '../entity.ts'
import { idSchema } from '../ids.ts'

export const TASK_PRIORITIES = ['low', 'normal', 'high'] as const
export type TaskPriority = (typeof TASK_PRIORITIES)[number]

export const taskEntity = defineEntity({
  collection: 'tasks',
  label: { singular: 'Görev', plural: 'Görevler' },
  schema: z.object({
    listId: idSchema.nullable().default(null),
    title: z.string().trim().min(1, 'Göreve bir başlık yazın.').max(200, 'Başlık en çok 200 karakter olabilir.'),
    note: z.string().max(5000, 'Not en çok 5000 karakter olabilir.').default(''),
    done: z.boolean().default(false),
    /** Son tarih: `YYYY-AA-GG` (saat yok; saat dilimi sorunu çıkmasın diye düz tarih). */
    dueDate: z.iso.date('Tarih YYYY-AA-GG biçiminde olmalı.').nullable().default(null),
    priority: z.enum(TASK_PRIORITIES).default('normal'),
    order: z.number().default(0),
  }),
})

export type Task = EntityData<typeof taskEntity>
export type TaskInput = EntityInput<typeof taskEntity>
