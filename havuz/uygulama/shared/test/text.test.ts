import { describe, expect, it } from 'vitest'
import { capitalizeTr, compareTr, foldTr, lowerTr, matchesTr, slugifyTr, upperTr } from '../src/index.ts'

describe('Türkçe metin', () => {
  it('büyük/küçük harf Türkçe kuralla çevrilir', () => {
    expect(upperTr('istanbul ılık')).toBe('İSTANBUL ILIK')
    expect(lowerTr('İSTANBUL ILIK')).toBe('istanbul ılık')
    expect(capitalizeTr('istanbul')).toBe('İstanbul')
    expect(capitalizeTr('ılgaz')).toBe('Ilgaz')
    expect(capitalizeTr('')).toBe('')
  })

  it('arama anahtarı büyük-küçük ve işaret duyarsızdır', () => {
    expect(foldTr('ÇIĞ')).toBe('cig')
    expect(foldTr('çığ')).toBe('cig')
    expect(foldTr('İstanbul')).toBe('istanbul')
    expect(foldTr('ISPARTA')).toBe('isparta')
    expect(foldTr('Şûrâ Kâğıt')).toBe('sura kagit')
    expect(foldTr('i\u0307stanbul')).toBe('istanbul')
  })

  it('içerme araması', () => {
    expect(matchesTr('Süt ve Ekmek Al', 'SUT')).toBe(true)
    expect(matchesTr('Işık faturası', 'isik')).toBe(true)
    expect(matchesTr('Kira', 'fatura')).toBe(false)
    expect(matchesTr('Her şey', '   ')).toBe(true)
  })

  it('Türk alfabesine göre sıralar', () => {
    const sorted = [
      'zil',
      'çay',
      'cam',
      'ığdır',
      'ılık',
      'iğne',
      'şal',
      'su',
      'öd',
      'oda',
      'ürün',
      'un',
      'göl',
      'ğ',
    ].toSorted(compareTr)
    expect(sorted).toEqual([
      'cam',
      'çay',
      'göl',
      'ğ',
      'ığdır',
      'ılık',
      'iğne',
      'oda',
      'öd',
      'su',
      'şal',
      'un',
      'ürün',
      'zil',
    ])
    expect(['Görev 10', 'Görev 2'].toSorted(compareTr)).toEqual(['Görev 2', 'Görev 10'])
  })

  it('kısa ad (slug)', () => {
    expect(slugifyTr('Çığ gibi büyüyen İş!')).toBe('cig-gibi-buyuyen-is')
    expect(slugifyTr('  --Öğle Yemeği 2026--  ')).toBe('ogle-yemegi-2026')
    expect(slugifyTr('!!!')).toBe('')
  })
})
