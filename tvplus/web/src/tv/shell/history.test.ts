import { describe, expect, it } from 'vitest'
import { TvHistoryStack } from './history'

describe('TvHistoryStack', () => {
  it('PUSH / POP / REPLACE ve previousPath', () => {
    const h = new TvHistoryStack()
    h.apply('POP', 'default', '/tv/giris') // ilk yükleme
    h.apply('REPLACE', 'a', '/tv/profiller')
    h.apply('REPLACE', 'b', '/tv')
    expect(h.canGoBack()).toBe(false)
    expect(h.previousPath()).toBeNull()
    h.apply('PUSH', 'c', '/tv/baslik/42')
    h.apply('PUSH', 'd', '/tv/izle/Video:42?konum=10')
    expect(h.previousPath()).toBe('/tv/baslik/42')
    expect(h.currentPath()).toBe('/tv/izle/Video:42?konum=10')
    h.apply('POP', 'c', '/tv/baslik/42') // geri
    expect(h.previousPath()).toBe('/tv')
    expect(h.canGoBack()).toBe(true)
    h.apply('POP', 'b', '/tv')
    expect(h.canGoBack()).toBe(false)
  })

  it('aynı PUSH iki kez gelirse (StrictMode) tek giriş sayılır', () => {
    const h = new TvHistoryStack()
    h.apply('POP', 'default', '/tv')
    h.apply('PUSH', 'x', '/tv/ara')
    h.apply('PUSH', 'x', '/tv/ara')
    expect(h.depth()).toBe(2)
    expect(h.previousPath()).toBe('/tv')
  })

  it('bilinmeyen bir girişe POP (dışarıdan ileri/yenileme) yığını sıfırlar', () => {
    const h = new TvHistoryStack()
    h.apply('POP', 'default', '/tv')
    h.apply('PUSH', 'x', '/tv/ara')
    h.apply('POP', 'yabanci', '/tv/listem')
    expect(h.depth()).toBe(1)
    expect(h.previousPath()).toBeNull()
  })
})
