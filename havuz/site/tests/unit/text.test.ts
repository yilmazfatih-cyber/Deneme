import { describe, expect, it } from 'vitest'
import { capitalizeFor, countWords, fill, lowerFor, lowerTr, markdownToPlainText, truncate, upperFor, upperTr } from '../../src/lib/text.ts'

describe('Türkçe büyük/küçük harf', () => {
  it('i → İ ve ı → I dönüşümünü doğru yapar', () => {
    expect(upperTr('iş ığdır çığ')).toBe('İŞ IĞDIR ÇIĞ')
    expect(lowerTr('IĞDIR İŞ')).toBe('ığdır iş')
  })

  it('dile göre davranır', () => {
    expect(upperFor('title', 'en')).toBe('TITLE')
    expect(upperFor('iletişim', 'tr')).toBe('İLETİŞİM')
    expect(lowerFor('TITLE', 'en')).toBe('title')
    expect(lowerFor('IŞIK', 'tr')).toBe('ışık')
    expect(capitalizeFor('iletişim', 'tr')).toBe('İletişim')
    expect(capitalizeFor('index', 'en')).toBe('Index')
    expect(capitalizeFor('', 'tr')).toBe('')
  })
})

describe('truncate', () => {
  it('kısa metne dokunmaz', () => {
    expect(truncate('Kısa metin.', 50)).toBe('Kısa metin.')
  })

  it('kelimeyi bölmeden keser ve üç nokta koyar', () => {
    const result = truncate('Randevular dolsun, telefon sussun; müşterileriniz kendi randevusunu alsın.', 40)
    expect(result.length).toBeLessThanOrEqual(40)
    expect(result.endsWith('…')).toBe(true)
    expect(result).toBe('Randevular dolsun, telefon sussun…')
  })

  it('fazla boşlukları sadeleştirir', () => {
    expect(truncate('  iki   boşluk \n satır ', 50)).toBe('iki boşluk satır')
  })
})

describe('markdownToPlainText', () => {
  it('ön bilgiyi, kodu, etiketleri ve işaretleri atar', () => {
    const markdown = [
      '---',
      'title: Deneme',
      '---',
      "import X from './x.astro'",
      '## Başlık',
      'Bir **kalın** ve [bağlantı](/blog/) ile ![görsel](./a.png).',
      '```ts',
      'const gizli = 1',
      '```',
      '> [!TIP]',
      '> İpucu metni.',
      '<Callout>Kutu</Callout>',
    ].join('\n')
    const plain = markdownToPlainText(markdown)
    expect(plain).toBe('Başlık Bir kalın ve bağlantı ile görsel. İpucu metni. Kutu')
  })
})

describe('countWords ve fill', () => {
  it('kelimeleri sayar', () => {
    expect(countWords('')).toBe(0)
    expect(countWords('  bir  iki\nüç ')).toBe(3)
  })

  it('yer tutucuları doldurur, bilinmeyeni bırakır', () => {
    expect(fill('{minutes} dk okuma', { minutes: 4 })).toBe('4 dk okuma')
    expect(fill('{a} ve {b}', { a: 'x' })).toBe('x ve {b}')
  })
})
