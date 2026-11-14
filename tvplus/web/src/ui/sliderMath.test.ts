import { describe, expect, it } from 'vitest'
import {
  clampPage,
  edgeOf,
  firstIndexOfPage,
  itemsPerPageFor,
  pageCount,
  pageOfIndex,
  pageToReveal,
  visibleRange,
} from './sliderMath'

describe('slider sayfa hesabı', () => {
  it('kırılımlara göre sayfadaki kart', () => {
    expect(itemsPerPageFor(1920)).toBe(6)
    expect(itemsPerPageFor(1400)).toBe(6)
    expect(itemsPerPageFor(1399)).toBe(5)
    expect(itemsPerPageFor(1100)).toBe(5)
    expect(itemsPerPageFor(1000)).toBe(4)
    expect(itemsPerPageFor(800)).toBe(4)
    expect(itemsPerPageFor(799)).toBe(3)
  })

  it('sayfa sayısı ve sınırlama', () => {
    expect(pageCount(0, 6)).toBe(0)
    expect(pageCount(6, 6)).toBe(1)
    expect(pageCount(7, 6)).toBe(2)
    expect(pageCount(40, 6)).toBe(7)
    expect(clampPage(-2, 40, 6)).toBe(0)
    expect(clampPage(99, 40, 6)).toBe(6)
    expect(clampPage(3, 0, 6)).toBe(0)
  })

  it('son sayfa sona yaslanır', () => {
    expect(firstIndexOfPage(0, 10, 6)).toBe(0)
    expect(firstIndexOfPage(1, 10, 6)).toBe(4)
    expect(firstIndexOfPage(2, 18, 6)).toBe(12)
    expect(firstIndexOfPage(0, 3, 6)).toBe(0)
  })

  it('görünen aralık kenardan görünen komşuları içerir', () => {
    expect(visibleRange(0, 20, 6)).toEqual({ from: 0, to: 6 })
    expect(visibleRange(1, 20, 6)).toEqual({ from: 5, to: 12 })
    expect(visibleRange(3, 20, 6)).toEqual({ from: 13, to: 19 })
    expect(visibleRange(1, 20, 6, false)).toEqual({ from: 6, to: 11 })
    expect(visibleRange(0, 0, 6)).toEqual({ from: 0, to: -1 })
  })

  it('kartın sayfası ve odakla sayfa değişimi', () => {
    expect(pageOfIndex(0, 20, 6)).toBe(0)
    expect(pageOfIndex(6, 20, 6)).toBe(1)
    expect(pageOfIndex(19, 20, 6)).toBe(3)
    expect(pageToReveal(5, 0, 20, 6)).toBe(0)
    expect(pageToReveal(6, 0, 20, 6)).toBe(1)
    expect(pageToReveal(5, 1, 20, 6)).toBe(0)
    expect(pageToReveal(15, 3, 20, 6)).toBe(3) // son sayfa 14–19
  })

  it('kenar kartları', () => {
    expect(edgeOf(0, 0, 20, 6)).toBe('left')
    expect(edgeOf(5, 0, 20, 6)).toBe('right')
    expect(edgeOf(3, 0, 20, 6)).toBe(null)
    expect(edgeOf(14, 3, 20, 6)).toBe('left')
    expect(edgeOf(19, 3, 20, 6)).toBe('right')
  })
})
