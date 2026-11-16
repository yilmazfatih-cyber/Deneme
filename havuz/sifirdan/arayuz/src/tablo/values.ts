// Hücre değerleri ve dönüşümler: sayı, metin, mantıksal, boş (null) ya da hata. Hata değerleri Türkçe kodla
// gösterilir; İngilizce yazımları da tanınır. Dönüşüm kuralları e-tablo alışkanlığıdır: boş → 0 ya da "",
// DOĞRU → 1, "12" → 12 (aritmetikte); dönüşmeyen metin #DEĞER! verir. Karşılaştırma Türkçe harmanlamayla ve
// büyük/küçük harf duyarsız yapılır ("istanbul" = "İSTANBUL").
// Genişletme: yeni hata kodu = `ERROR_CODES`'a bir satır (Türkçe kod + İngilizce eş anlamlı).

export const ERROR_CODES = {
  div0: ['#BÖL/0!', '#DIV/0!'],
  value: ['#DEĞER!', '#VALUE!'],
  ref: ['#BAŞV!', '#REF!'],
  name: ['#AD?', '#NAME?'],
  na: ['#YOK', '#N/A'],
  num: ['#SAYI!', '#NUM!'],
  cycle: ['#DÖNGÜ!', '#CYCLE!'],
  parse: ['#HATA!', '#ERROR!'],
} as const

export type ErrorKind = keyof typeof ERROR_CODES

export class CellError {
  readonly kind: ErrorKind
  readonly detail: string | undefined
  constructor(kind: ErrorKind, detail?: string) {
    this.kind = kind
    this.detail = detail
  }
  get code(): string {
    return ERROR_CODES[this.kind][0]
  }
  toString(): string {
    return this.code
  }
}

export const err = (kind: ErrorKind, detail?: string) => new CellError(kind, detail)

export type CellValue = number | string | boolean | null | CellError
/** İşlev argümanı olarak aralık: satır satır değerler. */
export type Matrix = CellValue[][]
export type Arg = CellValue | Matrix

export function isError(value: unknown): value is CellError {
  return value instanceof CellError
}

export function isMatrix(value: Arg): value is Matrix {
  return Array.isArray(value)
}

/** Hata metnini (Türkçe ya da İngilizce) türüne çevirir. */
export function errorFromText(text: string): CellError | undefined {
  for (const [kind, names] of Object.entries(ERROR_CODES) as [ErrorKind, readonly string[]][]) {
    if (names.includes(text)) return err(kind)
  }
  return undefined
}

export interface NumberStyle {
  decimalComma: boolean
}

/** Sayıyı genel biçimde metne çevirir (15 anlamlı basamak, binlik ayraç yok). */
export function numberToText(n: number, style: NumberStyle): string {
  const text = String(Number(n.toPrecision(15)))
  return style.decimalComma ? text.replace('.', ',') : text
}

/** Metni sayıya çevirmeyi dener (dönüşmezse undefined). */
export function textToNumber(text: string, style: NumberStyle): number | undefined {
  const t = text.trim()
  const pattern = style.decimalComma
    ? /^[+-]?(\d+(,\d*)?|,\d+)([eE][+-]?\d+)?$/
    : /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/
  if (!pattern.test(t)) return undefined
  return Number(style.decimalComma ? t.replace(',', '.') : t)
}

export function toNumber(value: CellValue, style: NumberStyle): number | CellError {
  if (value === null) return 0
  if (typeof value === 'number') return value
  if (typeof value === 'boolean') return value ? 1 : 0
  if (isError(value)) return value
  return textToNumber(value, style) ?? err('value', `"${value}" sayıya çevrilemedi`)
}

export function toText(value: CellValue, style: NumberStyle): string | CellError {
  if (value === null) return ''
  if (typeof value === 'number') return numberToText(value, style)
  if (typeof value === 'boolean') return value ? 'DOĞRU' : 'YANLIŞ'
  if (isError(value)) return value
  return value
}

export function toBoolean(value: CellValue, style: NumberStyle): boolean | CellError {
  if (value === null) return false
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (isError(value)) return value
  const folded = value.trim().toLocaleUpperCase('tr-TR')
  if (folded === 'DOĞRU' || folded === 'TRUE') return true
  if (folded === 'YANLIŞ' || folded === 'FALSE') return false
  const n = textToNumber(value, style)
  return n === undefined ? err('value') : n !== 0
}

const collator = new Intl.Collator('tr', { sensitivity: 'accent' })

/** E-tablo karşılaştırması: sayı < metin < mantıksal; metinler Türkçe ve harf büyüklüğüne duyarsız. */
export function compareValues(a: CellValue, b: CellValue): number {
  const rank = (v: CellValue) => (typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : 2)
  const left = a === null ? (typeof b === 'string' ? '' : typeof b === 'boolean' ? false : 0) : a
  const right = b === null ? (typeof left === 'string' ? '' : typeof left === 'boolean' ? false : 0) : b
  if (isError(left) || isError(right)) return 0
  if (rank(left) !== rank(right)) return rank(left) - rank(right)
  if (typeof left === 'string') return collator.compare(left, right as string)
  return Number(left) - Number(right)
}
