import { describe, expect, it } from 'vitest'
import { cursor, Editor, single } from '../../src/duzenleyici/index.ts'

function clock() {
  let t = 0
  return { now: () => t, advance: (ms: number) => (t += ms) }
}

describe('grafem kümeleri', () => {
  it('emoji, bayrak ve birleşik işaret tek adımda geçilir ve silinir', () => {
    const text = 'a👍🏽🇹🇷e\u0301b'
    const editor = new Editor({ text })
    const stops: number[] = []
    for (let i = 0; i < 6; i++) {
      editor.moveHorizontal(1)
      stops.push(editor.selection.ranges[0]!.head)
    }
    expect(stops).toEqual([1, 5, 9, 11, 12, 12])
    editor.deleteBackward()
    editor.deleteBackward()
    expect(editor.text()).toBe('a👍🏽🇹🇷')
    editor.deleteBackward()
    expect(editor.text()).toBe('a👍🏽')
    editor.setSelection(single(3))
    expect(editor.selection.ranges[0]!.head).toBe(1)
  })

  it('dikey harekette hedef sütun kısa satırdan geçince korunur (grafem sayısıyla)', () => {
    const editor = new Editor({ text: 'uzun bir satır\nkısa\n😀😀😀😀😀😀 sonu' })
    editor.setSelection(single(8))
    editor.moveVertical(1)
    expect(editor.doc.positionAt(editor.selection.ranges[0]!.head)).toEqual({ line: 1, col: 4 })
    editor.moveVertical(1)
    expect(editor.doc.positionAt(editor.selection.ranges[0]!.head)).toEqual({ line: 2, col: 14 }) // 6 emoji × 2 birim + ' ' + 's'
  })

  it('kelime kelime hareket ve silme (Ctrl+ok, Ctrl+Backspace)', () => {
    const editor = new Editor({ text: 'bir iki üç' })
    editor.moveDocBoundary(true)
    editor.moveHorizontal(-1, false, 'word')
    expect(editor.selection.ranges[0]!.head).toBe(8)
    editor.deleteBackward('word')
    expect(editor.text()).toBe('bir üç')
  })
})

describe('çoklu imleç', () => {
  it('tüm imleçlere yazar ve siler; çakışan silmeler birleşir', () => {
    const editor = new Editor({ text: 'a\nb\nc' })
    editor.setSelection({ ranges: [cursor(1), cursor(3), cursor(5)], primary: 0 })
    editor.insertText('!')
    expect(editor.text()).toBe('a!\nb!\nc!')
    expect(editor.selection.ranges.map((r) => r.head)).toEqual([2, 5, 8])
    editor.deleteBackward()
    editor.deleteBackward()
    expect(editor.text()).toBe('\n\n')
    editor.setSelection({ ranges: [cursor(1), cursor(1)], primary: 1 })
    expect(editor.selection.ranges).toHaveLength(1)
  })

  it('Ctrl+D önce kelimeyi seçer, sonra sıradaki geçişleri ekler ve başa sarar', () => {
    const editor = new Editor({ text: 'kedi ve kedi ve kedi' })
    editor.setSelection(single(9))
    expect(editor.addNextOccurrence()).toBe(true)
    expect(editor.selection.ranges.map((r) => [r.anchor, r.head])).toEqual([[8, 12]])
    editor.addNextOccurrence()
    editor.addNextOccurrence()
    expect(editor.selection.ranges.map((r) => [r.anchor, r.head])).toEqual([
      [0, 4],
      [8, 12],
      [16, 20],
    ])
    expect(editor.addNextOccurrence()).toBe(false)
    editor.insertText('köpek')
    expect(editor.text()).toBe('köpek ve köpek ve köpek')
  })
})

describe('geri al / yinele', () => {
  it('hızlı yazılan harfler tek adımdır; duraklama ve yeni satır grubu böler; seçim geri gelir', () => {
    const time = clock()
    const editor = new Editor({ now: time.now, groupDelayMs: 500 })
    for (const ch of 'merhaba') {
      editor.insertText(ch)
      time.advance(50)
    }
    time.advance(1000)
    editor.insertText(' dünya')
    editor.insertText('\n')
    editor.insertText('yeni')
    expect(editor.text()).toBe('merhaba dünya\nyeni')
    editor.undo()
    expect(editor.text()).toBe('merhaba dünya\n')
    editor.undo()
    expect(editor.text()).toBe('merhaba')
    expect(editor.selection.ranges[0]!.head).toBe(7)
    editor.undo()
    expect(editor.text()).toBe('')
    expect(editor.undo()).toBe(false)
    editor.redo()
    editor.redo()
    expect(editor.text()).toBe('merhaba dünya\n')
    editor.insertText('x')
    expect(editor.canRedo).toBe(false)
  })
})

describe('bul / değiştir', () => {
  it('Türkçe duyarsız tümünü değiştir tek adımda geri alınır', () => {
    const editor = new Editor({ text: 'İzmir, izmir ve IZMIR' })
    expect(editor.replaceAll({ text: 'izmir' }, 'İstanbul')).toBe(2)
    expect(editor.text()).toBe('İstanbul, İstanbul ve IZMIR')
    editor.undo()
    expect(editor.text()).toBe('İzmir, izmir ve IZMIR')
  })

  it('düzenli ifade grupları ile değiştirir; sıradakini seçer', () => {
    const editor = new Editor({ text: 'Ad: Ayşe Yılmaz\nAd: Ali Işık' })
    editor.replaceAll({ text: 'ad: (?<ad>\\p{L}+) (\\p{L}+)', regex: true }, '$2, $<ad>')
    expect(editor.text()).toBe('Yılmaz, Ayşe\nIşık, Ali')
    editor.setSelection(single(0))
    expect(editor.selectNextMatch({ text: 'ışık' })).toBe(true)
    expect(editor.selection.ranges[0]).toEqual({ anchor: 13, head: 17 })
    editor.replaceNext({ text: 'ışık' }, 'Kaya')
    expect(editor.text()).toBe('Yılmaz, Ayşe\nKaya, Ali')
  })
})
