import { describe, expect, it } from 'vitest'
import { COLUMNS, findKey, keyIdOf, LAYOUT, LETTERS, moveKey, nextPreferredCol, typedChar } from './keyboard'

const id = (ch: string) => keyIdOf({ action: 'char', char: ch })
const SPACE = keyIdOf({ action: 'space' })
const DEL = keyIdOf({ action: 'delete' })
const CLEAR = keyIdOf({ action: 'clear' })

describe('klavye düzeni', () => {
  it('6 sütun; Türk harfleri, rakamlar, boşluk · sil · temizle', () => {
    expect(COLUMNS).toBe(6)
    const all = LAYOUT.flat()
    for (const ch of [...'abcçdefgğhıijklmnoöprsştuüvyz', ...'qwx', ...'0123456789'])
      expect(findKey(LAYOUT, id(ch))).not.toBeNull()
    expect(LETTERS).toHaveLength(32)
    expect(all.map((k) => k.action).filter((a) => a !== 'char')).toEqual(['space', 'delete', 'clear'])
    for (const row of LAYOUT) expect(row.reduce((n, k) => n + k.span, 0)).toBeLessThanOrEqual(6)
    expect(new Set(all.map((k) => k.id)).size).toBe(all.length)
    // Alfabe sırası: ç c'den, ğ g'den, ı i'den önce gelir
    const order = all
      .filter((k) => k.action === 'char')
      .map((k) => k.char)
      .join('')
    expect(order.startsWith('abcçdefgğhıij')).toBe(true)
    expect(order.endsWith('1234567890')).toBe(true)
  })
})

describe('kenar gezintisi', () => {
  it('satır içinde komşu; ilk sütunda ← ve son sütunda → klavyeden çıkar', () => {
    expect(moveKey(LAYOUT, id('a'), 'right')).toEqual({ kind: 'key', id: id('b') })
    expect(moveKey(LAYOUT, id('b'), 'left')).toEqual({ kind: 'key', id: id('a') })
    expect(moveKey(LAYOUT, id('a'), 'left')).toEqual({ kind: 'exit', dir: 'left' })
    expect(moveKey(LAYOUT, id('e'), 'right')).toEqual({ kind: 'exit', dir: 'right' })
    expect(moveKey(LAYOUT, CLEAR, 'right')).toEqual({ kind: 'exit', dir: 'right' })
    expect(moveKey(LAYOUT, SPACE, 'left')).toEqual({ kind: 'exit', dir: 'left' })
  })

  it('dikeyde aynı sütun; geniş tuşa çıkıp inince sütun korunur', () => {
    expect(moveKey(LAYOUT, id('a'), 'down')).toEqual({ kind: 'key', id: id('f') })
    expect(moveKey(LAYOUT, id('b'), 'up')).toEqual({ kind: 'key', id: SPACE })
    expect(moveKey(LAYOUT, id('ç'), 'up')).toEqual({ kind: 'key', id: DEL })
    // b → Boşluk → (hatırlanan sütun 1) → b
    const pref = nextPreferredCol(LAYOUT, SPACE, 1)
    expect(pref).toBe(1)
    expect(moveKey(LAYOUT, SPACE, 'down', pref)).toEqual({ kind: 'key', id: id('b') })
    expect(moveKey(LAYOUT, SPACE, 'down')).toEqual({ kind: 'key', id: id('a') })
    // geniş tuşun dışındaki sütun hatırlanmaz
    expect(moveKey(LAYOUT, DEL, 'down', 5)).toEqual({ kind: 'key', id: id('c') })
    expect(moveKey(LAYOUT, DEL, 'down', 3)).toEqual({ kind: 'key', id: id('ç') })
  })

  it('en üst satırda ↑ ve en alt satırda ↓ çıkar (↓ tahminlere)', () => {
    expect(moveKey(LAYOUT, SPACE, 'up')).toEqual({ kind: 'exit', dir: 'up' })
    expect(moveKey(LAYOUT, id('0'), 'down')).toEqual({ kind: 'exit', dir: 'down' })
    expect(moveKey(LAYOUT, 'yok', 'down')).toEqual({ kind: 'exit', dir: 'down' })
  })

  it('her tuştan her yön ya bir tuşa ya da çıkışa gider (çıkmaz sokak yok)', () => {
    for (const k of LAYOUT.flat())
      for (const dir of ['up', 'down', 'left', 'right'] as const) {
        const r = moveKey(LAYOUT, k.id, dir)
        if (r.kind === 'key') expect(findKey(LAYOUT, r.id)).not.toBeNull()
      }
  })
})

describe('fiziksel klavye', () => {
  it('Türkçe küçük harfe çevirir; tanınmayanı bırakır', () => {
    expect(typedChar('S')).toBe('s')
    expect(typedChar('I')).toBe('ı')
    expect(typedChar('İ')).toBe('i')
    expect(typedChar('ş')).toBe('ş')
    expect(typedChar('7')).toBe('7')
    expect(typedChar(' ')).toBe(' ')
    expect(typedChar('Enter')).toBeNull()
    expect(typedChar('/')).toBeNull()
    expect(typedChar('é')).toBeNull()
  })
})
