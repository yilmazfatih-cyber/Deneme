/**
 * Form değerlerini ortak sözleşmedeki şemayla doğrular; uymazsa alan iletileriyle `AppError('validation')` fırlatır
 * (useSubmit bunları alanların altına yazar). Böylece sunucuya gitmeden "Geçerli bir e-posta yazın." görünür.
 *
 * Genişletme: yeni bir form → shared'daki istek şemasını (ör. registerRequestSchema) burada kullanın.
 */
import { AppError, issuesToDetails } from '@uygulama/shared'
import type { z } from 'zod'

export function parseForm<S extends z.ZodType>(schema: S, values: unknown): z.output<S> {
  const parsed = schema.safeParse(values)
  if (parsed.success) return parsed.data
  const details = issuesToDetails(parsed.error)
  throw new AppError('validation', details[0]?.message, details)
}
