import { describe, expect, it } from 'vitest'
import {
  isExternal,
  isSamePage,
  isWithinSection,
  normalizeBase,
  stripBase,
  toAbsolute,
  withBase,
} from '../../src/lib/paths.ts'

describe('normalizeBase', () => {
  it.each([
    [undefined, '/'],
    ['', '/'],
    ['/', '/'],
    ['depo', '/depo/'],
    ['/depo', '/depo/'],
    ['depo/', '/depo/'],
    ['/alt/klasor/', '/alt/klasor/'],
    ['//alt//', '/alt/'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeBase(input)).toBe(expected)
  })
})

describe('withBase', () => {
  it('kökte yayında yolu değiştirmez, sayfa yoluna / ekler', () => {
    expect(withBase('/', '/')).toBe('/')
    expect(withBase('/blog/', '/')).toBe('/blog/')
    expect(withBase('/blog', '/')).toBe('/blog/')
  })

  it('alt klasörü ekler', () => {
    expect(withBase('/', '/depo/')).toBe('/depo/')
    expect(withBase('/blog/ilk-yazi/', '/depo')).toBe('/depo/blog/ilk-yazi/')
    expect(withBase('/blog', 'alt/klasor')).toBe('/alt/klasor/blog/')
  })

  it('dosya yollarına / eklemez', () => {
    expect(withBase('/rss.xml', '/depo/')).toBe('/depo/rss.xml')
    expect(withBase('/og/blog/yazi.png', '/')).toBe('/og/blog/yazi.png')
    expect(withBase('/favicon.svg', '/depo/')).toBe('/depo/favicon.svg')
  })

  it('sorgu ve bölüm kısmını korur', () => {
    expect(withBase('/#fiyatlar', '/depo/')).toBe('/depo/#fiyatlar')
    expect(withBase('/blog?sayfa=2#ust', '/depo/')).toBe('/depo/blog/?sayfa=2#ust')
    expect(withBase('/en/#pricing', '/')).toBe('/en/#pricing')
  })

  it('dış adreslere, yalnız bölüm ve yalnız sorgu adreslerine dokunmaz', () => {
    for (const href of [
      'https://example.com/a',
      'mailto:a@b.co',
      'tel:+900000000000',
      '//cdn.example.com/x',
      '#bolum',
      '?q=1',
      '',
    ]) {
      expect(withBase(href, '/depo/')).toBe(href)
    }
  })

  it('"/" ile başlamayan iç yolda yol gösteren bir hata verir', () => {
    expect(() => withBase('blog/', '/')).toThrow(/"\/" ile başlamalı/u)
  })

  it('sürüm numarası içeren klasör adını dosya sanmaz ama uzantıyı tanır', () => {
    expect(withBase('/belgeler/surum-2', '/')).toBe('/belgeler/surum-2/')
    expect(withBase('/dosya.pdf', '/')).toBe('/dosya.pdf')
  })
})

describe('stripBase', () => {
  it('alt klasörü çıkarır', () => {
    expect(stripBase('/depo/blog/', '/depo/')).toBe('/blog/')
    expect(stripBase('/depo/', '/depo/')).toBe('/')
    expect(stripBase('/depo', '/depo/')).toBe('/')
    expect(stripBase('/blog/', '/')).toBe('/blog/')
  })

  it('benzer adlı başka klasöre dokunmaz', () => {
    expect(stripBase('/depolar/x/', '/depo/')).toBe('/depolar/x/')
  })
})

describe('toAbsolute', () => {
  it('site adresi ve alt klasörle tam adres üretir', () => {
    expect(toAbsolute('/blog/', 'https://ornek.github.io', '/depo/')).toBe('https://ornek.github.io/depo/blog/')
    expect(toAbsolute('/', 'https://www.ornek.com', '/')).toBe('https://www.ornek.com/')
    expect(toAbsolute('https://baska.com/x', 'https://www.ornek.com', '/')).toBe('https://baska.com/x')
  })
})

describe('isExternal, isSamePage, isWithinSection', () => {
  it('dış adresi tanır', () => {
    expect(isExternal('https://a.b')).toBe(true)
    expect(isExternal('mailto:a@b.co')).toBe(true)
    expect(isExternal('/blog/')).toBe(false)
    expect(isExternal('#x')).toBe(false)
  })

  it('aynı sayfayı sondaki / ve bölüm farkına bakmadan tanır', () => {
    expect(isSamePage('/blog/', '/blog')).toBe(true)
    expect(isSamePage('/blog/#ust', '/blog/')).toBe(true)
    expect(isSamePage('/blog/', '/blog/yazi/')).toBe(false)
  })

  it('bölüm altındaki sayfaları tanır', () => {
    expect(isWithinSection('/blog/yazi/', '/blog/')).toBe(true)
    expect(isWithinSection('/blog/', '/blog/')).toBe(true)
    expect(isWithinSection('/bloglar/', '/blog/')).toBe(false)
    expect(isWithinSection('/', '/')).toBe(true)
    expect(isWithinSection('/blog/', '/')).toBe(false)
  })
})
