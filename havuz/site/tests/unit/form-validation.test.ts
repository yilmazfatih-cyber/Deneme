import { describe, expect, it } from 'vitest'
import { buildMailto, EMAIL_PATTERN, isTooFast, mailBody, validateField } from '../../src/lib/form-validation.ts'
import { tr } from '../../src/i18n/tr.ts'

const messages = tr.contact.form

describe('validateField', () => {
  it('zorunlu alanı boş bırakınca uyarır, isteğe bağlıysa geçer', () => {
    expect(validateField('   ', { required: true }, messages)).toBe(messages.required)
    expect(validateField('', {}, messages)).toBeNull()
  })

  it('e-posta biçimini denetler', () => {
    expect(validateField('ayse@ornek', { email: true }, messages)).toBe(messages.invalidEmail)
    expect(validateField('ayse ornek.com', { email: true }, messages)).toBe(messages.invalidEmail)
    expect(validateField('ayşe.kaya@örnek.com.tr', { email: true }, messages)).toBeNull()
    expect(validateField(' ali@ornek.co ', { email: true, required: true }, messages)).toBeNull()
  })

  it('uzunluk sınırlarını harf sayısıyla (Türkçe harfler tek sayılır) denetler', () => {
    expect(validateField('kısa', { minLength: 10 }, messages)).toBe('En az 10 karakter yazın.')
    expect(validateField('ığüşöçİĞÜŞ', { minLength: 10 }, messages)).toBeNull()
    expect(validateField('a'.repeat(11), { maxLength: 10 }, messages)).toBe('En fazla 10 karakter yazabilirsiniz.')
  })

  it('EMAIL_PATTERN boşluklu ve @ içermeyen adresi reddeder', () => {
    expect(EMAIL_PATTERN.test('a@b.co')).toBe(true)
    expect(EMAIL_PATTERN.test('a@b')).toBe(false)
    expect(EMAIL_PATTERN.test('@b.co')).toBe(false)
  })
})

describe('isTooFast', () => {
  it('belirlenen süreden önce gönderimi yakalar', () => {
    expect(isTooFast(1000, 2500, 3000)).toBe(true)
    expect(isTooFast(1000, 4000, 3000)).toBe(false)
  })
})

describe('buildMailto ve mailBody', () => {
  it('konu ve gövdeyi kodlar (Türkçe harf, satır sonu, & ve ?)', () => {
    const body = mailBody([
      { label: 'Ad', value: 'Ayşe Kaya ' },
      { label: 'İleti', value: 'Fiyat & destek?\nTeşekkürler' },
    ])
    expect(body).toBe('Ad:\nAyşe Kaya\n\nİleti:\nFiyat & destek?\nTeşekkürler')
    const url = buildMailto('merhaba@ornek.com', 'Sedir iletişim formu: Ayşe', body)
    expect(url.startsWith('mailto:merhaba@ornek.com?subject=')).toBe(true)
    expect(url).not.toContain(' ')
    expect(url).not.toMatch(/[&?]destek/u)
    expect(decodeURIComponent(url.split('&body=')[1] ?? '')).toBe(body)
  })
})
