/**
 * Things that must never be stored in the personal profile or sent to a model by accident:
 * passwords/API keys (see looksSecret), Turkish national id numbers (TC kimlik no), IBANs and card numbers.
 */
import { looksSecret } from '../core/text.js'

/** Official TCKN checksum: 11 digits, first digit not 0, two check digits. */
export function isValidTckn(digits: string): boolean {
  if (!/^[1-9]\d{10}$/.test(digits)) return false
  const d = [...digits].map(Number) as number[]
  const odd = d[0]! + d[2]! + d[4]! + d[6]! + d[8]!
  const even = d[1]! + d[3]! + d[5]! + d[7]!
  const tenth = (((odd * 7 - even) % 10) + 10) % 10
  if (tenth !== d[9]) return false
  return d.slice(0, 10).reduce((a, b) => a + b, 0) % 10 === d[10]
}

export function luhn(digits: string): boolean {
  let sum = 0
  let alt = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48
    if (alt) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    alt = !alt
  }
  return sum % 10 === 0
}

export type SensitiveKind = 'secret' | 'tckn' | 'iban' | 'card'

/** Turkish explanation for a refusal; the reply says what was detected, never echoes the value. */
export const SENSITIVE_REASON: Record<SensitiveKind, string> = {
  secret: 'şifre, parola veya anahtar gibi görünüyor',
  tckn: 'TC kimlik numarası gibi görünüyor',
  iban: 'IBAN gibi görünüyor',
  card: 'kart numarası gibi görünüyor',
}

export function findSensitive(text: string): SensitiveKind | undefined {
  for (const m of text.matchAll(/(?<!\d)\d{11}(?!\d)/g)) if (isValidTckn(m[0])) return 'tckn'
  if (/\bTR\s?\d{2}(?:\s?\d{4}){5}\s?\d{2}\b/i.test(text)) return 'iban'
  for (const m of text.matchAll(/(?<!\d)(?:\d[ -]?){13,19}(?!\d)/g)) {
    const digits = m[0].replace(/\D/g, '')
    if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) return 'card'
  }
  if (looksSecret(text)) return 'secret'
  return undefined
}
