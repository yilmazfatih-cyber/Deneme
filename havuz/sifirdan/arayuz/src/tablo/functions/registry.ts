// İşlev kaydı ve ortak yardımcılar. Her işlev bir `FunctionDef`'tir: adları (önce Türkçe, sonra İngilizce),
// argüman sayısı sınırları ve gövde. Argümanlar tembel "thunk"tır: EĞER ve EĞERHATA yalnız gereken dalı
// hesaplar. Gövdeler kısa kalsın diye hata değerleri `Abort` istisnasıyla taşınır; evaluate.ts onu yakalayıp
// hücreye hata değeri olarak yazar.
// Genişletme: YENİ İŞLEV → ilgili dosyadaki (math.ts, text.ts…) diziye bir `FunctionDef` ekleyin; ad çakışması
// test/tablo/functions.test.ts'teki kural testiyle yakalanır.
import {
  err,
  isError,
  isMatrix,
  toBoolean,
  toNumber,
  toText,
  type Arg,
  type CellError,
  type CellValue,
  type Matrix,
  type NumberStyle,
} from '../values.ts'

export interface FnContext {
  style: NumberStyle
  now: () => Date
}

export type Thunk = () => Arg

export interface FunctionDef {
  names: readonly string[]
  min: number
  max: number
  fn: (args: Thunk[], ctx: FnContext) => CellValue
}

/** Hata değerini işlev gövdesinden dışarı taşır (evaluate.ts yakalar; kullanıcı hiç görmez). */
export class Abort extends Error {
  readonly error: CellError
  constructor(error: CellError) {
    super(error.code)
    this.name = 'Abort'
    this.error = error
  }
}

export function fail(kind: Parameters<typeof err>[0], detail?: string): never {
  throw new Abort(err(kind, detail))
}

export function check<T>(value: T | CellError): T {
  if (isError(value)) throw new Abort(value)
  return value
}

/** Tek değer bekleyen yerde: 1×1 aralık kabul edilir, daha büyüğü #DEĞER!. */
export function scalar(arg: Arg): CellValue {
  if (!isMatrix(arg)) return arg
  if (arg.length === 1 && arg[0]?.length === 1) return arg[0][0] ?? null
  return err('value', 'tek hücre bekleniyordu')
}

export function asMatrix(arg: Arg): Matrix {
  return isMatrix(arg) ? arg : [[arg]]
}

export const num = (thunk: Thunk | undefined, ctx: FnContext, fallback?: number): number =>
  thunk === undefined && fallback !== undefined
    ? fallback
    : check(toNumber(check(scalar(thunk?.() ?? null)), ctx.style))
export const text = (thunk: Thunk | undefined, ctx: FnContext): string =>
  check(toText(check(scalar(thunk?.() ?? null)), ctx.style))
export const bool = (thunk: Thunk | undefined, ctx: FnContext, fallback?: boolean): boolean =>
  thunk === undefined && fallback !== undefined
    ? fallback
    : check(toBoolean(check(scalar(thunk?.() ?? null)), ctx.style))

/**
 * TOPLA gibi işlevlerin sayı toplama kuralı: aralıktaki yalnız sayılar alınır (metin/boş/mantıksal atlanır);
 * doğrudan yazılan argümanlar dönüştürülür ("5" → 5, DOĞRU → 1). Her iki durumda da hata yayılır.
 */
export function collectNumbers(args: Thunk[], ctx: FnContext): number[] {
  const out: number[] = []
  for (const thunk of args) {
    const value = thunk()
    if (isMatrix(value)) {
      for (const row of value) for (const cell of row) if (typeof check(cell) === 'number') out.push(cell as number)
    } else if (value !== null) out.push(check(toNumber(check(value), ctx.style)))
  }
  return out
}

/** Aralıktaki tüm değerler (satır satır), tek değerler de dahil. */
export function collectValues(args: Thunk[]): CellValue[] {
  return args.flatMap((thunk) => asMatrix(thunk()).flat())
}

/** Sonuç sayısı sonlu değilse #SAYI!. */
export function finite(n: number): number {
  if (!Number.isFinite(n)) fail('num')
  return n
}
