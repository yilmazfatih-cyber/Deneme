/**
 * @vitest-environment node
 * KURAL: .tsx dosyalarında gömülü Türkçe arayüz metni yok (sezgisel denetim). Yakalananlar:
 *   - JSX içindeki düz metin: <p>Merhaba</p>
 *   - metin taşıyan özniteliklerde düz dizgi: aria-label="Kapat", placeholder="Ara", title="…"
 *   - Türkçe'ye özgü harf (ç ğ ı ö ş ü İ…) içeren her dizgi
 * Çözüm: metni src/i18n/tr.json'a ekleyin ve `t('anahtar')` ile okuyun.
 * Muaf: features/catalog (yalnız geliştirmede görünen bileşen adları), fırlatılan Error ve console iletileri.
 */
import { describe, expect, it } from 'vitest'
import { lineOf, listFiles, parse, rel, SRC, ts, walk } from './source.ts'

const TEXT_ATTRIBUTES = new Set([
  'aria-label',
  'aria-description',
  'title',
  'placeholder',
  'alt',
  'label',
  'description',
  'message',
  'hint',
  'error',
  'confirmLabel',
  'cancelLabel',
])

const TURKISH = /[çğıöşüÇĞİÖŞÜ]/
const LETTER = /\p{L}/u

/** Geliştiriciye dönük iletiler (fırlatılan Error, console) arayüz metni değildir. */
function isDeveloperMessage(node: ts.Node): boolean {
  const parent = node.parent
  if (ts.isNewExpression(parent) && ts.isIdentifier(parent.expression) && parent.expression.text.endsWith('Error'))
    return true
  return (
    ts.isCallExpression(parent) &&
    ts.isPropertyAccessExpression(parent.expression) &&
    ts.isIdentifier(parent.expression.expression) &&
    parent.expression.expression.text === 'console'
  )
}

/** Bir kaynak dosyadaki gömülü metinleri bulur ("dosya:satır açıklama" listesi). */
function findHardcodedText(source: ts.SourceFile, label: string): string[] {
  const problems: string[] = []
  walk(source, (node) => {
    const where = () => `${label}:${lineOf(source, node)}`
    if (ts.isJsxText(node)) {
      const text = node.text.trim()
      if (LETTER.test(text)) problems.push(`${where()} JSX metni: "${text.slice(0, 40)}"`)
      return
    }
    if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer)) {
      const name = node.name.getText(source)
      if (TEXT_ATTRIBUTES.has(name) && LETTER.test(node.initializer.text))
        problems.push(`${where()} ${name}="${node.initializer.text.slice(0, 40)}"`)
      return
    }
    const literal = ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
    if (literal && TURKISH.test(node.text) && !isDeveloperMessage(node)) {
      problems.push(`${where()} Türkçe dizgi: "${node.text.slice(0, 40)}"`)
    }
  })
  return problems
}

const files = listFiles(SRC, ['.tsx']).filter((file) => !rel(file).startsWith('src/features/catalog/'))

describe('gömülü arayüz metni (kural testi)', () => {
  it('.tsx dosyalarında sözlük dışında arayüz metni yok', () => {
    const problems = files.flatMap((file) => findHardcodedText(parse(file), rel(file)))
    expect(problems, "Metni src/i18n/tr.json'a ekleyip t('anahtar') ile okuyun").toEqual([])
  })

  it('denetim gerçekten yakalıyor (kuralın kendi testi)', () => {
    const sample = [
      'export function A() {',
      "  const label = 'Görev silindi'",
      "  const ok = t('common.save')",
      "  if (!ok) throw new Error('Geliştirici iletisi: sağlam')",
      '  return <p aria-label="Kapat" title={ok}>Merhaba {label}</p>',
      '}',
    ].join('\n')
    const source = ts.createSourceFile('ornek.tsx', sample, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    expect(findHardcodedText(source, 'ornek.tsx')).toEqual([
      'ornek.tsx:2 Türkçe dizgi: "Görev silindi"',
      'ornek.tsx:5 aria-label="Kapat"',
      'ornek.tsx:5 JSX metni: "Merhaba"',
    ])
  })
})
