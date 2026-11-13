/** İçgörü uçlarının katı doğrulaması; hata iletileri Türkçe ve alana özgüdür. */
import { z } from 'zod'
import { GENRES } from '../../../../shared/taxonomy'
import { httpError } from '../../gateway/errors'

const isGenre = (k: string) => Object.prototype.hasOwnProperty.call(GENRES, k)

const zDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((d) => {
    const t = Date.parse(`${d}T00:00:00Z`)
    return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === d
  })

export const zMixQuery = z
  .object({
    type: z.enum(['ALL', 'MOVIE', 'SHOW']).optional(),
    from: zDay.optional(),
    to: zDay.optional(),
  })
  .strict()
  .refine((q) => !q.from || !q.to || q.from <= q.to, { path: ['to'], message: 'order' })

export const MIX_MESSAGES: Record<string, string> = {
  type: "'type' MOVIE, SHOW ya da ALL olmalı.",
  from: "'from' YYYY-AA-GG biçiminde geçerli bir tarih olmalı.",
  to: "'to' YYYY-AA-GG biçiminde geçerli bir tarih olmalı ve 'from'dan önce olmamalı.",
}

export const zTimelineQuery = z
  .object({
    dimension: z.enum(['genre', 'acquisition', 'origin']).default('genre'),
    months: z
      .string()
      .regex(/^\d{1,3}$/)
      .transform(Number)
      .pipe(z.number().int().min(1).max(60))
      .default(12),
  })
  .strict()

export const TIMELINE_MESSAGES: Record<string, string> = {
  dimension: "'dimension' genre, acquisition ya da origin olmalı.",
  months: "'months' 1–60 arası bir tamsayı olmalı.",
}

export const zPlanBody = z
  .object({
    slots: z.number().int().min(1).max(1000),
    scope: z.enum(['ALL', 'MOVIE', 'SHOW']).optional(),
    dataWeight: z.number().min(0).max(1).optional(),
    judgment: z
      .record(z.string(), z.number().min(-1).max(1))
      .refine((r) => Object.keys(r).every(isGenre))
      .optional(),
    costPerTitle: z
      .record(z.string(), z.number().positive().finite())
      .refine((r) => Object.keys(r).every(isGenre))
      .optional(),
    budget: z.number().positive().finite().optional(),
  })
  .strict()
  .refine((b) => b.budget === undefined || Object.keys(b.costPerTitle ?? {}).length > 0, {
    path: ['budget'],
    message: 'needs-cost',
  })

export const PLAN_MESSAGES: Record<string, string> = {
  slots: "'slots' 1–1000 arası bir tamsayı olmalı.",
  scope: "'scope' MOVIE, SHOW ya da ALL olmalı.",
  dataWeight: "'dataWeight' 0 ile 1 arasında olmalı.",
  judgment: "'judgment' tür anahtarı → −1…+1 sayı eşlemesi olmalı (tür anahtarları shared/taxonomy).",
  costPerTitle: "'costPerTitle' tür anahtarı → pozitif sayı eşlemesi olmalı.",
  budget: "'budget' pozitif bir sayı olmalı ve 'costPerTitle' ile birlikte verilmeli.",
}

/** Doğrular; geçersizse alana özgü Türkçe iletiyle 400 fırlatır. */
export function parseOrThrow<T>(
  schema: z.ZodType<T>,
  data: unknown,
  messages: Record<string, string>,
  what: 'Sorgu' | 'Gövde',
): T {
  const r = schema.safeParse(data ?? {})
  if (r.success) return r.data
  const issue = r.error.issues[0]
  if (issue?.code === 'unrecognized_keys') {
    throw httpError(400, 'VALIDATION_FAILED', `${what} geçersiz: bilinmeyen alan (${issue.keys.join(', ')}).`)
  }
  if (what === 'Gövde' && (data === null || typeof data !== 'object' || Array.isArray(data))) {
    throw httpError(400, 'VALIDATION_FAILED', 'Gövde geçersiz: JSON nesnesi bekleniyor.')
  }
  const field = String(issue?.path[0] ?? '')
  throw httpError(400, 'VALIDATION_FAILED', `${what} geçersiz: ${messages[field] ?? 'alanları denetleyin.'}`)
}
