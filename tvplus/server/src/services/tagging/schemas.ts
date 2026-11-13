/** Etiketleme uçlarının katı istek doğrulaması (tel sözleşmesi: shared/intelligence.ts → TagSheetInput). */
import { z } from 'zod'
import { SCALE_MAX } from '../../../../shared/tagging-schema'

/** zTagSheet.tagger ile aynı kural: takma ad, kişisel veri değil */
export const TAGGER_RE = /^[a-z0-9][a-z0-9._-]{1,31}$/

export const zTitleIdParam = z.coerce.number().int().positive().max(2_147_483_647)

export const zSheetInput = z.strictObject({
  watched: z.boolean({ error: 'watched alanı true ya da false olmalı' }),
  scales: z.record(
    z.string().max(64),
    z
      .number({ error: `Ölçek değeri 0–${SCALE_MAX} arasında tam sayı ya da null olmalı` })
      .int({ error: `Ölçek değeri tam sayı olmalı` })
      .min(0, { error: `Ölçek değeri 0'dan küçük olamaz` })
      .max(SCALE_MAX, { error: `Ölçek değeri ${SCALE_MAX}'ten büyük olamaz` })
      .nullable(),
  ),
  facets: z.record(z.string().max(64), z.array(z.string().max(64)).max(20)),
  notes: z.string().max(2000, { error: 'Not en çok 2000 karakter olabilir' }).optional(),
  status: z.enum(['DRAFT', 'SUBMITTED'], { error: "status 'DRAFT' ya da 'SUBMITTED' olmalı" }).optional(),
})
export type SheetInput = z.infer<typeof zSheetInput>
