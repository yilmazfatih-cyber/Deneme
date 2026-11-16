// Metin birimleri: imleç bir grafem kümesinin (kullanıcının tek karakter gördüğü şeyin) ortasına düşmemelidir.
// "👍🏽" (2 kod noktası, 4 UTF-16 birimi), "é" (e + birleşik işaret) ve "🇹🇷" (iki bölge harfi) tek adımda
// geçilir ve silinir. Kelime sınırları da Intl.Segmenter ile bulunur (Ctrl+ok tuşları).
// Hesap yalnız ilgili satır üzerinde yapılır; bütün belge bölütlenmez.
// Genişletme: görsel sütun (doğu Asya geniş karakterleri, sekme genişliği) için `visualColumn` yazılabilir.

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
const wordSegmenter = new Intl.Segmenter('tr', { granularity: 'word' })

/** `offset`'ten sonraki ilk grafem sınırı (metin sonundaysa metin uzunluğu). */
export function nextGrapheme(text: string, offset: number): number {
  if (offset >= text.length) return text.length
  const segment = graphemeSegmenter.segment(text).containing(offset)
  return segment ? segment.index + segment.segment.length : text.length
}

/** `offset`'ten önceki grafem sınırı (başta ise 0). */
export function prevGrapheme(text: string, offset: number): number {
  if (offset <= 0) return 0
  return graphemeSegmenter.segment(text).containing(offset - 1)?.index ?? 0
}

/** Konum bir grafem sınırında değilse içinde bulunduğu kümenin başına çeker. */
export function snapToGrapheme(text: string, offset: number): number {
  if (offset <= 0 || offset >= text.length) return Math.max(0, Math.min(offset, text.length))
  return graphemeSegmenter.segment(text).containing(offset)?.index ?? offset
}

export function graphemeCount(text: string, end = text.length): number {
  let count = 0
  for (const s of graphemeSegmenter.segment(text.slice(0, end))) count += s.segment.length > 0 ? 1 : 0
  return count
}

/** n. grafemin başladığı UTF-16 konumu (satırdan uzunsa satır sonu). */
export function offsetOfGrapheme(text: string, n: number): number {
  let count = 0
  for (const s of graphemeSegmenter.segment(text)) {
    if (count === n) return s.index
    count++
  }
  return text.length
}

/** Sonraki kelimenin sonu (Ctrl+→). */
export function nextWordEnd(text: string, offset: number): number {
  for (const s of wordSegmenter.segment(text)) {
    const end = s.index + s.segment.length
    if (s.isWordLike && end > offset) return end
  }
  return text.length
}

/** Önceki kelimenin başı (Ctrl+←). */
export function prevWordStart(text: string, offset: number): number {
  let result = 0
  for (const s of wordSegmenter.segment(text)) {
    if (s.index >= offset) break
    if (s.isWordLike) result = s.index
  }
  return result
}

/** Konumdaki kelimenin aralığı (yoksa boş aralık). */
export function wordAt(text: string, offset: number): { from: number; to: number } {
  for (const s of wordSegmenter.segment(text)) {
    const end = s.index + s.segment.length
    if (s.isWordLike && s.index <= offset && offset <= end) return { from: s.index, to: end }
  }
  return { from: offset, to: offset }
}
