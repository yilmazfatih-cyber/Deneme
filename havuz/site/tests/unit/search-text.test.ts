import { describe, expect, it } from 'vitest'
import { foldForSearch, queryVariants } from '../../src/lib/search-text.ts'

describe('foldForSearch', () => {
  it('Türkçe büyük/küçük harf ve aksanları aynı biçime indirir', () => {
    for (const input of ['IĞDIR', 'ığdır', 'Iğdır', 'igdir']) expect(foldForSearch(input, 'tr')).toBe('igdir')
    for (const input of ['İSTANBUL', 'istanbul', 'İstanbul']) expect(foldForSearch(input, 'tr')).toBe('istanbul')
    expect(foldForSearch('ÇIĞ gibi İŞ', 'tr')).toBe('cig gibi is')
    expect(foldForSearch("Iğdır'da şöyle: hatırlatma!", 'tr')).toBe('igdirda soyle hatirlatma')
  })

  it('İngilizce metinde I harfini i yapar', () => {
    expect(foldForSearch('INDEX Page', 'en')).toBe('index page')
  })
})

describe('queryVariants', () => {
  it('dile göre küçültülmüş ve katlanmış iki biçim verir (aynıysa tek)', () => {
    expect(queryVariants('  ÇIĞ  ', 'tr')).toEqual(['çığ', 'cig'])
    expect(queryVariants('randevu', 'tr')).toEqual(['randevu'])
    expect(queryVariants('   ', 'tr')).toEqual([])
  })
})
