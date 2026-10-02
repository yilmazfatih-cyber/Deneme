/** Türkçe metin yardımcıları. Büyük/küçük harf dönüşümü her zaman tr-TR ile (i → İ, ı → I). */

export const TR = 'tr-TR'

export function upperTr(s: string): string {
  return s.toLocaleUpperCase(TR)
}

export function lowerTr(s: string): string {
  return s.toLocaleLowerCase(TR)
}

/** Cümle düzeni: yalnızca ilk harf büyük. */
export function capitalizeTr(s: string): string {
  if (!s) return s
  return upperTr(s.charAt(0)) + s.slice(1)
}

// prettier-ignore
export const TURKISH_ALPHABET = [
  'a', 'b', 'c', 'ç', 'd', 'e', 'f', 'g', 'ğ', 'h', 'ı', 'i', 'j', 'k', 'l',
  'm', 'n', 'o', 'ö', 'p', 'r', 's', 'ş', 't', 'u', 'ü', 'v', 'y', 'z',
] as const

/** Türkçe alfabe sırasına göre karşılaştırma. */
export function compareTr(a: string, b: string): number {
  return a.localeCompare(b, TR)
}

export function firstLetter(word: string): string {
  return lowerTr(word.trim().charAt(0))
}

/** Uzun cümlede sonu göster; şerit tek bakışta okunur kalsın. */
export function tail(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(text.length - max)
  const space = cut.indexOf(' ')
  return '… ' + (space > 0 && space < 12 ? cut.slice(space + 1) : cut)
}

/** "…" boşluklu cümlede boşluğu kelimeyle doldurur (model ipucu için). */
export function fillBlank(sentence: string, word: string): string {
  return sentence.replace('…', word)
}
