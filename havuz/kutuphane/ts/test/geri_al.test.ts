// geri_al modülünün testi.
import { describe, expect, it } from 'vitest'
import { UndoStack } from '../src/geri_al.ts'

describe('UndoStack', () => {
  it('geri al / yinele ve yeni değişiklikte yineleme geçmişi silinir', () => {
    const stack = new UndoStack(0)
    stack.push(1)
    stack.push(2)
    expect(stack.undo()).toBe(1)
    expect(stack.undo()).toBe(0)
    expect(stack.undo()).toBeUndefined()
    expect(stack.redo()).toBe(1)
    stack.push(5)
    expect(stack.canRedo).toBe(false)
    expect(stack.redo()).toBeUndefined()
    expect(stack.counts).toEqual({ undo: 2, redo: 0 })
  })

  it('aynı mergeKey ile ardışık değişiklikler tek adımdır', () => {
    const stack = new UndoStack({ metin: '' })
    stack.push({ metin: 'M' }, { mergeKey: 'yazi' })
    stack.push({ metin: 'Me' }, { mergeKey: 'yazi' })
    stack.push({ metin: 'Mer' }, { mergeKey: 'yazi' })
    stack.push({ metin: 'Mer!' }, { mergeKey: 'noktalama' })
    expect(stack.undo()).toEqual({ metin: 'Mer' })
    expect(stack.undo()).toEqual({ metin: '' })
    expect(stack.canUndo).toBe(false)
  })

  it('limit eski adımları atar; undefined da geçerli bir durumdur', () => {
    const stack = new UndoStack<number | undefined>(undefined, { limit: 3 })
    for (let i = 1; i <= 5; i++) stack.push(i)
    expect([stack.undo(), stack.undo(), stack.undo(), stack.undo()]).toEqual([4, 3, 2, undefined])
    expect(stack.current).toBe(2)
    stack.clear(9)
    expect(stack.current).toBe(9)
    expect(stack.canUndo).toBe(false)
    expect(() => new UndoStack(0, { limit: 0 })).toThrow(RangeError)
  })
})
