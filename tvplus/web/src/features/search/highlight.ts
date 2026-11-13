/**
 * Tahmin vurgusu (saf): yazılan kısım sönük, modelin tahmin ettiği kalan kısım kalın.
 * Eşleşme Türkçe duyarsızdır ("dun" → "Dünya", "si" → "TV+ Sinema"); ad başında ya da kelime başında aranır.
 * Harf harf düzleştirilir: düzleştirilmiş metindeki konum özgün metindeki konumla aynıdır.
 */

const FOLD: Record<string, string> = {
  ı: 'i',
  İ: 'i',
  I: 'i',
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
  Â: 'a',
  î: 'i',
  Î: 'i',
  û: 'u',
  Û: 'u',
}

/** Tek UTF-16 birimini tek birime düzleştirir (konumlar korunur). */
function foldUnit(ch: string): string {
  const f = FOLD[ch]
  if (f) return f
  const base = ch.normalize('NFD').charAt(0).toLowerCase()
  return base.length === 1 ? base : ch
}

export function foldText(s: string): string {
  let out = ''
  for (let i = 0; i < s.length; i++) out += foldUnit(s.charAt(i))
  return out
}

const isWordChar = (c: string) => /[a-z0-9]/.test(c)

export interface HighlightPart {
  text: string
  /** true → kullanıcının yazdığı kısım (sönük) */
  typed: boolean
}

/**
 * "Sintel", "si" → [{Si, typed}, {ntel}] · "TV+ Sinema", "si" → [{TV+ }, {Si, typed}, {nema}]
 * Eşleşme yoksa tüm metin tahmindir (kalın).
 */
export function highlightPrediction(text: string, typed: string): HighlightPart[] {
  const q = foldText(typed.trim().replace(/\s+/g, ' '))
  if (!q) return [{ text, typed: false }]
  const t = foldText(text)
  let at = -1
  let from = 0
  while (from <= t.length - q.length) {
    const i = t.indexOf(q, from)
    if (i < 0) break
    if (i === 0 || !isWordChar(t.charAt(i - 1))) {
      at = i
      break
    }
    from = i + 1
  }
  if (at < 0) return [{ text, typed: false }]
  const parts: HighlightPart[] = []
  if (at > 0) parts.push({ text: text.slice(0, at), typed: false })
  parts.push({ text: text.slice(at, at + q.length), typed: true })
  if (at + q.length < text.length) parts.push({ text: text.slice(at + q.length), typed: false })
  return parts
}
