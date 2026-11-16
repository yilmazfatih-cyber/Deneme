// Deyim düzeyi yardımcılar (module_parser.ts kullanır): ayraç derinliği, deyim sonu sezgisi (noktalı virgül ya
// da satır sonu), function/class gövdesinin sonu, başvurulan adlar, bağlama örüntüsündeki adlar, { a as b }
// listeleri. Hepsi belirteç dizisi + konum alır; yan etkisizdir.
// Genişletme: yeni bir sözdizimi (ör. dekoratör `@`) deyim sınırını etkiliyorsa `genericEnd`'e kural ekleyin.
import { SyntaxErrorAt, type Token } from './tokenizer.ts'

const CONTINUES = new Set([
  '.',
  '?.',
  '(',
  '[',
  ',',
  '=',
  '+',
  '-',
  '*',
  '/',
  '%',
  '**',
  '&&',
  '||',
  '??',
  '?',
  ':',
  '=>',
  '===',
  '!==',
  '==',
  '!=',
  '<',
  '>',
  '<=',
  '>=',
  '&',
  '|',
  '^',
  '<<',
  '>>',
  '>>>',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '&=',
  '|=',
  '^=',
  '**=',
  '<<=',
  '>>=',
  '>>>=',
  '&&=',
  '||=',
  '??=',
  'in',
  'instanceof',
])
const OPEN = new Set(['(', '[', '{'])
const CLOSE = new Set([')', ']', '}'])

export const isPunct = (t: Token | undefined, value: string) => t?.type === 'punct' && t.value === value
export const isWord = (t: Token | undefined, value: string) => t?.type === 'ident' && t.value === value
export const unquote = (t: Token) => t.value.slice(1, -1)

export function depthDelta(t: Token): number {
  if (t.type === 'punct') return OPEN.has(t.value) ? 1 : CLOSE.has(t.value) ? -1 : 0
  if (t.type === 'template') return (t.value.startsWith('}') ? -1 : 0) + (t.value.endsWith('${') ? 1 : 0)
  return 0
}

export function endsExpression(t: Token): boolean {
  if (t.type === 'punct') return [')', ']', '}', '++', '--'].includes(t.value)
  return !(
    t.type === 'ident' &&
    ['return', 'typeof', 'new', 'delete', 'void', 'await', 'yield', 'throw', 'extends'].includes(t.value)
  )
}

/** Genel deyim sonu: derinlik 0'da ";" ya da satır sonu sezgisi. */
export function genericEnd(tokens: Token[], from: number): number {
  let depth = 0
  for (let j = from; j < tokens.length; j++) {
    const t = tokens[j] as Token
    if (
      j > from &&
      depth === 0 &&
      t.newlineBefore &&
      endsExpression(tokens[j - 1] as Token) &&
      !CONTINUES.has(t.value) &&
      t.type !== 'template'
    )
      return j
    depth += depthDelta(t)
    if (depth === 0 && isPunct(t, ';')) return j + 1
    if (depth < 0) throw new SyntaxErrorAt('Fazladan kapanış ayracı', t.line)
  }
  return tokens.length
}

/** `from` konumundaki açılış ayracının kapanışının bir sonrası. */
export function matching(tokens: Token[], from: number): number {
  let depth = 0
  for (let j = from; j < tokens.length; j++) {
    depth += depthDelta(tokens[j] as Token)
    if (depth === 0) return j + 1
  }
  throw new SyntaxErrorAt('Kapanmamış ayraç', tokens[from]?.line ?? 0)
}

/** function/class bildiriminin sonu (gövdenin kapanış ayracı). */
export function declarationEnd(tokens: Token[], from: number): number {
  let j = from
  if (isWord(tokens[j], 'async')) j++
  if (isWord(tokens[j], 'class')) {
    let depth = 0
    for (j++; j < tokens.length; j++) {
      const t = tokens[j] as Token
      if (depth === 0 && isPunct(t, '{')) return matching(tokens, j)
      depth += depthDelta(t)
    }
  } else {
    while (j < tokens.length && !isPunct(tokens[j], '(')) j++
    j = matching(tokens, j)
    if (isPunct(tokens[j], '{')) return matching(tokens, j)
  }
  throw new SyntaxErrorAt('Bildirim gövdesi bulunamadı', tokens[from]?.line ?? 0)
}

export function refsOf(tokens: Token[], from: number, to: number): Set<string> {
  const refs = new Set<string>()
  for (let j = from; j < to; j++) {
    const t = tokens[j] as Token
    if (t.type !== 'ident') continue
    const prev = tokens[j - 1]
    if (prev && prev.type === 'punct' && (prev.value === '.' || prev.value === '?.')) continue
    refs.add(t.value)
  }
  return refs
}

/** Bağlama örüntüsündeki adlar: `a`, `{ a, b: c, d = 1, ...e }`, `[x, , y]`. */
export function bindingNames(tokens: Token[], from: number, to: number): string[] {
  const names: string[] = []
  let skipDepth = -1
  let depth = 0
  for (let j = from; j < to; j++) {
    const t = tokens[j] as Token
    if (skipDepth >= 0) {
      if (depth === skipDepth && (isPunct(t, ',') || isPunct(t, '}') || isPunct(t, ']'))) skipDepth = -1
      else {
        depth += depthDelta(t)
        continue
      }
    }
    if (isPunct(t, '=')) {
      skipDepth = depth
      continue
    }
    depth += depthDelta(t)
    if (t.type === 'ident' && !isPunct(tokens[j + 1], ':')) names.push(t.value)
  }
  return names
}

/** const/let/var bildirimindeki tüm adlar (virgülle ayrılmış çoklu bildiriciler dahil). */
export function declaredNames(tokens: Token[], from: number, to: number): string[] {
  const names: string[] = []
  let depth = 0
  let start = from
  let inInit = false
  for (let j = from; j <= to; j++) {
    const t = tokens[j]
    if (j === to || (depth === 0 && isPunct(t, ','))) {
      if (!inInit) names.push(...bindingNames(tokens, start, j))
      start = j + 1
      inInit = false
      continue
    }
    if (depth === 0 && isPunct(t, '=') && !inInit) {
      names.push(...bindingNames(tokens, start, j))
      inInit = true
    }
    depth += depthDelta(t as Token)
  }
  return names
}

export function parseSpecifiers(tokens: Token[], open: number): { list: { from: string; to: string }[]; next: number } {
  const close = matching(tokens, open)
  const list: { from: string; to: string }[] = []
  for (let j = open + 1; j < close - 1; j++) {
    const t = tokens[j] as Token
    if (isPunct(t, ',')) continue
    const name = t.type === 'string' ? unquote(t) : t.value
    if (isWord(tokens[j + 1], 'as')) {
      const alias = tokens[j + 2] as Token
      list.push({ from: name, to: alias.type === 'string' ? unquote(alias) : alias.value })
      j += 2
    } else list.push({ from: name, to: name })
  }
  return { list, next: close }
}
