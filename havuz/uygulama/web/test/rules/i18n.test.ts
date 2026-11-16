/**
 * @vitest-environment node
 * KURAL: arayüz metinleri yalnız src/i18n/tr.json'da durur.
 *  - Sözlükteki her anahtar kodda (dizgi olarak) kullanılır; kullanılmayan anahtar kalmaz.
 *  - `t()` dinamik kurulan anahtarla çağrılmaz (t(`tasks.${x}`) yerine açık eşlem: features/tasks/labels.ts).
 *  - Anahtar adları `alan.ad` biçimindedir; değerler boş değildir, `{yer_tutucu}` adları ASCII'dir.
 * Kodda kullanılan anahtarın sözlükte bulunmasını TypeScript zaten denetler (MessageKey türü).
 */
import { describe, expect, it } from 'vitest'
import { MESSAGES } from '../../src/i18n/index.ts'
import { lineOf, listFiles, parse, rel, SRC, ts, walk } from './source.ts'

const files = listFiles(SRC, ['.ts', '.tsx'])

function literalsIn(file: string): Set<string> {
  const found = new Set<string>()
  walk(parse(file), (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) found.add(node.text)
  })
  return found
}

describe('sözlük (kural testleri)', () => {
  it('sözlükteki her anahtar kodda kullanılıyor', () => {
    const used = new Set<string>()
    for (const file of files) for (const literal of literalsIn(file)) used.add(literal)
    const unused = Object.keys(MESSAGES).filter((key) => !used.has(key))
    expect(unused, "Kullanılmayan anahtarları tr.json'dan silin ya da kodda kullanın").toEqual([])
  })

  it('t() dinamik anahtarla çağrılmıyor', () => {
    const problems: string[] = []
    for (const file of files) {
      const source = parse(file)
      walk(source, (node) => {
        if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression) || node.expression.text !== 't') return
        const arg = node.arguments[0]
        if (!arg) return
        let dynamic = false
        walk(arg, (inner) => {
          const concat = ts.isBinaryExpression(inner) && inner.operatorToken.kind === ts.SyntaxKind.PlusToken
          if (ts.isTemplateExpression(inner) || ts.isAsExpression(inner) || concat) dynamic = true
        })
        if (dynamic) problems.push(`${rel(file)}:${lineOf(source, node)}`)
      })
    }
    expect(
      problems,
      'Anahtarı birleştirerek kurmayın; açık bir eşlem kullanın (bkz. features/tasks/labels.ts)',
    ).toEqual([])
  })

  it('anahtar adları ve değerler düzgün', () => {
    const bad = Object.entries(MESSAGES)
      .filter(([key, value]) => !/^[a-z][a-zA-Z]*(\.[a-zA-Z0-9]+)+$/.test(key) || value.trim() === '')
      .map(([key]) => key)
    expect(bad, 'Anahtar `alan.ad` biçiminde olmalı, değer boş olmamalı').toEqual([])
    const placeholders = Object.values(MESSAGES).flatMap((value) =>
      [...value.matchAll(/\{([^}]*)\}/g)].map((m) => m[1]),
    )
    expect(
      placeholders.filter((name) => !/^[a-zA-Z]+$/.test(name ?? '')),
      'Yer tutucu adları ASCII harf olmalı',
    ).toEqual([])
  })
})
