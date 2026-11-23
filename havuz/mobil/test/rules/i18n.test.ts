/**
 * KURAL: arayüz metinleri yalnız src/i18n/tr.json'da durur.
 *  - Sözlükteki her anahtar kodda (dizgi olarak) kullanılır; kullanılmayan anahtar kalmaz.
 *  - Kodda `t('…')` ile çağrılan her anahtar sözlükte var (TypeScript de denetler; bu test iletisi yol gösterir).
 *  - `t()` dinamik kurulan anahtarla çağrılmaz (t(`tasks.${x}`) yerine açık eşlem: features/tasks/labels.ts).
 *  - Anahtar adları `alan.ad` biçimindedir; değerler boş değildir; `{yer_tutucu}` adları ASCII'dir.
 */
import { MESSAGES } from '../../src/i18n/index.ts'
import { expectNone, lineOf, listFiles, parse, rel, SRC, ts, walk } from './source.ts'

const files = listFiles(SRC, ['.ts', '.tsx'])

function literalsIn(file: string): Set<string> {
  const found = new Set<string>()
  walk(parse(file), (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) found.add(node.text)
  })
  return found
}

function tCalls(file: string): { arg: ts.Expression | undefined; line: number; source: ts.SourceFile }[] {
  const source = parse(file)
  const calls: { arg: ts.Expression | undefined; line: number; source: ts.SourceFile }[] = []
  walk(source, (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 't') {
      calls.push({ arg: node.arguments[0], line: lineOf(source, node), source })
    }
  })
  return calls
}

describe('sözlük (kural testleri)', () => {
  it('sözlükteki her anahtar kodda kullanılıyor', () => {
    const used = new Set<string>()
    for (const file of files) for (const literal of literalsIn(file)) used.add(literal)
    const unused = Object.keys(MESSAGES).filter((key) => !used.has(key))
    expectNone(unused, "Kullanılmayan anahtarları src/i18n/tr.json'dan silin ya da kodda kullanın:")
  })

  it("t('…') ile kullanılan her anahtar sözlükte var; anahtar dinamik kurulmuyor", () => {
    const missing: string[] = []
    const dynamic: string[] = []
    for (const file of files) {
      for (const call of tCalls(file)) {
        if (!call.arg) continue
        if (ts.isStringLiteral(call.arg)) {
          if (!Object.hasOwn(MESSAGES, call.arg.text)) missing.push(`${rel(file)}:${call.line} ${call.arg.text}`)
          continue
        }
        let isDynamic = false
        walk(call.arg, (inner) => {
          const concat = ts.isBinaryExpression(inner) && inner.operatorToken.kind === ts.SyntaxKind.PlusToken
          if (ts.isTemplateExpression(inner) || ts.isAsExpression(inner) || concat) isDynamic = true
        })
        if (isDynamic) dynamic.push(`${rel(file)}:${call.line}`)
      }
    }
    expectNone(missing, "Eksik anahtarı src/i18n/tr.json'a ekleyin:")
    expectNone(dynamic, 'Anahtarı birleştirerek kurmayın; açık eşlem kullanın (örnek: features/tasks/labels.ts):')
  })

  it('anahtar adları ve değerler düzgün', () => {
    const bad = Object.entries(MESSAGES)
      .filter(([key, value]) => !/^[a-z][a-zA-Z]*(\.[a-zA-Z0-9]+)+$/.test(key) || value.trim() === '')
      .map(([key]) => key)
    expectNone(bad, 'Anahtar `alan.ad` biçiminde olmalı, değer boş olmamalı:')
    const placeholders = Object.values(MESSAGES).flatMap((value) =>
      [...value.matchAll(/\{([^}]*)\}/g)].map((match) => match[1] ?? ''),
    )
    expectNone(
      placeholders.filter((name) => !/^[a-zA-Z]+$/.test(name)),
      'Yer tutucu adları yalnız ASCII harf olmalı ({ad}):',
    )
  })
})
