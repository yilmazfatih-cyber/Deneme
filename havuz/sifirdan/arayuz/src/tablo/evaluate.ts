// Formül değerlendirici: sözdizimi ağacını, hücre değerlerini okuyan bir bağlamla hesaplar.
// Aritmetik işlemler sayıya, & metne çevirir; karşılaştırmalar Türkçe harmanlamayla yapılır. İşlenenlerden
// biri hataysa (soldaki önce) o hata yayılır. Sınır dışı başvuru #BAŞV!, bilinmeyen ad #AD?, sıfıra bölme
// #BÖL/0!, sonlu olmayan sonuç #SAYI! verir. Hücreye aralık yazılamaz (=A1:B2 → #DEĞER!).
// Genişletme: yeni bir ikili işleç = parser.ts'te öncelik + burada `binary` içinde bir dal.
import { lookupFunction } from './functions/index.ts'
import { Abort, scalar, type FnContext } from './functions/registry.ts'
import type { Node } from './parser.ts'
import { compareValues, err, isError, isMatrix, toNumber, toText, type Arg, type CellValue } from './values.ts'

export interface EvalContext extends FnContext {
  getCell(row: number, col: number): CellValue
  rows: number
  cols: number
}

function inBounds(ctx: EvalContext, row: number, col: number): boolean {
  return row >= 0 && col >= 0 && row < ctx.rows && col < ctx.cols
}

function arithmetic(op: string, a: number, b: number): CellValue {
  let result: number
  switch (op) {
    case '+':
      result = a + b
      break
    case '-':
      result = a - b
      break
    case '*':
      result = a * b
      break
    case '/':
      if (b === 0) return err('div0')
      result = a / b
      break
    default:
      if (a === 0 && b === 0) return err('num')
      result = a ** b
  }
  return Number.isFinite(result) ? result : err('num')
}

function binary(op: string, leftArg: Arg, rightArg: Arg, ctx: EvalContext): CellValue {
  const left = scalar(leftArg)
  const right = scalar(rightArg)
  if (isError(left)) return left
  if (isError(right)) return right
  if (op === '&') {
    const a = toText(left, ctx.style)
    const b = toText(right, ctx.style)
    return isError(a) ? a : isError(b) ? b : a + b
  }
  if (['=', '<>', '<', '>', '<=', '>='].includes(op)) {
    const c = compareValues(left, right)
    return op === '='
      ? c === 0
      : op === '<>'
        ? c !== 0
        : op === '<'
          ? c < 0
          : op === '>'
            ? c > 0
            : op === '<='
              ? c <= 0
              : c >= 0
  }
  const a = toNumber(left, ctx.style)
  const b = toNumber(right, ctx.style)
  if (isError(a)) return a
  if (isError(b)) return b
  return arithmetic(op, a, b)
}

export function evaluate(node: Node, ctx: EvalContext): Arg {
  switch (node.type) {
    case 'number':
      return Number.isFinite(node.value) ? node.value : err('num')
    case 'string':
      return node.value
    case 'boolean':
      return node.value
    case 'error':
      return node.error
    case 'name':
      return err('name', `"${node.name}" tanınmıyor`)
    case 'ref':
      return inBounds(ctx, node.ref.row, node.ref.col) ? ctx.getCell(node.ref.row, node.ref.col) : err('ref')
    case 'range': {
      const top = Math.min(node.from.row, node.to.row)
      const bottom = Math.max(node.from.row, node.to.row)
      const left = Math.min(node.from.col, node.to.col)
      const right = Math.max(node.from.col, node.to.col)
      if (!inBounds(ctx, top, left) || !inBounds(ctx, bottom, right)) return err('ref')
      const rows: CellValue[][] = []
      for (let r = top; r <= bottom; r++) {
        const row: CellValue[] = []
        for (let c = left; c <= right; c++) row.push(ctx.getCell(r, c))
        rows.push(row)
      }
      return rows
    }
    case 'unary':
    case 'percent': {
      const value = scalar(evaluate(node.operand, ctx))
      const n = toNumber(value, ctx.style)
      if (isError(n)) return n
      return node.type === 'percent' ? n / 100 : node.op === '-' ? -n : n
    }
    case 'binary':
      return binary(node.op, evaluate(node.left, ctx), evaluate(node.right, ctx), ctx)
    case 'call': {
      const def = lookupFunction(node.name)
      if (!def) return err('name', `"${node.name}" adlı işlev yok`)
      if (node.args.length < def.min || node.args.length > def.max) {
        return err('value', `${def.names[0]} ${def.min}–${def.max} argüman alır`)
      }
      try {
        return def.fn(
          node.args.map((arg) => () => evaluate(arg, ctx)),
          ctx,
        )
      } catch (error) {
        if (error instanceof Abort) return error.error
        throw error
      }
    }
  }
}

/** Hücre için değerlendirme: sonuç tek bir değer olmalıdır. */
export function evaluateCell(node: Node, ctx: EvalContext): CellValue {
  const result = evaluate(node, ctx)
  if (isMatrix(result)) return scalar(result)
  return result
}
