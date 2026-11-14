/**
 * TV giriş kodu: TV'de "KLMN-4821" biçiminde 8 karakter görünür. Sunucunun abecesinde karışan karakterler yoktur
 * (0/O, 1/I/L); kullanıcı bunlardan birini yazarsa kodu sunucuya yollamadan nazikçe uyarırız (yanlış denemeler
 * sunucuda sayılır ve sınırlanır). Saf işlevler (birim testi: code.test.ts).
 */

/** Sunucuyla aynı abece: server/src/services/devices/tvlogin.ts USER_CODE_ALPHABET */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const CODE_LENGTH = 8

/** Karışan karakterler: abecede yoklar, yazılırsa koddaki karakter bunlardan biri değildir. */
const AMBIGUOUS = new Set(['0', 'O', '1', 'I', 'L'])

/** Büyük harfe çevirir (Türkçe i → İ değil, kod Latin harfleridir), tire / boşluk / noktalama atar, 8 karakterde keser. */
export function cleanCode(raw: string): string {
  // toUpperCase yerele bağlı değildir: i → I, ı → I; İ ayrıca I'ya çevrilir.
  return raw
    .toUpperCase()
    .replace(/İ/g, 'I')
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, CODE_LENGTH)
}

/** Görünür biçim: 4 karakterden sonra tire ("KLMN-4821"); yazarken "KLMN-48". */
export function formatCode(clean: string): string {
  return clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean
}

export type CodeCheck =
  | { kind: 'empty' }
  | { kind: 'partial'; clean: string }
  | { kind: 'ambiguous'; clean: string; chars: string[] }
  | { kind: 'complete'; clean: string }

/** Yazılan kodu değerlendirir: eksik, karışan karakter içeren ya da tamam. */
export function checkCode(raw: string): CodeCheck {
  const clean = cleanCode(raw)
  if (!clean) return { kind: 'empty' }
  const bad = [...new Set([...clean].filter((c) => AMBIGUOUS.has(c) || !CODE_ALPHABET.includes(c)))]
  if (bad.length) return { kind: 'ambiguous', clean, chars: bad }
  if (clean.length < CODE_LENGTH) return { kind: 'partial', clean }
  return { kind: 'complete', clean }
}

/**
 * Girdi alanında imleç konumunu biçimlendirmeden sonra korur: imleçten önceki anlamlı karakter sayısı aynı kalır.
 * Dönen değer yeni metindeki imleç konumu.
 */
export function caretAfterFormat(raw: string, caret: number, formatted: string): number {
  const before = cleanCode(raw.slice(0, caret)).length
  let seen = 0
  for (let i = 0; i < formatted.length; i++) {
    if (seen === before) return i
    if (formatted[i] !== '-') seen++
  }
  return formatted.length
}

/** Adres sorgusundaki kodu okur (?kod=…); geçersizse boş dize. */
export function codeFromSearch(search: string): string {
  const v = new URLSearchParams(search).get('kod')
  return v ? cleanCode(v) : ''
}
