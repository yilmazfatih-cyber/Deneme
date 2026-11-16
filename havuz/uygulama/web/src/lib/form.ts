/**
 * Form doğrulama yardımcısı: değeri ortak şemayla (shared) denetler, hataları alan → ileti eşlemesine çevirir.
 *
 *   const result = validate(loginRequestSchema, { email, password })
 *   if (!result.ok) return setErrors(result.errors)   // { email: 'Geçerli bir e-posta yazın.' }
 *
 * Sunucudan gelen doğrulama hatası da aynı biçime `fieldErrors(error)` ile çevrilir (lib/errors.ts).
 * Genişletme: gerekmez; yeni form yeni şemayla aynı işlevi kullanır.
 */
import { issuesToDetails } from '@uygulama/shared'
import type { z } from 'zod'

export type FieldErrors = Record<string, string>

export function validate<S extends z.ZodType>(
  schema: S,
  value: unknown,
): { readonly ok: true; readonly data: z.output<S> } | { readonly ok: false; readonly errors: FieldErrors } {
  const parsed = schema.safeParse(value)
  if (parsed.success) return { ok: true, data: parsed.data }
  const errors: FieldErrors = {}
  for (const issue of issuesToDetails(parsed.error)) errors[issue.path] ??= issue.message
  return { ok: false, errors }
}

/** İlk hatalı alana odaklanır (form doğrulanınca çağrılır). */
export function focusFirstInvalid(form: HTMLFormElement | null): void {
  requestAnimationFrame(() => form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
}
