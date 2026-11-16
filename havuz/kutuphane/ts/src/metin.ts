/**
 * metin — metin yardımcıları: kısaltma (sözcük ortasından ve birleşik harften bölmeden), satır sarma, sözcük
 * sayımı (Türkçe kesmeli ekler tek sözcük: "Ankara'ya"), okuma süresi, şablon doldurma ({ad}, {kisi.ad}),
 * HTML kaçışı, boşluk sadeleştirme.
 *
 * Kullanım:
 *   truncate('Türkiye Büyük Millet Meclisi', 20)        // "Türkiye Büyük…"
 *   wrap('uzun bir paragraf …', 40)                     // satır dizisi (her biri ≤ 40 karakter)
 *   wordCount("Ankara'ya e-posta gönderdim.")           // 3
 *   readingTime(makale)                                  // dakika (dakikada 200 sözcük varsayımıyla, yukarı yuvarlanır)
 *   fillTemplate('Merhaba {ad}, {{kod}}: {sipariş.no}', { ad: 'Ayşe', sipariş: { no: 42 } })
 *   // "Merhaba Ayşe, {kod}: 42"   (eksik alan → TemplateError; { missing: 'keep' | 'empty' })
 *
 * Sınırlar: Uzunluklar KOD NOKTASI sayısıdır (birleşik emoji birden çok sayılır; Intl.Segmenter kullanılmaz ki Python
 * eşiyle aynı sonuç çıksın). Dakikada 200 sözcük yaygın bir varsayımdır, ölçülmedi. Şablonda koşul/döngü yoktur
 * (bilerek); HTML'e basılacaksa `escape: escapeHtml` verin.
 *
 * Genişletme: Yeni işlev kod noktası mantığıyla yazılır (Array.from) ve Python eşine aynı kurallarla eklenir;
 * `vektorler/metin.json`'a örnek yazılır.
 */

export class TemplateError extends Error {
  override name = 'TemplateError'
}

const SPACE_CHARS =
  ' \t\n\r\f\v\u{a0}\u{1680}\u{2000}\u{2001}\u{2002}\u{2003}\u{2004}\u{2005}\u{2006}\u{2007}\u{2008}\u{2009}\u{200a}\u{2028}\u{2029}\u{202f}\u{205f}\u{3000}\u{feff}'
const TRAILING_PUNCTUATION = ',;:-–—'

function isSpace(ch: string | undefined): boolean {
  return ch !== undefined && ch !== '' && SPACE_CHARS.includes(ch)
}

function isMark(ch: string | undefined): boolean {
  return ch !== undefined && /^\p{M}$/u.test(ch)
}

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /^[\p{L}\p{N}\p{M}]$/u.test(ch)
}

/** Boşlukları tek boşluğa indirir ve baştan/sondan atar. */
export function normalizeWhitespace(text: string): string {
  const out: string[] = []
  let pending = false
  for (const ch of text) {
    if (isSpace(ch)) pending = out.length > 0
    else {
      if (pending) out.push(' ')
      out.push(ch)
      pending = false
    }
  }
  return out.join('')
}

/**
 * En çok `maxLength` kod noktası olacak biçimde kısaltır ve sonuna `ellipsis` (varsayılan "…") ekler.
 * `wordBoundary` (varsayılan true) → mümkünse sözcük sınırında keser (kesilen kısım yarıdan fazla değilse).
 */
export function truncate(
  text: string,
  maxLength: number,
  options: { ellipsis?: string; wordBoundary?: boolean } = {},
): string {
  if (!Number.isInteger(maxLength) || maxLength < 0)
    throw new RangeError('maxLength 0 veya daha büyük tam sayı olmalı.')
  const chars = Array.from(text)
  if (chars.length <= maxLength) return text
  const ellipsis = Array.from(options.ellipsis ?? '…')
  const room = maxLength - ellipsis.length
  if (room <= 0) return ellipsis.slice(0, maxLength).join('')
  let cut = room
  while (cut > 0 && isMark(chars[cut])) cut -= 1 // harfi işaretinden ayırma
  if (options.wordBoundary ?? true) {
    let k = cut
    while (k > 0 && !isSpace(chars[k])) k -= 1
    if (k > 0 && k >= room / 2) cut = k
  }
  let end = cut
  while (end > 0 && (isSpace(chars[end - 1]) || TRAILING_PUNCTUATION.includes(chars[end - 1] ?? ''))) end -= 1
  return chars.slice(0, end).join('') + ellipsis.join('')
}

/** Satırlara sarar: her satır en çok `width` kod noktası; daha uzun sözcük bölünür. "\n" paragrafları korunur. */
export function wrap(text: string, width: number): string[] {
  if (!Number.isInteger(width) || width < 1) throw new RangeError('width 1 veya daha büyük tam sayı olmalı.')
  const lines: string[] = []
  for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
    const words = normalizeWhitespace(paragraph)
      .split(' ')
      .filter((word) => word !== '')
    let line: string[] = []
    for (const word of words) {
      let chars = Array.from(word)
      while (chars.length > width) {
        if (line.length > 0) lines.push(line.join(''))
        lines.push(chars.slice(0, width).join(''))
        chars = chars.slice(width)
        line = []
      }
      if (chars.length === 0) continue
      const needed = line.length === 0 ? chars.length : line.length + 1 + chars.length
      if (needed <= width) line = line.length === 0 ? chars : [...line, ' ', ...chars]
      else {
        lines.push(line.join(''))
        line = chars
      }
    }
    lines.push(line.join(''))
  }
  return lines
}

/** Sözcük sayısı: harf/rakam dizileri; içteki kesme ve tire sözcüğü bölmez ("Ankara'ya", "e-posta" birer sözcük). */
export function wordCount(text: string): number {
  const chars = Array.from(text)
  let count = 0
  let inWord = false
  chars.forEach((ch, i) => {
    if (isWordChar(ch)) {
      if (!inWord) count += 1
      inWord = true
    } else if (inWord && "'’-".includes(ch) && isWordChar(chars[i + 1]) && isWordChar(chars[i - 1])) {
      // sözcüğün içinde: devam
    } else inWord = false
  })
  return count
}

/** Okuma süresi (dakika, yukarı yuvarlanır); boş metin 0. */
export function readingTime(text: string, options: { wordsPerMinute?: number } = {}): number {
  const wpm = options.wordsPerMinute ?? 200
  if (!(wpm > 0)) throw new RangeError('wordsPerMinute sıfırdan büyük olmalı.')
  return Math.ceil(wordCount(text) / wpm)
}

/** HTML'de güvenle göstermek için & < > " ' kaçışı. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function plainNumber(value: number): string {
  if (!Number.isFinite(value)) throw new TemplateError(`Sonlu olmayan sayı şablona yazılamaz: ${value}.`)
  return Number.isInteger(value) && Math.abs(value) < 1e21 ? value.toFixed(0) : String(value)
}

/**
 * Şablonu doldurur: {ad}, {kisi.ad} (iç içe), {{ ve }} → düz { }. Değer metin, sayı ya da mantıksal olmalı.
 * `missing`: 'error' (varsayılan; TemplateError) | 'keep' ({ad} olduğu gibi) | 'empty' (boş). `escape` her değere uygulanır.
 */
export function fillTemplate(
  template: string,
  values: Record<string, unknown>,
  options: { missing?: 'error' | 'keep' | 'empty'; escape?: (value: string) => string } = {},
): string {
  return template.replace(/\{\{|\}\}|\{([^{}]*)\}/g, (match, name: string | undefined) => {
    if (match === '{{') return '{'
    if (match === '}}') return '}'
    const path = (name ?? '').trim()
    let value: unknown = values
    for (const part of path.split('.')) {
      value =
        value !== null && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, part)
          ? (value as Record<string, unknown>)[part]
          : undefined
    }
    if (value === undefined || value === null) {
      const missing = options.missing ?? 'error'
      if (missing === 'keep') return match
      if (missing === 'empty') return ''
      throw new TemplateError(`Şablonda "{${path}}" için değer verilmedi.`)
    }
    let text: string
    if (typeof value === 'string') text = value
    else if (typeof value === 'number') text = plainNumber(value)
    else if (typeof value === 'boolean') text = value ? 'true' : 'false'
    else throw new TemplateError(`"{${path}}" değeri metin, sayı ya da mantıksal olmalı.`)
    return options.escape ? options.escape(text) : text
  })
}
