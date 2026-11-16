import { describe, expect, it } from 'vitest'
import { graphemeLength, s, type ParseResult } from '../../src/form/index.ts'

const messagesOf = (result: ParseResult<unknown>) =>
  result.ok ? {} : Object.fromEntries(result.issues.map((i) => [i.path.join('.'), i.message]))

describe('şema doğrulayıcı', () => {
  it('dizgi: zorunlu, kırpma, grafem uzunluğu, e-posta, desen', () => {
    const name = s.string().min(2).max(5)
    expect(name.parse('  Su ')).toEqual({ ok: true, value: 'Su' })
    expect(messagesOf(name.parse('   '))).toEqual({ '': 'Bu alan zorunlu.' })
    expect(messagesOf(name.parse('a'))).toEqual({ '': 'En az 2 karakter olmalı.' })
    expect(messagesOf(name.parse('İstanbul'))).toEqual({ '': 'En fazla 5 karakter olabilir.' })
    expect(graphemeLength('👍🏽é')).toBe(2)
    expect(s.string().max(2).parse('👍🏽é').ok).toBe(true)
    expect(messagesOf(s.string().email().parse('ad@ornek'))).toEqual({
      '': 'Geçerli bir e-posta adresi girin (ör. ad@ornek.com).',
    })
    expect(s.string().email().parse('ayşe@örnek.com.tr').ok).toBe(true)
    expect(
      messagesOf(
        s
          .string()
          .pattern(/^\d{5}$/, 'Posta kodu 5 rakam olmalı.')
          .parse('34a'),
      ),
    ).toEqual({ '': 'Posta kodu 5 rakam olmalı.' })
  })

  it('sayı: ondalık virgül, tam sayı, sınırlar (binlik ayraçlı Türkçe ileti)', () => {
    const age = s.number().int().min(18).max(1000)
    expect(s.number().parse('3,5')).toEqual({ ok: true, value: 3.5 })
    expect(age.parse(' 42 ')).toEqual({ ok: true, value: 42 })
    expect(messagesOf(age.parse('17'))).toEqual({ '': 'En az 18 olmalı.' })
    expect(messagesOf(age.parse('1001'))).toEqual({ '': 'En fazla 1.000 olabilir.' })
    expect(messagesOf(age.parse('20,5'))).toEqual({ '': 'Tam sayı girin.' })
    expect(messagesOf(age.parse('1.000,5'))).toEqual({ '': 'Bir sayı girin.' })
    expect(messagesOf(age.parse(''))).toEqual({ '': 'Bu alan zorunlu.' })
  })

  it('nesne ve dizi: sorunlar kendi yollarıyla; isteğe bağlı; çapraz alan kuralı', () => {
    const schema = s
      .object({
        ad: s.string().min(2),
        yas: s.number().optional(),
        il: s.enumOf(['İzmir', 'Iğdır']),
        telefonlar: s.array(s.object({ numara: s.string().pattern(/^\d{10}$/, '10 haneli numara girin.') })).min(1),
        sifre: s.string().min(8),
        sifreTekrar: s.string(),
      })
      .refine((v) => v.sifre === v.sifreTekrar, 'Şifreler aynı değil.', ['sifreTekrar'])
    const bad = schema.parse({
      ad: 'A',
      il: 'Ankara',
      telefonlar: [{ numara: '123' }],
      sifre: '12345678',
      sifreTekrar: '12345678',
    })
    expect(messagesOf(bad)).toEqual({
      ad: 'En az 2 karakter olmalı.',
      il: 'Listeden bir seçenek seçin.',
      'telefonlar.0.numara': '10 haneli numara girin.',
    })
    const mismatch = schema.parse({
      ad: 'Ayşe',
      il: 'Iğdır',
      telefonlar: [{ numara: '5321234567' }],
      sifre: '12345678',
      sifreTekrar: 'x',
    })
    expect(messagesOf(mismatch)).toEqual({ sifreTekrar: 'Şifreler aynı değil.' })
    expect(
      messagesOf(schema.parse({ ad: 'Ayşe', il: 'İzmir', telefonlar: [], sifre: '12345678', sifreTekrar: '12345678' })),
    ).toEqual({
      telefonlar: 'En az 1 öğe ekleyin.',
    })
    const good = schema.parse({
      ad: ' Ayşe ',
      yas: '',
      il: 'İzmir',
      telefonlar: [{ numara: '5321234567' }],
      sifre: 'abcdefgh',
      sifreTekrar: 'abcdefgh',
      fazla: 1,
    })
    expect(good).toEqual({
      ok: true,
      value: {
        ad: 'Ayşe',
        yas: undefined,
        il: 'İzmir',
        telefonlar: [{ numara: '5321234567' }],
        sifre: 'abcdefgh',
        sifreTekrar: 'abcdefgh',
      },
    })
  })
})
