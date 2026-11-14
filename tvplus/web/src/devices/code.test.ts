import { describe, expect, it } from 'vitest'
import { caretAfterFormat, checkCode, cleanCode, codeFromSearch, formatCode } from './code'

describe('TV kodu', () => {
  it('büyük harf, tire ve boşluk atılır, 8 karakterde kesilir', () => {
    expect(cleanCode('klmn-4821')).toBe('KLMN4821')
    expect(cleanCode(' kl mn 48 21 99')).toBe('KLMN4821')
    expect(cleanCode('ılmn')).toBe('ILMN')
    expect(cleanCode('İLMN')).toBe('ILMN')
  })
  it('4 karakterden sonra tire', () => {
    expect(formatCode('KLM')).toBe('KLM')
    expect(formatCode('KLMN')).toBe('KLMN')
    expect(formatCode('KLMN4')).toBe('KLMN-4')
    expect(formatCode('KLMN4825')).toBe('KLMN-4825')
  })
  it('durum: boş, eksik, tamam', () => {
    expect(checkCode('').kind).toBe('empty')
    expect(checkCode('kxmn-48')).toEqual({ kind: 'partial', clean: 'KXMN48' })
    expect(checkCode('kxmn-4825')).toEqual({ kind: 'complete', clean: 'KXMN4825' })
  })
  it('abecede olmayan karışan karakterler (0 O 1 I L) yakalanır', () => {
    const c = checkCode('KOMN-4021')
    expect(c.kind).toBe('ambiguous')
    if (c.kind === 'ambiguous') expect(c.chars).toEqual(['O', '0', '1'])
    expect(checkCode('kl').kind).toBe('ambiguous')
  })
  it('imleç biçimlendirmeden sonra aynı karakterin ardında kalır', () => {
    // "KLMN4" yazıldı, imleç sonda → "KLMN-4" sonunda
    expect(caretAfterFormat('KLMN4', 5, 'KLMN-4')).toBe(6)
    // ortada düzenleme: "KLMN-48" içinde 2. karakterden sonra
    expect(caretAfterFormat('KLMN-48', 2, 'KLMN-48')).toBe(2)
    expect(caretAfterFormat('', 0, '')).toBe(0)
  })
  it('adres sorgusundan', () => {
    expect(codeFromSearch('?kod=abcd-2345')).toBe('ABCD2345')
    expect(codeFromSearch('?x=1')).toBe('')
  })
})
