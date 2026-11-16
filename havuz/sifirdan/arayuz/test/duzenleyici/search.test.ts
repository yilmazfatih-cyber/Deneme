import { describe, expect, it } from 'vitest'
import { Editor, expandReplacement, findAll, SearchError, turkishCaseInsensitive } from '../../src/duzenleyici/index.ts'

const froms = (text: string, query: Parameters<typeof findAll>[1]) => findAll(text, query).map((m) => m.from)

describe('Türkçe büyük/küçük harf duyarsız arama', () => {
  it('i ↔ İ ve ı ↔ I eşleşir; i ↔ I eşleşmez', () => {
    expect(froms('İstanbul istanbul ISTANBUL', { text: 'istanbul' })).toEqual([0, 9])
    expect(froms('IRMAK ırmak İrmak', { text: 'IRMAK' })).toEqual([0, 6])
    expect(froms('Çiçek ÇİÇEK çiçek', { text: 'çİçEk' })).toEqual([0, 6, 12])
    expect(froms('istanbul İstanbul', { text: 'istanbul', caseSensitive: true })).toEqual([0])
  })

  it('düzenli ifadede kaçışlar, sınıflar, aralıklar ve adlı gruplar bozulmaz', () => {
    expect(turkishCaseInsensitive('\\d+\\u00e7\\p{L}(?<ad>x)\\k<ad>a{2,3}')).toBe(
      '\\d+\\u00e7\\p{L}(?<ad>[xX])\\k<ad>[aA]{2,3}',
    )
    expect(turkishCaseInsensitive('[a-c]')).toBe('[a-cABC]')
    expect(turkishCaseInsensitive('[^ı]')).toBe('[^ıI]')
    expect(froms('Kitap KİTAP kitap', { text: 'k[i]tap', regex: true })).toEqual([0, 6, 12])
    expect(froms('ab AB Ab', { text: '(?:ab)', regex: true })).toEqual([0, 3, 6])
  })

  it('düz metindeki özel karakterler kaçışlanır; tam kelime seçeneği', () => {
    expect(froms('a.b axb', { text: 'a.b' })).toEqual([0])
    expect(froms('kedi kediler Kedi', { text: 'kedi', wholeWord: true })).toEqual([0, 13])
  })

  it('geçersiz ifadede Türkçe açıklamalı hata; boş eşleşmede sonsuz döngü yok', () => {
    expect(() => findAll('x', { text: '(', regex: true })).toThrow(SearchError)
    expect(() => findAll('x', { text: '(', regex: true })).toThrow(/Düzenli ifade geçersiz/)
    expect(froms('a\nb\nc', { text: '^', regex: true })).toEqual([0, 2, 4])
    expect(findAll('😀😀', { text: '', regex: true })).toEqual([])
    expect(froms('😀😀', { text: 'x*', regex: true })).toEqual([0, 2, 4])
  })

  it('değiştirme şablonu', () => {
    const [match] = findAll('ali veli', { text: '(\\p{L}+) (?<ikinci>\\p{L}+)', regex: true })
    expect(expandReplacement('$2-$1 [$&] $<ikinci> $$ $9', match!)).toBe('veli-ali [ali veli] veli $ $9')
  })
})

describe('düzenleyici özellik testi', () => {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  /** Bağımsız kâhin: bütün metni bölütleyip imleçten önceki son sınırı bulur. */
  const prevBoundary = (text: string, pos: number) => {
    let last = 0
    for (const s of segmenter.segment(text)) {
      if (s.index >= pos) break
      last = s.index
    }
    return last
  }

  it('rastgele yazma/silme/hareket dizisi düz dizgi modeliyle aynı kalır; hepsi geri alınınca başa döner', () => {
    let seed = 7
    const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
    const pieces = ['a', 'ğ', '👍🏽', 'e\u0301', '\n', 'söz ', '🇹🇷']
    const start = 'Başlangıç\nmetni'
    const editor = new Editor({ text: start, now: () => 0 })
    let model = start
    let pos = 0
    for (let step = 0; step < 400; step++) {
      const r = random()
      if (r < 0.5) {
        const text = pieces[Math.floor(random() * pieces.length)] as string
        editor.insertText(text)
        model = model.slice(0, pos) + text + model.slice(pos)
        pos += text.length
      } else if (r < 0.75) {
        editor.deleteBackward()
        if (pos > 0) {
          const from = model[pos - 1] === '\n' ? pos - 1 : prevBoundary(model, pos)
          model = model.slice(0, from) + model.slice(pos)
          pos = from
        }
      } else {
        const boundaries = [...segmenter.segment(model)].map((s) => s.index).concat(model.length)
        pos = boundaries[Math.floor(random() * boundaries.length)] as number
        editor.setSelection({ ranges: [{ anchor: pos, head: pos }], primary: 0 })
      }
      expect(editor.text()).toBe(model)
      expect(editor.selection.ranges[0]!.head).toBe(pos)
    }
    while (editor.undo()) {
      /* hepsini geri al */
    }
    expect(editor.text()).toBe(start)
  })
})
