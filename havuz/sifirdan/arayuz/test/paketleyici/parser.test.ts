import { describe, expect, it } from 'vitest'
import { bundle, buildGraph, decodeVlq, encodeVlq, parseModule, tokenize } from '../../src/paketleyici/index.ts'
import { memoryFs } from './fixtures.ts'

const bundleOf = (files: Record<string, string>) => bundle({ entry: Object.keys(files)[0]!, fs: memoryFs(files) }).code
const kinds = (source: string) => parseModule(source).statements.map((s) => s.kind)

describe('sözcük çözümleyici', () => {
  it('bölme ile düzenli ifadeyi ayırır; dizgi, yorum ve şablondaki sözcükleri atlar', () => {
    const types = (src: string) => tokenize(src).map((t) => t.type)
    expect(types('a / b / c')).toEqual(['ident', 'punct', 'ident', 'punct', 'ident'])
    expect(types('x = /ab+c/gi.test(y)')).toEqual([
      'ident',
      'punct',
      'regex',
      'punct',
      'ident',
      'punct',
      'ident',
      'punct',
    ])
    expect(types('return /[/]/')).toEqual(['ident', 'regex'])
    const words = tokenize('"import x" // export y\n/* import z */ `a ${ { b: import1 }.b } c`')
      .filter((t) => t.type === 'ident')
      .map((t) => t.value)
    expect(words).toEqual(['b', 'import1', 'b'])
  })

  it('kapanmamış dizgide satır numaralı hata', () => {
    expect(() => tokenize('const a = 1\nconst b = "yarım')).toThrow(/satır 2/)
  })
})

describe('modül ayrıştırıcı', () => {
  it('noktalı virgülsüz kodda deyim sınırlarını bulur', () => {
    expect(kinds('const a = 1\nconst b = a\n  + 2\nfoo()\nif (a) {\n  b()\n}\n;[1, 2].forEach(f)')).toEqual([
      'declaration',
      'declaration',
      'other',
      'other',
      'other',
    ])
  })

  it('içe/dışa aktarma biçimlerini ve yapı bozan bildirim adlarını çıkarır', () => {
    const { statements } = parseModule(`import d, { a as b, default as c } from './x.js'
import * as ns from './y.js'
export const { p, q: r = 1, ...rest } = o, [m, , n] = arr
export default async function () {}
export * as hepsi from './z.js'
export { b as default2, ns }`)
    const [imp, ns, decl, def, star, names] = statements
    expect(imp).toMatchObject({
      kind: 'import',
      specifiers: [
        { imported: 'default', local: 'd' },
        { imported: 'a', local: 'b' },
        { imported: 'default', local: 'c' },
      ],
    })
    expect(ns).toMatchObject({ kind: 'import', specifiers: [{ imported: '*', local: 'ns' }] })
    expect(decl).toMatchObject({ kind: 'declaration', names: ['p', 'r', 'rest', 'm', 'n'], exported: true })
    expect(def).toMatchObject({ kind: 'default', name: undefined, isDeclaration: true })
    const anonymousClass = bundleOf({ '/m.js': 'export default class extends Array {}' })
    expect(anonymousClass).toContain('class __default extends Array {}')
    expect(star).toMatchObject({ kind: 'export-from', namespace: 'hepsi', star: false })
    expect(names).toMatchObject({
      kind: 'export-names',
      specifiers: [
        { local: 'b', exported: 'default2' },
        { local: 'ns', exported: 'ns' },
      ],
    })
  })
})

describe('çizge ve kaynak haritası kodlaması', () => {
  it('eksik modül ve paket adı için yol gösteren hata', () => {
    expect(() => buildGraph('/a.js', memoryFs({ '/a.js': "import './yok.js'" }))).toThrow(
      /Modül bulunamadı: ".\/yok.js".*Denenen yollar/,
    )
    expect(() => buildGraph('/a.js', memoryFs({ '/a.js': "import x from 'lodash'" }))).toThrow(
      /Paket adıyla içe aktarma desteklenmez/,
    )
    const graph = buildGraph('/src/main.js', memoryFs())
    expect(graph.order.at(-1)).toBe('/src/main.js')
    expect(graph.order.indexOf('/src/geometry/circle.js')).toBeLessThan(graph.order.indexOf('/src/geometry/index.js'))
  })

  it('VLQ kodlama gidiş-dönüş', () => {
    const values = [0, 1, -1, 15, -16, 16, 1000, -123456]
    expect(decodeVlq(values.map(encodeVlq).join(''))).toEqual(values)
    expect(encodeVlq(16)).toBe('gB')
  })
})
