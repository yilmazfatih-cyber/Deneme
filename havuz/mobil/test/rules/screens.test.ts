/**
 * KURAL: her ekranın başlığı ve erişilebilir adı var; rotalar ince kalır.
 *  - src/app altındaki her rota dosyası (yerleşim `_layout` dışında) bir `…Screen` bileşenini ya da yönlendirmeyi
 *    dışa aktarır: `export { TasksScreen as default } from '../features/tasks/TasksScreen.tsx'`.
 *  - Her `…Screen.tsx` dosyası `<Screen title={t('…')}>` kullanır (başlık gezinme çubuğuna, ekran okuyucuya ve web
 *    sekmesine gider; içerik `role="main"` + ad alır: src/ui/Screen.tsx).
 * Yeni ekran: `npm run gen -- screen <ad>` (src/features/<ad>/<Ad>Screen.tsx + rota + sözlük + test).
 */
import { basename, join } from 'node:path'
import { MESSAGES } from '../../src/i18n/index.ts'
import { expectNone, listFiles, parse, parseText, rel, SRC, ts, walk } from './source.ts'

const routeFiles = listFiles(join(SRC, 'app'), ['.tsx', '.ts']).filter((file) => basename(file) !== '_layout.tsx')
const screenFiles = listFiles(join(SRC, 'features'), ['Screen.tsx'])

/** `<Screen title={t('anahtar')}>` kullanımlarının anahtarları. */
export function screenTitleKeys(source: ts.SourceFile): string[] {
  const keys: string[] = []
  walk(source, (node) => {
    const tag = ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node) ? node : null
    if (!tag || tag.tagName.getText(source) !== 'Screen') return
    for (const attribute of tag.attributes.properties) {
      if (!ts.isJsxAttribute(attribute) || attribute.name.getText(source) !== 'title') continue
      const value = attribute.initializer
      const expression = value && ts.isJsxExpression(value) ? value.expression : undefined
      if (expression && ts.isCallExpression(expression) && expression.expression.getText(source) === 't') {
        const first = expression.arguments[0]
        if (first && ts.isStringLiteral(first)) keys.push(first.text)
      }
    }
  })
  return keys
}

describe('ekranlar (kural testleri)', () => {
  it('her rota dosyası bir ekranı (…Screen) ya da yönlendirmeyi dışa aktarır', () => {
    const problems = routeFiles
      .filter((file) => {
        const text = parse(file).getText()
        return !/export \{ \w+(Screen|Redirect) as default \} from '\.\.\/[^']*(features|navigation)\//.test(text)
      })
      .map(rel)
    expectNone(problems, "Rota dosyasında yalnız `export { XScreen as default } from '…/features/…'` olsun:")
  })

  it('her ekran <Screen title={t(…)}> kullanır ve başlık anahtarı sözlükte var', () => {
    const problems: string[] = []
    for (const file of screenFiles) {
      const keys = screenTitleKeys(parse(file))
      if (keys.length === 0) problems.push(`${rel(file)}: <Screen title={t('…')}> yok`)
      for (const key of keys) if (!Object.hasOwn(MESSAGES, key)) problems.push(`${rel(file)}: ${key} sözlükte yok`)
    }
    expectNone(problems, "Ekranı <Screen title={t('anahtar')}> ile sarın (src/ui/Screen.tsx):")
  })

  it('denetim gerçekten yakalıyor', () => {
    const good = "export function A() { return <Screen title={t('tasks.title')}><X /></Screen> }"
    const bad = 'export function B() { return <Screen title="Görevler"><X /></Screen> }'
    expect(screenTitleKeys(parseText('a.tsx', good))).toEqual(['tasks.title'])
    expect(screenTitleKeys(parseText('b.tsx', bad))).toEqual([])
  })
})
