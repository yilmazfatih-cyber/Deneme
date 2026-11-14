/** Türkçe duyarlı metin yardımcıları (arama ve gösterim). */

const FOLD: Record<string, string> = {
  ı: 'i',
  İ: 'i',
  ş: 's',
  Ş: 's',
  ğ: 'g',
  Ğ: 'g',
  ü: 'u',
  Ü: 'u',
  ö: 'o',
  Ö: 'o',
  ç: 'c',
  Ç: 'c',
  â: 'a',
  î: 'i',
  û: 'u',
}

/** Arama için düzleştirme: küçük harf + Türkçe harflerin ASCII karşılığı + noktalama → boşluk. */
export function norm(s: string): string {
  let out = ''
  for (const ch of s) out += FOLD[ch] ?? ch
  return out
    .toLocaleLowerCase('en-US')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Büyük harf her zaman Türkçe kurallarıyla (i → İ). */
export const upperTr = (s: string) => s.toLocaleUpperCase('tr-TR')

/** "1 sa 28 dk" / "42 dk" */
export function formatRuntime(sec: number | null | undefined): string {
  if (!sec || sec <= 0) return ''
  const m = Math.round(sec / 60)
  if (m < 60) return `${Math.max(1, m)} dk`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h} sa ${r} dk` : `${h} sa`
}

/** Sunucuda kişi adından kararlı kimlik üretmek için (FNV-1a, 31 bit). */
export function stableId(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0) % 2_000_000_000
}
