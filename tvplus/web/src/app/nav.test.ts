import { describe, expect, it } from 'vitest'
import { activeDesktopNav, DESKTOP_NAV } from './nav'

const label = (p: string) => activeDesktopNav(p)?.label ?? null

describe('masaüstü üst menü etkin öğesi', () => {
  it('bölüm yolları', () => {
    expect(label('/goz-at')).toBe('Ana Sayfa')
    expect(label('/goz-at/diziler')).toBe('Diziler')
    expect(label('/goz-at/filmler')).toBe('Filmler')
    expect(label('/canli')).toBe('Canlı TV')
    expect(label('/rehber')).toBe('Canlı TV')
    expect(label('/yeni-ve-populer')).toBe('Yeni ve Popüler')
    expect(label('/listem')).toBe('Listem')
  })

  it('tür, koleksiyon, kişi, stüdyo ve diğer sayfalarda hiçbir öğe etkin değil', () => {
    for (const p of [
      '/tur/7424',
      '/koleksiyon/9002',
      '/kisi/12',
      '/studyo',
      '/studyo/kitle',
      '/cihazlar',
      '/ara',
      '/tvplusim',
    ])
      expect(label(p)).toBeNull()
    expect(label('/canlitv')).toBeNull() // önek benzerliği eşleşmez
  })

  it('stüdyo üst menüde yok', () => {
    expect(DESKTOP_NAV.some((n) => n.to.startsWith('/studyo'))).toBe(false)
  })
})
