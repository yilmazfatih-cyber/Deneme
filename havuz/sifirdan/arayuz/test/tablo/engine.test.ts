import { describe, expect, it } from 'vitest'
import { columnIndex, columnName, parseFormula, Sheet, tokenize } from '../../src/tablo/index.ts'

const sheet = (decimalComma = true) => new Sheet({ rows: 100, cols: 26, decimalComma })
const valueOf = (s: Sheet, address: string) => {
  const v = s.getValue(address)
  return typeof v === 'object' && v !== null ? v.code : v
}

describe('sözcük çözümleme ve ayrıştırma', () => {
  it('ondalık virgül kipinde ";" ayraçtır; nokta kipinde ","', () => {
    expect(tokenize('TOPLA(1,5;2)', { decimalComma: true }).map((t) => t.text)).toEqual([
      'TOPLA',
      '(',
      '1,5',
      ';',
      '2',
      ')',
    ])
    expect(tokenize('SUM(1.5,2)', { decimalComma: false }).map((t) => t.type)).toEqual([
      'func',
      'lparen',
      'number',
      'sep',
      'number',
      'rparen',
    ])
  })

  it('arkasından "(" gelen sözcük işlevdir, gelmeyen başvurudur', () => {
    expect(tokenize('LOG10(2)+LOG10', { decimalComma: true }).map((t) => t.type)).toEqual([
      'func',
      'lparen',
      'number',
      'rparen',
      'op',
      'ref',
    ])
    expect(tokenize('"a""b"&#BÖL/0!', { decimalComma: true }).map((t) => t.type)).toEqual(['string', 'op', 'error'])
  })

  it('e-tablo öncelik kuralları: tekli eksi üsten güçlü, ^ soldan birleşir, & toplamadan zayıf', () => {
    const s = sheet()
    s.setCells([
      ['A1', '=-2^2'],
      ['A2', '=2^3^2'],
      ['A3', '=1+2*3'],
      ['A4', '=2*3%'],
      ['A5', '="a"&1+1'],
      ['A6', '=1+1=2'],
    ])
    expect(['A1', 'A2', 'A3', 'A4', 'A5', 'A6'].map((a) => valueOf(s, a))).toEqual([4, 64, 7, 0.06, 'a2', true])
  })

  it('sözdizimi hatası konumuyla bildirilir; hücrede #HATA! görünür, giriş korunur', () => {
    expect(() => parseFormula('TOPLA(1;', { decimalComma: true })).toThrow(/yarım kaldı/)
    expect(() => parseFormula('1+*2', { decimalComma: true })).toThrow(/konum 3/)
    const s = sheet()
    s.setCell('A1', '=1+')
    expect(valueOf(s, 'A1')).toBe('#HATA!')
    expect(s.getInput('A1')).toBe('=1+')
  })

  it('sütun adları; "i5" İ değil I sütunudur (Türkçe büyütme tuzağı)', () => {
    expect([columnName(0), columnName(25), columnName(26), columnName(701)]).toEqual(['A', 'Z', 'AA', 'ZZ'])
    expect(columnIndex('aa')).toBe(26)
    const s = sheet()
    s.setCells([
      ['I5', '7'],
      ['A1', '=i5*2'],
    ])
    expect(valueOf(s, 'A1')).toBe(14)
  })

  it('işlev adları dil ve harf büyüklüğünden bağımsız (MIN = MİN = min = mın)', () => {
    const s = sheet()
    s.setCells([
      ['A1', '3'],
      ['A2', '5'],
      ['B1', '=min(A1:A2)'],
      ['B2', '=MİN(A1:A2)'],
      ['B3', '=mın(A1:A2)'],
      ['B4', '=Topla(A1:A2)+sum(A1;A2)'],
    ])
    expect(['B1', 'B2', 'B3', 'B4'].map((a) => valueOf(s, a))).toEqual([3, 3, 3, 16])
  })
})

describe('yeniden hesaplama', () => {
  it('yalnız etkilenen hücreler, her biri bir kez hesaplanır', () => {
    const s = sheet()
    s.setCells([
      ['A1', '1'],
      ['B1', '=A1*2'],
      ['C1', '=B1+1'],
      ['D1', '=100'],
    ])
    const before = s.stats.evaluations
    const order = s.setCell('A1', '5')
    expect(s.stats.evaluations - before).toBe(2)
    expect(order).toEqual(['A1', 'B1', 'C1'])
    expect(valueOf(s, 'C1')).toBe(11)
  })

  it('elmas: birleşen hücre iki dalından sonra ve tek kez hesaplanır', () => {
    const s = sheet()
    s.setCells([
      ['A1', '1'],
      ['B1', '=A1+1'],
      ['C1', '=A1*10'],
      ['D1', '=B1+C1'],
    ])
    const before = s.stats.evaluations
    const order = s.setCell('A1', '2')
    expect(s.stats.evaluations - before).toBe(3)
    expect(order.indexOf('D1')).toBeGreaterThan(Math.max(order.indexOf('B1'), order.indexOf('C1')))
    expect(valueOf(s, 'D1')).toBe(23)
  })

  it('döngüyü #DÖNGÜ! ile işaretler, aşağı yayar; EĞERHATA yakalar; döngü kırılınca düzelir', () => {
    const s = sheet()
    s.setCells([
      ['A1', '=B1+1'],
      ['B1', '=A1+1'],
      ['C1', '=A1*2'],
      ['C2', '=EĞERHATA(A1;0)'],
      ['D1', '=D1+1'],
    ])
    expect(['A1', 'B1', 'C1', 'C2', 'D1'].map((a) => valueOf(s, a))).toEqual([
      '#DÖNGÜ!',
      '#DÖNGÜ!',
      '#DÖNGÜ!',
      0,
      '#DÖNGÜ!',
    ])
    s.setCell('B1', '5')
    expect(['A1', 'B1', 'C1', 'C2'].map((a) => valueOf(s, a))).toEqual([6, 5, 12, 6])
  })

  it('uzun zincirde (10.000 hücre) yığın taşmaz', () => {
    const s = new Sheet({ rows: 10_001, cols: 1 })
    const entries: [string, string][] = [['A1', '1']]
    for (let r = 2; r <= 10_000; r++) entries.push([`A${r}`, `=A${r - 1}+1`])
    s.setCells(entries)
    expect(valueOf(s, 'A10000')).toBe(10_000)
    s.setCell('A1', '0')
    expect(valueOf(s, 'A10000')).toBe(9_999)
  })

  it('hata değerleri: sıfıra bölme, değer, ad, başvuru; aralığı hücreye yazmak', () => {
    const s = sheet()
    s.setCells([
      ['A1', '=1/0'],
      ['A2', '="abc"+1'],
      ['A3', '=YOKBÖYLE(1)'],
      ['A4', '=bilinmeyenAd+1'],
      ['A5', '=A1+1'],
      ['A6', '=B1:B3'],
      ['A7', "'=metin"],
      ['A8', '=Z100+AA1'],
    ])
    expect(['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8'].map((a) => valueOf(s, a))).toEqual([
      '#BÖL/0!',
      '#DEĞER!',
      '#AD?',
      '#AD?',
      '#BÖL/0!',
      '#DEĞER!',
      '=metin',
      '#BAŞV!',
    ])
  })

  it('nokta kipinde "1.5" sayıdır; virgül kipinde "1,5"', () => {
    const dot = sheet(false)
    dot.setCells([
      ['A1', '1.5'],
      ['A2', '=SUM(A1,2)'],
    ])
    expect(valueOf(dot, 'A2')).toBe(3.5)
    const comma = sheet()
    comma.setCells([
      ['A1', '1,5'],
      ['A2', '=A1*2'],
    ])
    expect(valueOf(comma, 'A2')).toBe(3)
    expect(comma.getDisplay('A1')).toBe('1,5')
  })
})
