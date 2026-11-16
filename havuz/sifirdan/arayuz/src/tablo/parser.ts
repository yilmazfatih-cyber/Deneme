// Formül ayrıştırıcı (Pratt yöntemi): belirteçlerden sözdizimi ağacı (AST) kurar. İşleç önceliği e-tablo
// kuralıdır (düşükten yükseğe): karşılaştırma < & < + - < * / < ^ < % < tekli eksi < aralık (:).
// Dikkat: e-tabloda tekli eksi üs almadan güçlüdür: =-2^2 → 4; ^ soldan birleşir: =2^3^2 → 64.
// İşlev adları "katlanır" (TOPLA = topla = Topla; MIN = MİN = min) ve kanonik ada çevrilir.
// Genişletme: yeni bir düğüm türü (ör. dizi sabiti {1;2}) için `Node`'a üye + `parsePrefix`'e dal.
import { parseRef, type CellRef } from './address.ts'
import { FormulaSyntaxError, tokenize, type LexOptions, type Token } from './lexer.ts'
import { errorFromText, textToNumber, type CellError } from './values.ts'

export type Node =
  | { type: 'number'; value: number }
  | { type: 'string'; value: string }
  | { type: 'boolean'; value: boolean }
  | { type: 'error'; error: CellError }
  | { type: 'ref'; ref: CellRef }
  | { type: 'range'; from: CellRef; to: CellRef }
  | { type: 'name'; name: string }
  | { type: 'unary'; op: '-' | '+'; operand: Node }
  | { type: 'percent'; operand: Node }
  | { type: 'binary'; op: string; left: Node; right: Node }
  | { type: 'call'; name: string; args: Node[] }

/** İşlev adını karşılaştırma için katlar: tr-TR büyütme + "İ"→"I" (MIN, MİN ve min aynı olur). */
export function foldName(name: string): string {
  return name.toLocaleUpperCase('tr-TR').replace(/İ/g, 'I')
}

const INFIX: Record<string, number> = {
  '=': 10,
  '<>': 10,
  '<': 10,
  '>': 10,
  '<=': 10,
  '>=': 10,
  '&': 20,
  '+': 30,
  '-': 30,
  '*': 40,
  '/': 40,
  '^': 50,
}
const PERCENT_POWER = 60
const PREFIX_POWER = 70

export function parseFormula(text: string, options: LexOptions): Node {
  const tokens = tokenize(text, options)
  let pos = 0
  const peek = (): Token | undefined => tokens[pos]
  const next = (): Token => {
    const token = tokens[pos++]
    if (!token) throw new FormulaSyntaxError('Formül yarım kaldı', text.length)
    return token
  }
  const expect = (type: Token['type']) => {
    const token = next()
    if (token.type !== type) throw new FormulaSyntaxError(`"${token.text}" beklenmiyordu`, token.start)
    return token
  }

  const parsePrefix = (): Node => {
    const token = next()
    switch (token.type) {
      case 'number':
        return { type: 'number', value: textToNumber(token.text, options) ?? NaN }
      case 'string':
        return { type: 'string', value: token.text.slice(1, -1).replace(/""/g, '"') }
      case 'bool':
        return { type: 'boolean', value: ['DOĞRU', 'TRUE'].includes(token.text.toLocaleUpperCase('tr-TR')) }
      case 'error':
        return { type: 'error', error: errorFromText(token.text) as CellError }
      case 'ref':
        return { type: 'ref', ref: parseRef(token.text) as CellRef }
      case 'name':
        return { type: 'name', name: token.text }
      case 'lparen': {
        const inner = parseExpression(0)
        expect('rparen')
        return inner
      }
      case 'func': {
        expect('lparen')
        const args: Node[] = []
        if (peek()?.type !== 'rparen') {
          do args.push(parseExpression(0))
          while (peek()?.type === 'sep' && next())
        }
        expect('rparen')
        return { type: 'call', name: foldName(token.text), args }
      }
      case 'op':
        if (token.text === '-' || token.text === '+')
          return { type: 'unary', op: token.text, operand: parseExpression(PREFIX_POWER) }
        throw new FormulaSyntaxError(`"${token.text}" burada kullanılamaz`, token.start)
      case 'sep':
      case 'rparen':
        throw new FormulaSyntaxError(`"${token.text}" beklenmiyordu`, token.start)
    }
  }

  const parseExpression = (minPower: number): Node => {
    let left = parsePrefix()
    for (;;) {
      const token = peek()
      if (token?.type !== 'op') break
      if (token.text === ':') {
        next()
        const right = parsePrefix()
        if (left.type !== 'ref' || right.type !== 'ref')
          throw new FormulaSyntaxError('Aralık iki hücre arasında olmalı (ör. A1:B3)', token.start)
        left = { type: 'range', from: left.ref, to: right.ref }
        continue
      }
      if (token.text === '%') {
        if (PERCENT_POWER < minPower) break
        next()
        left = { type: 'percent', operand: left }
        continue
      }
      const power = INFIX[token.text]
      if (power === undefined || power <= minPower) break
      next()
      left = { type: 'binary', op: token.text, left, right: parseExpression(power) }
    }
    return left
  }

  const ast = parseExpression(0)
  const extra = peek()
  if (extra) throw new FormulaSyntaxError(`Fazladan "${extra.text}"`, extra.start)
  return ast
}

/** Formülün okuduğu tüm hücre ve aralıklar (bağımlılık çizgesi için). */
export function collectRefs(node: Node, out: (CellRef | { from: CellRef; to: CellRef })[] = []): typeof out {
  switch (node.type) {
    case 'ref':
      out.push(node.ref)
      break
    case 'range':
      out.push({ from: node.from, to: node.to })
      break
    case 'unary':
    case 'percent':
      collectRefs(node.operand, out)
      break
    case 'binary':
      collectRefs(node.left, out)
      collectRefs(node.right, out)
      break
    case 'call':
      for (const arg of node.args) collectRefs(arg, out)
      break
    case 'number':
    case 'string':
    case 'boolean':
    case 'error':
    case 'name':
      break
  }
  return out
}
