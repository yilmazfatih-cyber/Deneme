/**
 * KURAL: büyük/küçük harf dönüşümü Türkçe kuralla yapılır. Düz `toUpperCase()` "i"yi "I" yapar (doğrusu "İ"),
 * `toLowerCase()` "I"yı "i" yapar (doğrusu "ı"). `upperTr`/`lowerTr`/`foldTr` (@uygulama/shared) kullanılır.
 * Lint de yakalar (eslint.config.mjs); bu test lint atlanırsa diye ikinci emniyettir. Tek bilinçli istisna:
 * e-posta küçültme (shared/api.ts, ASCII) — shared denetlenmez.
 */
import { join } from 'node:path'
import { expectNone, lineOf, listFiles, parse, parseText, rel, ROOT, SRC, ts, walk } from './source.ts'

const FORBIDDEN = new Set(['toUpperCase', 'toLowerCase'])

function findPlainCasing(source: ts.SourceFile, label: string): string[] {
  const problems: string[] = []
  walk(source, (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      FORBIDDEN.has(node.expression.name.text)
    ) {
      problems.push(`${label}:${lineOf(source, node)} ${node.expression.name.text}()`)
    }
  })
  return problems
}

describe('Türkçe büyük/küçük harf (kural testi)', () => {
  it('kaynakta ve testlerde düz toUpperCase/toLowerCase yok', () => {
    const files = [...listFiles(SRC, ['.ts', '.tsx']), ...listFiles(join(ROOT, 'scripts'), ['.ts'])]
    const problems = files.flatMap((file) => findPlainCasing(parse(file), rel(file)))
    expectNone(problems, 'upperTr / lowerTr / foldTr kullanın (@uygulama/shared):')
  })

  it('denetim gerçekten yakalıyor', () => {
    const sample = "const a = ad.toUpperCase()\nconst b = upperTr(ad)\nconst c = ad.toLocaleLowerCase('tr-TR')"
    expect(findPlainCasing(parseText('ornek.ts', sample), 'ornek.ts')).toEqual(['ornek.ts:1 toUpperCase()'])
  })
})
