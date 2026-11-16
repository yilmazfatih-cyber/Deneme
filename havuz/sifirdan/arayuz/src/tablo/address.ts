// Hücre adresleri: "A1", "$B$2", "AA10" ↔ { satır, sütun, mutlak mı }. Satır ve sütun 0 tabanlıdır (A1 = 0,0).
// Türkçe tuzağı: sütun harfleri yalnız ASCII'dir; küçük "i5" büyütülürken tr-TR kuralı "İ5" yapardı. Bu yüzden
// büyütme harf kodu üzerinden yapılır (`asciiUpper`).
// Genişletme: sayfa adlı başvuru ("Sayfa2!A1") için `parseRef`'e önek ayrıştırması ekleyin.

export interface CellRef {
  row: number
  col: number
  absRow: boolean
  absCol: boolean
}

export interface RangeRef {
  from: CellRef
  to: CellRef
}

/** Yalnız a-z harflerini büyütür (sütun adları ve İngilizce adlar için). */
export function asciiUpper(text: string): string {
  return text.replace(/[a-z]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 32))
}

/** 0 → "A", 25 → "Z", 26 → "AA" */
export function columnName(col: number): string {
  let name = ''
  for (let n = col + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name
  return name
}

/** "A" → 0, "AA" → 26 (büyük/küçük harf fark etmez) */
export function columnIndex(name: string): number {
  let index = 0
  for (const ch of asciiUpper(name)) index = index * 26 + (ch.charCodeAt(0) - 64)
  return index - 1
}

const REF = /^(\$?)([A-Za-z]{1,3})(\$?)([1-9]\d{0,6})$/

export function parseRef(text: string): CellRef | undefined {
  const m = REF.exec(text)
  if (!m) return undefined
  return { absCol: m[1] === '$', col: columnIndex(m[2] as string), absRow: m[3] === '$', row: Number(m[4]) - 1 }
}

export function formatRef(ref: CellRef): string {
  return `${ref.absCol ? '$' : ''}${columnName(ref.col)}${ref.absRow ? '$' : ''}${ref.row + 1}`
}

/** Mutlaklık işaretleri olmadan anahtar: "B2". Sayfa içinde hücreyi tanımlar. */
export function cellKey(row: number, col: number): string {
  return `${columnName(col)}${row + 1}`
}

export function parseKey(key: string): { row: number; col: number } {
  const ref = parseRef(key)
  if (!ref) throw new Error(`Geçersiz hücre adresi: "${key}" (ör. A1, B12)`)
  return { row: ref.row, col: ref.col }
}

/** Aralığın köşelerini sıraya koyar (B3:A1 → A1:B3) ve satır/sütun sınırlarını verir. */
export function normalizeRange(range: RangeRef): { top: number; left: number; bottom: number; right: number } {
  return {
    top: Math.min(range.from.row, range.to.row),
    left: Math.min(range.from.col, range.to.col),
    bottom: Math.max(range.from.row, range.to.row),
    right: Math.max(range.from.col, range.to.col),
  }
}
