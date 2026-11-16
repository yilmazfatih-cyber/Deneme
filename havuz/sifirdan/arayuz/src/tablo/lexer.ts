// Formül sözcük çözümleyicisi: "=TOPLA(A1:B3)*2" metnini belirteçlere (token) ayırır. Her belirteç metindeki
// konumunu taşır: başvuru kaydırma (kopyala-yapıştır) metni yeniden kurarken bu konumları kullanır.
// Ondalık virgül kipinde "1,5" bir sayıdır ve argüman ayracı ";" olur (Türkçe e-tablo alışkanlığı); nokta
// kipinde "1.5" sayıdır ve ayraç ",". ";" her iki kipte de ayraçtır.
// Ad mı başvuru mu? "LOG10(" bir işlev, "LOG10" bir hücredir: arkasından "(" gelen sözcük işlev adıdır.
// Genişletme: yeni bir işleç = `OPERATORS` listesine (uzun olan önce) + parser.ts'te bağlama gücü.
import { parseRef } from './address.ts'
import { ERROR_CODES } from './values.ts'

export type TokenType =
  'number' | 'string' | 'bool' | 'error' | 'ref' | 'func' | 'name' | 'op' | 'sep' | 'lparen' | 'rparen'

export interface Token {
  type: TokenType
  text: string
  start: number
  end: number
}

export interface LexOptions {
  decimalComma: boolean
}

export class FormulaSyntaxError extends Error {
  readonly position: number
  constructor(message: string, position: number) {
    super(`${message} (konum ${position + 1})`)
    this.name = 'FormulaSyntaxError'
    this.position = position
  }
}

const OPERATORS = ['<=', '>=', '<>', '+', '-', '*', '/', '^', '&', '%', '=', '<', '>', ':']
const ERROR_TEXTS = Object.values(ERROR_CODES)
  .flat()
  .sort((a, b) => b.length - a.length)
const WORD = /[\p{L}\p{N}_.$]/u
const BOOLEAN_WORDS = new Set(['DOĞRU', 'YANLIŞ', 'TRUE', 'FALSE'])

function readNumber(text: string, i: number, decimal: string): number {
  let j = i
  while (/\d/.test(text[j] ?? '')) j++
  if (text[j] === decimal && /\d/.test(text[j + 1] ?? '')) {
    j++
    while (/\d/.test(text[j] ?? '')) j++
  }
  if (/[eE]/.test(text[j] ?? '') && /^[+-]?\d/.test(text.slice(j + 1, j + 3))) {
    j += /[+-]/.test(text[j + 1] ?? '') ? 2 : 1
    while (/\d/.test(text[j] ?? '')) j++
  }
  return j
}

/** Formül metnini (başındaki "=" olmadan) belirteçlere ayırır. */
export function tokenize(text: string, options: LexOptions): Token[] {
  const tokens: Token[] = []
  const decimal = options.decimalComma ? ',' : '.'
  const push = (type: TokenType, start: number, end: number) =>
    tokens.push({ type, text: text.slice(start, end), start, end })
  let i = 0
  while (i < text.length) {
    const ch = text[i] as string
    if (/\s/.test(ch)) {
      i++
      continue
    }
    if (/\d/.test(ch) || (ch === decimal && /\d/.test(text[i + 1] ?? ''))) {
      const end = readNumber(text, ch === decimal ? i + 1 : i, decimal)
      push('number', i, ch === decimal ? Math.max(end, i + 2) : end)
      i = tokens[tokens.length - 1]!.end
      continue
    }
    if (ch === '"') {
      let j = i + 1
      while (j < text.length && !(text[j] === '"' && text[j + 1] !== '"')) j += text[j] === '"' ? 2 : 1
      if (j >= text.length) throw new FormulaSyntaxError('Kapanmamış tırnak', i)
      push('string', i, j + 1)
      i = j + 1
      continue
    }
    if (ch === '#') {
      const match = ERROR_TEXTS.find((code) => text.startsWith(code, i))
      if (!match) throw new FormulaSyntaxError('Bilinmeyen hata değeri', i)
      push('error', i, i + match.length)
      i += match.length
      continue
    }
    if (ch === '(' || ch === ')') {
      push(ch === '(' ? 'lparen' : 'rparen', i, i + 1)
      i++
      continue
    }
    if (ch === ';' || (ch === ',' && !options.decimalComma)) {
      push('sep', i, i + 1)
      i++
      continue
    }
    const op = OPERATORS.find((o) => text.startsWith(o, i))
    if (op) {
      push('op', i, i + op.length)
      i += op.length
      continue
    }
    if (WORD.test(ch)) {
      let j = i
      while (j < text.length && WORD.test(text[j] as string)) j++
      const word = text.slice(i, j)
      let k = j
      while (/\s/.test(text[k] ?? '')) k++
      if (text[k] === '(') push('func', i, j)
      else if (parseRef(word)) push('ref', i, j)
      else if (BOOLEAN_WORDS.has(word.toLocaleUpperCase('tr-TR'))) push('bool', i, j)
      else push('name', i, j)
      i = j
      continue
    }
    throw new FormulaSyntaxError(`Beklenmeyen karakter "${ch}"`, i)
  }
  return tokens
}
