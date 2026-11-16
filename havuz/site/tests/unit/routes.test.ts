import { describe, expect, it } from 'vitest'
import { alternatesFor, localeFromPath, paths, RESERVED_SLUGS, splitEntryId } from '../../src/lib/routes.ts'

describe('adres haritası', () => {
  it('varsayılan dil kökte, diğerleri kendi klasöründe', () => {
    expect(paths.home('tr')).toBe('/')
    expect(paths.home('en')).toBe('/en/')
    expect(paths.blog('tr', 2)).toBe('/blog/2/')
    expect(paths.post('en', 'x')).toBe('/en/blog/x/')
    expect(paths.tag('tr', 'seo')).toBe('/blog/etiket/seo/')
    expect(paths.doc('en', 'getting-started')).toBe('/en/docs/getting-started/')
    expect(paths.contact('tr')).toBe('/iletisim/')
    expect(paths.rss('en')).toBe('/en/rss.xml')
  })

  it('yoldan dili bulur', () => {
    expect(localeFromPath('/en/blog/')).toBe('en')
    expect(localeFromPath('/blog/')).toBe('tr')
    expect(localeFromPath('/english/')).toBe('tr')
  })

  it('içerik kimliğini dil ve kısa ada ayırır; dil klasörü yoksa yol gösterir', () => {
    expect(splitEntryId('tr/ilk-yazi')).toEqual({ locale: 'tr', slug: 'ilk-yazi' })
    expect(() => splitEntryId('ilk-yazi')).toThrow(/dil klasöründe olmalı/u)
    expect(() => splitEntryId('de/x')).toThrow(/diller: tr, en/u)
  })

  it('bütün diller için karşılık tablosu üretir', () => {
    expect(alternatesFor(paths.docs)).toEqual({ tr: '/belgeler/', en: '/en/docs/' })
  })

  it('ayrılmış adlar bölüm klasörlerini ve dil kodlarını içerir', () => {
    for (const slug of [
      'blog',
      'belgeler',
      'docs',
      'iletisim',
      'contact',
      'etiket',
      'tag',
      'en',
      'tr',
      'og',
      'pagefind',
    ]) {
      expect(RESERVED_SLUGS.has(slug), slug).toBe(true)
    }
  })
})
