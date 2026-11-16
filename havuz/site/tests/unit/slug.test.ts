import { describe, expect, it } from 'vitest'
import { createSlugCounter, slugify } from '../../src/lib/slug.ts'

describe('slugify', () => {
  it.each([
    ['Çığ gibi büyüyen İş', 'cig-gibi-buyuyen-is'],
    ['IĞDIR’da şöyle: ışıl ışıl!', 'igdirda-soyle-isil-isil'],
    ['İstanbul & Ankara', 'istanbul-ankara'],
    ['  SEO   temel denetim listesi  ', 'seo-temel-denetim-listesi'],
    ['Kâğıt, hâlâ ve rüzgâr', 'kagit-hala-ve-ruzgar'],
    ['Öğüt Üçgeni – 2026', 'ogut-ucgeni-2026'],
    ['Straße Café Ærø', 'strasse-cafe-aero'],
    ['How to write a good homepage?', 'how-to-write-a-good-homepage'],
    ["Iğdır'ın Isısı", 'igdirin-isisi'],
  ])('%s → %s', (input, expected) => {
    expect(slugify(input)).toBe(expected)
  })

  it('yalnız ASCII küçük harf, rakam ve tire üretir', () => {
    expect(slugify('Ş!@#$%^&*()_+ğ 日本 ü')).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/u)
  })

  it('harf içermeyen girdide boş döner', () => {
    expect(slugify('!!! ???')).toBe('')
  })
})

describe('createSlugCounter', () => {
  it('yinelenen kısa adlara sıra numarası ekler', () => {
    const unique = createSlugCounter()
    expect(unique('giris')).toBe('giris')
    expect(unique('giris')).toBe('giris-2')
    expect(unique('sonuc')).toBe('sonuc')
    expect(unique('giris')).toBe('giris-3')
  })
})
