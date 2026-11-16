/**
 * Form doğrulama ve gönderim yardımcıları (saf). Tarayıcı betikleri ve birim testleri kullanır.
 * Kim kullanır: src/scripts/contact-form.ts, src/scripts/newsletter.ts, tests/unit/form-validation.test.ts.
 * Genişletme: yeni bir alan kuralı → `FieldRule`'a ekleyin, `validateField` içinde işleyin, teste örnek yazın.
 */
import { fill } from './text.ts'

/** Basit ama yeterli e-posta deseni: boşluksuz yerel kısım @ alan adı . en az iki harfli uzantı. */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u

export interface FieldRule {
  required?: boolean
  email?: boolean
  minLength?: number
  maxLength?: number
}

export interface ValidationMessages {
  required: string
  invalidEmail: string
  tooShort: string
  tooLong: string
}

/** Alanı kurala göre denetler; geçerliyse null, değilse kullanıcıya gösterilecek ileti. */
export function validateField(rawValue: string, rule: FieldRule, messages: ValidationMessages): string | null {
  const value = rawValue.trim()
  if (value === '') return rule.required ? messages.required : null
  if (rule.email && !EMAIL_PATTERN.test(value)) return messages.invalidEmail
  const length = [...value].length
  if (rule.minLength !== undefined && length < rule.minLength) return fill(messages.tooShort, { min: rule.minLength })
  if (rule.maxLength !== undefined && length > rule.maxLength) return fill(messages.tooLong, { max: rule.maxLength })
  return null
}

/** Form, sayfa açıldıktan çok kısa süre sonra mı gönderildi? (Botlar genellikle anında doldurur.) */
export function isTooFast(startedAt: number, now: number, minimumMs: number): boolean {
  return now - startedAt < minimumMs
}

/** E-posta uygulamasını açan mailto: adresi. Konu ve gövde güvenle kodlanır. */
export function buildMailto(to: string, subject: string, body: string): string {
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

/** Form alanlarından düz metin e-posta gövdesi. */
export function mailBody(fields: { label: string; value: string }[]): string {
  return fields.map((field) => `${field.label}:\n${field.value.trim()}`).join('\n\n')
}
