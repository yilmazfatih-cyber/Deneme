/**
 * TV ekran klavyesi — saf düzen ve kenar gezintisi (DOM yok; birim testi keyboard.test.ts).
 *
 * 6 sütun (UX_SPEC §4): üstte geniş tuşlar (boşluk · sil · temizle, her biri 2 sütun), altında Türk alfabesi
 * (a–z + ç ğ ı ö ş ü; q w x dahil, alfabe sırasıyla), sonra rakamlar. Tuşlar ızgarada `col` ve `span` taşır.
 *
 * Gezinti (`moveKey`):
 *   ←/→ satır içinde komşu tuş; satırın ilk sütununda ← ve son sütununda → klavyeden çıkar ('exit').
 *   ↑/↓ üst/alt satırda aynı sütunu kapsayan tuş; o satır kısaysa satırın son tuşu; en üst/alt satırda 'exit'.
 *   Çıkışlar ekrana bırakılır: → sonuçlara, ↓ tahminlere, ← yan menüye (kabuk).
 */

export type KeyAction = 'char' | 'space' | 'delete' | 'clear'

export interface KeyDef {
  id: string
  /** Ekranda görünen yazı ('char' tuşlarında yazılacak karakter) */
  label: string
  action: KeyAction
  /** Yazılacak karakter ('char') */
  char?: string
  row: number
  col: number
  span: number
}

export const COLUMNS = 6

/** Türk alfabesi + q w x (alfabe sırasıyla) */
export const LETTERS = 'abcçdefgğhıijklmnoöpqrsştuüvwxyz'.split('')
export const DIGITS = '1234567890'.split('')

export const keyIdOf = (k: Pick<KeyDef, 'action' | 'char'>): string =>
  k.action === 'char' ? `ara:tus:${k.char}` : `ara:tus:${k.action}`

/** Düzeni kurar: satır satır tuşlar. */
export function buildLayout(columns = COLUMNS): KeyDef[][] {
  const rows: KeyDef[][] = []
  const special: KeyDef[] = [
    { id: '', label: 'Boşluk', action: 'space', row: 0, col: 0, span: 2 },
    { id: '', label: 'Sil', action: 'delete', row: 0, col: 2, span: 2 },
    { id: '', label: 'Temizle', action: 'clear', row: 0, col: 4, span: 2 },
  ]
  rows.push(special.map((k) => ({ ...k, id: keyIdOf(k) })))
  const chars = [...LETTERS, ...DIGITS]
  for (let i = 0; i < chars.length; i += columns) {
    const r = rows.length
    rows.push(
      chars.slice(i, i + columns).map((ch, c) => {
        const k: KeyDef = { id: '', label: ch, action: 'char', char: ch, row: r, col: c, span: 1 }
        return { ...k, id: keyIdOf(k) }
      }),
    )
  }
  return rows
}

export const LAYOUT: KeyDef[][] = buildLayout()

export function findKey(layout: KeyDef[][], id: string): KeyDef | null {
  for (const row of layout) for (const k of row) if (k.id === id) return k
  return null
}

export type Direction = 'up' | 'down' | 'left' | 'right'

export type MoveResult = { kind: 'key'; id: string } | { kind: 'exit'; dir: Direction }

/** Satırda `col` sütununu kapsayan tuş; yoksa (kısa satır) son tuş. */
function keyAtColumn(row: KeyDef[], col: number): KeyDef {
  return row.find((k) => col >= k.col && col < k.col + k.span) ?? row[row.length - 1]!
}

/**
 * Tuştan yön tuşuyla gidilecek yer. `preferredCol`: dikey gezintide hatırlanan sütun (geniş tuştan geçerken
 * sütun kaybolmasın diye); verilmezse tuşun ilk sütunu.
 */
export function moveKey(layout: KeyDef[][], fromId: string, dir: Direction, preferredCol?: number): MoveResult {
  const from = findKey(layout, fromId)
  if (!from) return { kind: 'exit', dir }
  const row = layout[from.row]!
  const i = row.indexOf(from)
  if (dir === 'left') return i > 0 ? { kind: 'key', id: row[i - 1]!.id } : { kind: 'exit', dir }
  if (dir === 'right') return i < row.length - 1 ? { kind: 'key', id: row[i + 1]!.id } : { kind: 'exit', dir }
  const target = layout[from.row + (dir === 'up' ? -1 : 1)]
  if (!target) return { kind: 'exit', dir }
  const col =
    preferredCol !== undefined && preferredCol >= from.col && preferredCol < from.col + from.span
      ? preferredCol
      : from.col
  return { kind: 'key', id: keyAtColumn(target, col).id }
}

/** Dikey gezintide hatırlanacak sütun: tek sütunlu tuşta kendi sütunu, geniş tuşta öncekini korur. */
export function nextPreferredCol(layout: KeyDef[][], toId: string, prev: number | undefined): number | undefined {
  const k = findKey(layout, toId)
  if (!k) return prev
  if (k.span === 1) return k.col
  return prev !== undefined && prev >= k.col && prev < k.col + k.span ? prev : k.col
}

/** Fiziksel klavye karakteri ekran klavyesinde var mı (Türkçe küçük harfe çevrilerek)? */
export function typedChar(key: string): string | null {
  if (key.length !== 1) return null
  if (key === ' ') return ' '
  const lower = key.toLocaleLowerCase('tr-TR')
  return LETTERS.includes(lower) || DIGITS.includes(lower) ? lower : null
}
