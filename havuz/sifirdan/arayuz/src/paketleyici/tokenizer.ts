// JavaScript sözcük çözümleyicisi (modül düzeyi çözümleme için yeterli olan kadarı). Zor kısımlar:
// - Dizgi, şablon dizgisi (`...${ ifade }...` iç içe), yorum ve düzenli ifade içindeki "import" gibi sözcükler
//   belirteç sayılmamalı. Şablondaki `${ }` içi normal kod gibi belirteçlenir (içindeki adlar da başvurudur).
// - "/" bölme mi düzenli ifade mi? Önceki anlamlı belirteç bir değer bitiriyorsa (ad, sayı, `)`, `]`) bölme,
//   aksi hâlde düzenli ifadedir. `return /x/` gibi anahtar sözcüklerden sonra da düzenli ifadedir.
// Her belirteç başlangıç/bitiş konumu ve satırını taşır (kaynak haritası ve metin dilimleme için).
// Genişletme: JSX desteği istenirse `<` için ayrı bir kip gerekir; bu çözümleyici JSX'i tanımaz (Sınırlar).

export type TokenType = 'ident' | 'punct' | 'string' | 'template' | 'number' | 'regex' | 'private'

export interface Token {
  type: TokenType
  value: string
  start: number
  end: number
  line: number
  /** Belirteçten önce satır sonu var mı? (otomatik noktalı virgül sezgisi için) */
  newlineBefore: boolean
}

const PUNCTUATORS = [
  '>>>=',
  '...',
  '===',
  '!==',
  '**=',
  '<<=',
  '>>=',
  '>>>',
  '&&=',
  '||=',
  '??=',
  '=>',
  '==',
  '!=',
  '<=',
  '>=',
  '&&',
  '||',
  '??',
  '?.',
  '++',
  '--',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '&=',
  '|=',
  '^=',
  '**',
  '<<',
  '>>',
  '{',
  '}',
  '(',
  ')',
  '[',
  ']',
  ';',
  ',',
  '<',
  '>',
  '+',
  '-',
  '*',
  '/',
  '%',
  '&',
  '|',
  '^',
  '!',
  '~',
  '?',
  ':',
  '=',
  '.',
  '@',
]
const REGEX_AFTER_WORDS = new Set([
  'return',
  'typeof',
  'instanceof',
  'in',
  'of',
  'new',
  'delete',
  'void',
  'throw',
  'case',
  'do',
  'else',
  'yield',
  'await',
])
const ID_START = /[\p{L}_$]/u
const ID_PART = /[\p{L}\p{N}_$‌‍]/u

export class SyntaxErrorAt extends Error {
  readonly line: number
  constructor(message: string, line: number) {
    super(`${message} (satır ${line})`)
    this.name = 'SyntaxErrorAt'
    this.line = line
  }
}

function regexAllowed(previous: Token | undefined): boolean {
  if (!previous) return true
  if (previous.type === 'ident') return REGEX_AFTER_WORDS.has(previous.value)
  // '}' sonrası çoğunlukla yeni bir deyimdir (blok sonu): düzenli ifadeye izin verilir.
  if (previous.type === 'punct') return ![')', ']', '++', '--'].includes(previous.value)
  return false
}

export function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  const templateDepths: number[] = []
  let braceDepth = 0
  let i = source.startsWith('#!') ? source.indexOf('\n') : 0
  if (i < 0) i = source.length
  let line = 1
  let newline = false
  const push = (type: TokenType, start: number, end: number) => {
    tokens.push({ type, value: source.slice(start, end), start, end, line, newlineBefore: newline })
    for (let k = start; k < end; k++) if (source[k] === '\n') line++
    newline = false
  }
  const readTemplate = (start: number) => {
    let j = start
    while (j < source.length && source[j] !== '`' && !(source[j] === '$' && source[j + 1] === '{'))
      j += source[j] === '\\' ? 2 : 1
    if (j >= source.length) throw new SyntaxErrorAt('Kapanmamış şablon dizgisi', line)
    if (source[j] === '`') return j + 1
    templateDepths.push(braceDepth)
    return j + 2
  }
  while (i < source.length) {
    const ch = source[i] as string
    if (ch === '\n') {
      newline = true
      line++
      i++
    } else if (/\s/.test(ch)) i++
    else if (source.startsWith('//', i)) {
      const end = source.indexOf('\n', i)
      i = end === -1 ? source.length : end
    } else if (source.startsWith('/*', i)) {
      const end = source.indexOf('*/', i + 2)
      if (end === -1) throw new SyntaxErrorAt('Kapanmamış yorum', line)
      for (let k = i; k < end; k++) {
        if (source[k] !== '\n') continue
        line++
        newline = true
      }
      i = end + 2
    } else if (ch === '"' || ch === "'") {
      let j = i + 1
      while (j < source.length && source[j] !== ch && source[j] !== '\n') j += source[j] === '\\' ? 2 : 1
      if (source[j] !== ch) throw new SyntaxErrorAt('Kapanmamış dizgi', line)
      push('string', i, j + 1)
      i = j + 1
    } else if (ch === '`') {
      const end = readTemplate(i + 1)
      push('template', i, end)
      i = end
    } else if (ch === '}' && templateDepths.length > 0 && templateDepths[templateDepths.length - 1] === braceDepth) {
      templateDepths.pop()
      const end = readTemplate(i + 1)
      push('template', i, end)
      i = end
    } else if (/\d/.test(ch) || (ch === '.' && /\d/.test(source[i + 1] ?? ''))) {
      const m = /^(0[xXoObB][\da-fA-F_]+n?|(\d[\d_]*)?\.?[\d_]*([eE][+-]?\d+)?n?)/.exec(
        source.slice(i),
      ) as RegExpExecArray
      push('number', i, i + Math.max(1, m[0].length))
      i += Math.max(1, m[0].length)
    } else if (ID_START.test(ch) || (ch === '#' && ID_START.test(source[i + 1] ?? ''))) {
      let j = i + 1
      while (j < source.length && ID_PART.test(source[j] as string)) j++
      push(ch === '#' ? 'private' : 'ident', i, j)
      i = j
    } else if (ch === '/' && regexAllowed(tokens[tokens.length - 1])) {
      let j = i + 1
      let inClass = false
      while (j < source.length && (inClass || source[j] !== '/')) {
        if (source[j] === '\n') throw new SyntaxErrorAt('Kapanmamış düzenli ifade', line)
        if (source[j] === '[') inClass = true
        else if (source[j] === ']') inClass = false
        j += source[j] === '\\' ? 2 : 1
      }
      j++
      while (j < source.length && /[a-z]/.test(source[j] as string)) j++
      push('regex', i, j)
      i = j
    } else {
      const p = PUNCTUATORS.find((candidate) => source.startsWith(candidate, i))
      if (!p) throw new SyntaxErrorAt(`Beklenmeyen karakter "${ch}"`, line)
      if (p === '{') braceDepth++
      else if (p === '}') braceDepth--
      push('punct', i, i + p.length)
      i += p.length
    }
  }
  return tokens
}
