// ES modülünü üst düzey deyimlere ayırır ve her deyimi sınıflandırır: içe aktarma, dışa aktarma, bildirim
// (const/let/var/function/class), varsayılan dışa aktarma ve "diğer" (yan etkili kod). Her deyimin hangi
// üst düzey adları tanımladığı ve hangi adlara başvurduğu çıkarılır (ağaç silkeleme bunu kullanır).
// Deyim sınırı: derinlik 0'da ";" ya da otomatik noktalı virgül sezgisi (satır sonu + önceki belirteç ifadeyi
// bitiriyor + sonraki belirteç devam ettirmiyor). Prettier'ın noktalı virgülsüz biçimi bu kurala uyar.
// Başvuru çıkarımı bilerek "fazla"dır: `.ad` dışındaki her ad başvuru sayılır (gölgeleme izlenmez); yanlış
// pozitif yalnız fazladan kod tutar, eksik kod üretmez.
// Genişletme: dinamik `import()` için `kind: 'dynamic-import'` ekleyip çizgede tembel kenar olarak işleyin.
import {
  declarationEnd,
  declaredNames,
  genericEnd,
  isPunct,
  isWord,
  matching,
  parseSpecifiers,
  refsOf,
  unquote,
} from './statements.ts'
import { SyntaxErrorAt, tokenize, type Token } from './tokenizer.ts'

export interface ImportSpec {
  /** 'default', '*' (ad alanı) ya da dışa aktarılan ad. */
  imported: string
  local: string
}

export interface ExportSpec {
  local: string
  exported: string
}

interface Base {
  start: number
  end: number
  line: number
  /** Deyimin başvurduğu adlar (aşırı yaklaşım). */
  refs: Set<string>
}

export type Statement =
  | (Base & { kind: 'import'; source: string; specifiers: ImportSpec[] })
  | (Base & { kind: 'export-from'; source: string; specifiers: ExportSpec[]; star: boolean; namespace?: string })
  | (Base & { kind: 'export-names'; specifiers: ExportSpec[] })
  | (Base & { kind: 'declaration'; names: string[]; exported: boolean; bodyStart: number })
  | (Base & { kind: 'default'; name: string | undefined; bodyStart: number; isDeclaration: boolean })
  | (Base & { kind: 'other' })

export interface ParsedModule {
  source: string
  statements: Statement[]
}

const DECLARATION_WORDS = new Set(['function', 'class', 'const', 'let', 'var'])

function skipSemicolon(tokens: Token[], j: number): number {
  return isPunct(tokens[j], ';') ? j + 1 : j
}

/** `from 'x'` (+ isteğe bağlı `with { … }`) okur; kaynağı ve sonraki konumu döndürür. */
function readFrom(tokens: Token[], j: number): { source: string; next: number } {
  if (!isWord(tokens[j], 'from') || tokens[j + 1]?.type !== 'string')
    throw new SyntaxErrorAt('"from \'…\'" bekleniyordu', tokens[j]?.line ?? 0)
  let next = j + 2
  if ((isWord(tokens[next], 'with') || isWord(tokens[next], 'assert')) && isPunct(tokens[next + 1], '{'))
    next = matching(tokens, next + 1)
  return { source: unquote(tokens[j + 1] as Token), next: skipSemicolon(tokens, next) }
}

function parseImport(
  tokens: Token[],
  i: number,
): { statement: Omit<Extract<Statement, { kind: 'import' }>, keyof Base>; end: number } {
  let j = i + 1
  if (tokens[j]?.type === 'string')
    return {
      statement: { kind: 'import', source: unquote(tokens[j] as Token), specifiers: [] },
      end: skipSemicolon(tokens, j + 1),
    }
  const specifiers: ImportSpec[] = []
  if (tokens[j]?.type === 'ident' && !isWord(tokens[j], 'from')) {
    specifiers.push({ imported: 'default', local: (tokens[j] as Token).value })
    j++
    if (isPunct(tokens[j], ',')) j++
  }
  if (isPunct(tokens[j], '*')) {
    specifiers.push({ imported: '*', local: (tokens[j + 2] as Token).value })
    j += 3
  } else if (isPunct(tokens[j], '{')) {
    const parsed = parseSpecifiers(tokens, j)
    specifiers.push(...parsed.list.map((s) => ({ imported: s.from, local: s.to })))
    j = parsed.next
  }
  const from = readFrom(tokens, j)
  return { statement: { kind: 'import', source: from.source, specifiers }, end: from.next }
}

function declarationName(tokens: Token[], j: number): string | undefined {
  let k = j
  if (isWord(tokens[k], 'async')) k++
  k++ // function | class
  if (isPunct(tokens[k], '*')) k++
  const t = tokens[k]
  return t?.type === 'ident' && !isWord(t, 'extends') ? t.value : undefined
}

function isFunctionOrClass(tokens: Token[], j: number): boolean {
  return (
    isWord(tokens[j], 'function') ||
    isWord(tokens[j], 'class') ||
    (isWord(tokens[j], 'async') && isWord(tokens[j + 1], 'function'))
  )
}

/** Birleşim türünün her üyesinden ortak alanları çıkarır (Omit birleşime dağılmaz, bu dağılır). */
type StatementBody = Statement extends unknown
  ? Statement extends infer S
    ? S extends Statement
      ? Omit<S, keyof Base>
      : never
    : never
  : never
type Parsed = { statement: StatementBody; end: number; bodyFrom: number }

function parseDeclaration(tokens: Token[], j: number, exported: boolean): Parsed {
  const bodyStart = (tokens[j] as Token).start
  if (isFunctionOrClass(tokens, j)) {
    const end = declarationEnd(tokens, j)
    return {
      statement: { kind: 'declaration', names: [declarationName(tokens, j) as string], exported, bodyStart },
      end: skipSemicolon(tokens, end),
      bodyFrom: j,
    }
  }
  const end = genericEnd(tokens, j)
  const last = isPunct(tokens[end - 1], ';') ? end - 1 : end
  return {
    statement: { kind: 'declaration', names: declaredNames(tokens, j + 1, last), exported, bodyStart },
    end,
    bodyFrom: j,
  }
}

function parseExport(tokens: Token[], i: number): Parsed {
  const j = i + 1
  const t = tokens[j]
  if (isWord(t, 'default')) {
    const k = j + 1
    const bodyStart = (tokens[k] as Token).start
    if (isFunctionOrClass(tokens, k)) {
      const end = skipSemicolon(tokens, declarationEnd(tokens, k))
      return {
        statement: { kind: 'default', name: declarationName(tokens, k), bodyStart, isDeclaration: true },
        end,
        bodyFrom: k,
      }
    }
    return {
      statement: { kind: 'default', name: undefined, bodyStart, isDeclaration: false },
      end: genericEnd(tokens, k),
      bodyFrom: k,
    }
  }
  if (isPunct(t, '*')) {
    const namespace = isWord(tokens[j + 1], 'as') ? (tokens[j + 2] as Token).value : undefined
    const from = readFrom(tokens, namespace ? j + 3 : j + 1)
    return {
      statement: { kind: 'export-from', source: from.source, specifiers: [], star: !namespace, namespace },
      end: from.next,
      bodyFrom: from.next,
    }
  }
  if (isPunct(t, '{')) {
    const parsed = parseSpecifiers(tokens, j)
    const specifiers = parsed.list.map((s) => ({ local: s.from, exported: s.to }))
    if (isWord(tokens[parsed.next], 'from')) {
      const from = readFrom(tokens, parsed.next)
      return {
        statement: { kind: 'export-from', source: from.source, specifiers, star: false },
        end: from.next,
        bodyFrom: from.next,
      }
    }
    return { statement: { kind: 'export-names', specifiers }, end: skipSemicolon(tokens, parsed.next), bodyFrom: j }
  }
  if (t?.type === 'ident' && (DECLARATION_WORDS.has(t.value) || isFunctionOrClass(tokens, j)))
    return parseDeclaration(tokens, j, true)
  throw new SyntaxErrorAt(`Anlaşılmayan export biçimi: "export ${t?.value ?? ''}"`, t?.line ?? 0)
}

export function parseModule(source: string): ParsedModule {
  const tokens = tokenize(source)
  const statements: Statement[] = []
  let i = 0
  while (i < tokens.length) {
    const t = tokens[i] as Token
    if (isPunct(t, ';')) {
      i++
      continue
    }
    let parsed: Parsed
    if (isWord(t, 'import') && !isPunct(tokens[i + 1], '(') && !isPunct(tokens[i + 1], '.')) {
      const imported = parseImport(tokens, i)
      parsed = { ...imported, bodyFrom: imported.end }
    } else if (isWord(t, 'export')) parsed = parseExport(tokens, i)
    else if (t.type === 'ident' && (DECLARATION_WORDS.has(t.value) || isFunctionOrClass(tokens, i)))
      parsed = parseDeclaration(tokens, i, false)
    else parsed = { statement: { kind: 'other' }, end: genericEnd(tokens, i), bodyFrom: i }
    const last = tokens[parsed.end - 1] as Token
    let refs = refsOf(tokens, parsed.bodyFrom, parsed.end)
    if (parsed.statement.kind === 'export-names') refs = new Set(parsed.statement.specifiers.map((s) => s.local))
    statements.push({ ...parsed.statement, start: t.start, end: last.end, line: t.line, refs } as Statement)
    i = parsed.end
  }
  return { source, statements }
}
