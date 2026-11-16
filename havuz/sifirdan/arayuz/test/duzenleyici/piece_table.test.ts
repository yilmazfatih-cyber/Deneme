import { describe, expect, it } from 'vitest'
import { ChangeSet, PieceTable } from '../../src/duzenleyici/index.ts'

/** Tohumlu, belirlenimci rastgele sayı üreteci (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const ALPHABET = ['a', 'ş', 'İ', '\n', ' ', 'x', 'yz', '\n\n', 'çok', '😀']

describe('parça tablosu', () => {
  it('rastgele ekleme/silme dizileri düz dizgi modeliyle aynı sonucu verir (satır dizini dahil)', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const random = rng(seed)
      let model = 'Merhaba\ndünya\n'
      const table = new PieceTable(model)
      for (let step = 0; step < 300; step++) {
        if (random() < 0.6 || model.length === 0) {
          const at = Math.floor(random() * (model.length + 1))
          const text = ALPHABET[Math.floor(random() * ALPHABET.length)] as string
          table.insert(at, text)
          model = model.slice(0, at) + text + model.slice(at)
        } else {
          const at = Math.floor(random() * model.length)
          const length = Math.min(model.length - at, 1 + Math.floor(random() * 5))
          table.delete(at, length)
          model = model.slice(0, at) + model.slice(at + length)
        }
        if (step % 25 === 0 || step === 299) {
          expect(table.getText()).toBe(model)
          const lines = model.split('\n')
          expect(table.lineCount).toBe(lines.length)
          const line = Math.floor(random() * lines.length)
          expect(table.lineText(line)).toBe(lines[line])
          const offset = Math.floor(random() * (model.length + 1))
          const before = model.slice(0, offset).split('\n')
          expect(table.positionAt(offset)).toEqual({ line: before.length - 1, col: (before.at(-1) as string).length })
          const { line: l, col } = table.positionAt(offset)
          expect(table.offsetAt(l, col)).toBe(offset)
          const a = Math.floor(random() * (model.length + 1))
          const b = a + Math.floor(random() * (model.length - a + 1))
          expect(table.slice(a, b)).toBe(model.slice(a, b))
        }
      }
    }
  })

  it('sırayla yazmada parça sayısı artmaz; CRLF girişte \\n olur; sınır dışı konum açıklayıcı hata verir', () => {
    const table = new PieceTable('a\r\nb')
    expect(table.getText()).toBe('a\nb')
    for (const ch of 'merhaba') table.insert(table.length, ch)
    expect(table.pieceCount).toBe(2)
    expect(() => table.insert(99, 'x')).toThrow(/belgenin dışında/)
  })
})

describe('değişiklik kümesi', () => {
  it('uygular, tersini üretir ve konumları taşır', () => {
    const doc = new PieceTable('0123456789')
    const set = new ChangeSet([
      { from: 2, to: 4, insert: 'AB C' },
      { from: 7, to: 7, insert: '!' },
    ])
    const inverse = set.invert(doc)
    set.apply(doc)
    expect(doc.getText()).toBe('01AB C456!789')
    expect([
      set.mapPos(1),
      set.mapPos(3, -1),
      set.mapPos(3, 1),
      set.mapPos(7, -1),
      set.mapPos(7, 1),
      set.mapPos(9),
    ]).toEqual([1, 2, 6, 9, 10, 12])
    inverse.apply(doc)
    expect(doc.getText()).toBe('0123456789')
  })

  it('çakışan değişiklikleri birleştirir', () => {
    const set = new ChangeSet([
      { from: 3, to: 6, insert: '' },
      { from: 1, to: 4, insert: '' },
    ])
    expect(set.changes).toEqual([{ from: 1, to: 6, insert: '' }])
  })
})
