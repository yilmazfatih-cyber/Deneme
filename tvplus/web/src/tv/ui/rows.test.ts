import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { clampIndex, rowWindow, TvRow, TvRowsViewport } from './rows'

describe('rowWindow / clampIndex', () => {
  it('odak çevresindeki pencere', () => {
    expect(rowWindow(0, 100, 7, 2)).toEqual({ from: 0, to: 9 })
    expect(rowWindow(40, 100, 7, 2)).toEqual({ from: 38, to: 49 })
    expect(rowWindow(98, 100, 7, 2)).toEqual({ from: 96, to: 100 })
    expect(rowWindow(500, 10, 7, 2)).toEqual({ from: 7, to: 10 })
    expect(rowWindow(3, 0, 7, 2)).toEqual({ from: 0, to: 0 })
  })
  it('sıkıştırma', () => {
    expect(clampIndex(-3, 10)).toBe(0)
    expect(clampIndex(12, 10)).toBe(9)
    expect(clampIndex(4.7, 10)).toBe(4)
    expect(clampIndex(5, 0)).toBe(0)
  })
})

const card = (label: string, _i: number, focusId: string) => createElement('div', { 'data-kart': focusId }, label)
const indicesOf = (html: string): number[] => [...html.matchAll(/data-row-index="(\d+)"/g)].map((m) => Number(m[1]))

describe('TvRow (sunucuda çizim)', () => {
  it('initialIndex: uzun satır hatırlanan karttan çizilir; kart odak kimliğiyle gelir', () => {
    const items = Array.from({ length: 60 }, (_, i) => `kart ${i}`)
    const html = renderToStaticMarkup(
      createElement(TvRow<string>, { id: 'satir', items, itemKey: (s) => s, renderItem: card, initialIndex: 40 }),
    )
    const idx = indicesOf(html)
    expect(idx[0]).toBe(38)
    expect(idx).toContain(40)
    expect(html).toContain('data-kart="satir:kart 40"')
    expect(html).not.toContain('data-kart="satir:kart 0"')
    expect(html).toContain('translate3d(-810rem') // 40 × (19.5 + 0.75)
  })

  it('length + getItem: yüklenmemiş öğeler iskelet, yüklenenler kart', () => {
    const loaded = new Map([
      [0, 'a'],
      [1, 'b'],
    ])
    const html = renderToStaticMarkup(
      createElement(TvRow<string>, {
        id: 'satir',
        length: 30,
        getItem: (i) => loaded.get(i),
        itemKey: (s) => s,
        renderItem: card,
      }),
    )
    expect(html).toContain('data-kart="satir:a"')
    expect(html).toContain('data-kart="satir:b"')
    expect((html.match(/tv-skel/g) ?? []).length).toBe(indicesOf(html).length - 2)
    expect(html).toContain('width:607.5rem') // 30 × 20.25: toplam uzunluk bilinir
  })

  it('aralık ve başlık yanı yazısı', () => {
    const html = renderToStaticMarkup(
      createElement(TvRow<string>, {
        id: 's',
        title: 'Benzerleri',
        aside: 'Kuzgun izlediğin için',
        items: ['x'],
        itemKey: (s) => s,
        renderItem: card,
        initialIndex: 99,
      }),
    )
    expect(indicesOf(html)).toEqual([0])
    expect(html).toContain('Kuzgun izlediğin için')
  })
})

describe('TvRowsViewport (sunucuda çizim)', () => {
  it('initialIndex: üstteki satırlar söner, başlangıç satırı geçerli', () => {
    const rows = [0, 1, 2, 3].map((i) => createElement('div', { key: `r${i}` }, `satır ${i}`))
    const html = renderToStaticMarkup(createElement(TvRowsViewport, { id: 'y', initialIndex: 2, children: rows }))
    expect((html.match(/is-above/g) ?? []).length).toBe(2)
    expect(html).toMatch(/is-current" data-rows-index="2"/)
    expect(html).toContain('tv-no-anim')
  })
})
