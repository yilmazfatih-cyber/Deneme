import { describe, expect, it } from 'vitest'
import { parseBankStatement, parseCsv, parseTrDate } from '../../server/domain/bankcsv.ts'
import { blockKey, extractUnitHint, findUnitByHint, matchTransaction } from '../../server/domain/matcher.ts'
import { isValidIban, isValidTckn, maskPII, unmask } from '../../server/domain/pii.ts'
import { chunkText, search } from '../../server/domain/search.ts'
import { fold, normalizePhone, tokenize, trUpper } from '../../server/domain/text.ts'

describe('Türkçe metin', () => {
  it('büyük harf ve sadeleştirme', () => {
    expect(trUpper('istanbul ılık')).toBe('İSTANBUL ILIK')
    expect(fold('  Şükrü   ÇİĞDEM ')).toBe('sukru cigdem')
    expect(tokenize('Aidatımı nereye ödeyebilirim?')).toEqual(['aidat', 'nerey', 'odeye'])
  })

  it('telefon normalleştirme', () => {
    expect(normalizePhone('0532 111 22 33')).toBe('+905321112233')
    expect(normalizePhone('+90 (532) 111-22-33')).toBe('+905321112233')
    expect(normalizePhone('905321112233')).toBe('+905321112233')
    expect(normalizePhone('12345')).toBeNull()
  })
})

describe('KVKK maskeleme', () => {
  it('geçerli TCKN ve IBAN doğrulaması', () => {
    expect(isValidTckn('10000000146')).toBe(true)
    expect(isValidTckn('12345678901')).toBe(false)
    expect(isValidIban('TR330006100519786457841326')).toBe(true)
    expect(isValidIban('TR330006100519786457841327')).toBe(false)
  })

  it('kişisel verileri maskeler ve geri koyar', () => {
    const input =
      'Ben Ayşe Kaya, TC 10000000146. Tel 0532 111 22 33, e-posta ayse@ornek.com. IBAN TR33 0006 1005 1978 6457 8413 26. AYSE KAYA'
    const r = maskPII(input, { names: ['Ayşe Kaya'] })
    expect(r.text).not.toMatch(/10000000146|0532|ayse@ornek|TR33|Ayşe|AYSE|Kaya|KAYA/)
    expect(r.counts).toMatchObject({ TCKN: 1, TELEFON: 1, EPOSTA: 1, IBAN: 1 })
    expect(unmask(r.text, r.map)).toBe(input)
  })

  it('daire numarası ve tutarları maskelemez', () => {
    const r = maskPII('A blok 12 numaralı daire, 1.250 TL aidat, 15.11.2026')
    expect(r.text).toBe('A blok 12 numaralı daire, 1.250 TL aidat, 15.11.2026')
  })
})

describe('blok/daire ipucu', () => {
  it.each([
    ['A Blok Daire 5 su sızıntısı', 'a', '5'],
    ['a blk d:12 ekim aidat', 'a', '12'],
    ['B2 blok no 14', 'b2', '14'],
    ['Lale Blok 3 numara', 'lale', '3'],
    ['A-7 kasım aidatı', 'a', '7'],
    ['Daire 4 asansör', null, '4'],
    ['A blokta 5 numaralı dairede su var', 'a', '5'],
  ])('%s', (text, block, unit) => {
    expect(extractUnitHint(text, ['a', 'b', 'b2', 'lale'])).toEqual({ block, unit })
  })

  it('blok anahtarı', () => {
    expect(blockKey('A Blok')).toBe('a')
    expect(blockKey('Lale Blok')).toBe('lale')
  })

  it('ipucundan birim bulma', () => {
    const units = [
      { id: 1, block: 'A Blok', no: '5' },
      { id: 2, block: 'B Blok', no: '5' },
    ]
    expect(findUnitByHint({ block: 'b', unit: '5' }, units)?.id).toBe(2)
    expect(findUnitByHint({ block: null, unit: '5' }, units)).toBeNull()
  })
})

describe('banka hareketi eşleştirme', () => {
  const units = [
    { id: 1, block: 'A Blok', no: '5', names: ['Ayşe Kaya'], expected: [125_000] },
    { id: 2, block: 'B Blok', no: '5', names: ['Mehmet Demir'], expected: [125_000] },
    { id: 3, block: 'B Blok', no: '7', names: ['Zeynep Arslan'], expected: [98_000] },
  ]

  it('blok + daire', () => {
    const r = matchTransaction('EFT A BLK D:5 KASIM AIDAT', 125_000, units)
    expect(r.unitId).toBe(1)
    expect(r.confidence).toBeGreaterThanOrEqual(0.6)
  })

  it('gönderen adı', () => {
    const r = matchTransaction('FAST ZEYNEP ARSLAN aidat', 98_000, units)
    expect(r.unitId).toBe(3)
  })

  it('belirsizse düşük güven', () => {
    const r = matchTransaction('daire 5 aidat', 125_000, units)
    expect(r.confidence).toBeLessThan(0.5)
  })

  it('eşleşme yoksa null', () => {
    expect(matchTransaction('KIRA ODEMESI', 500_000, units).unitId).toBeNull()
  })
})

describe('banka CSV', () => {
  it('başlık öncesi satırlar, Türkçe sayı ve tarih', () => {
    const csv = [
      'Hesap No;1234567',
      'Müşteri;Lale Evleri Sitesi Yönetimi',
      '',
      'İşlem Tarihi;Açıklama;Tutar;Bakiye;Dekont No',
      '01.11.2026;FAST A BLOK D:5 AYSE KAYA;1.250,00;10.250,00;D001',
      '02.11.2026;ELEKTRIK FATURASI;-3.400,00;6.850,00;D002',
      '"03.11.2026";"MEHMET DEMIR; B BLOK 5";"1.250,00";"8.100,00";D003',
    ].join('\n')
    const r = parseBankStatement(csv)
    expect(r.rows).toHaveLength(2)
    expect(r.skipped).toBe(1)
    expect(r.rows[0]).toMatchObject({ date: '2026-11-01', amount: 125_000, reference: 'D001' })
    expect(r.rows[1]!.description).toBe('MEHMET DEMIR; B BLOK 5')
  })

  it('alacak/borç sütunları', () => {
    const csv = 'Tarih,Açıklama,Borç,Alacak\n2026-11-05,Ali Veli aidat,,980.00\n2026-11-06,Su,150.00,\n'
    const r = parseBankStatement(csv)
    expect(r.rows).toEqual([
      { rowNo: 2, date: '2026-11-05', description: 'Ali Veli aidat', amount: 98_000, reference: null },
    ])
  })

  it('tarih ve CSV ayrıştırma', () => {
    expect(parseTrDate('5/1/2026')).toBe('2026-01-05')
    expect(parseTrDate('31.02.2026')).toBeNull()
    expect(parseCsv('a,"b,c",d\n1,2,3')).toEqual([
      ['a', 'b,c', 'd'],
      ['1', '2', '3'],
    ])
  })
})

describe('belge arama', () => {
  const body = `# Ortak alanlar

Havuz 1 Haziran ile 15 Eylül arasında 09:00–21:00 saatleri arasında açıktır. Havuza misafir getirmek için yönetime bilgi verilir.

# Evcil hayvanlar

Evcil hayvanlar ortak alanlarda tasmalı gezdirilir. Dışkılar sahibi tarafından toplanır.

# Gürültü

Hafta içi 22:00–08:00, hafta sonu 23:00–09:00 arası sessizlik saatleridir. Tadilat işleri hafta içi 09:00–18:00 arasında yapılır.`
  const chunks = chunkText(body).map((c, i) => ({ id: i + 1, documentId: 1, title: 'İç yönetmelik', ...c }))

  it('başlıklara göre parçalar', () => {
    expect(chunks.map((c) => c.heading)).toEqual(['Ortak alanlar', 'Evcil hayvanlar', 'Gürültü'])
  })

  it('soruya en uygun parçayı bulur', () => {
    expect(search('Havuz kaçta kapanıyor?', chunks)[0]!.chunk.heading).toBe('Ortak alanlar')
    expect(search('tadilat saatleri', chunks)[0]!.chunk.heading).toBe('Gürültü')
    expect(search('köpeğimi bahçede gezdirebilir miyim tasma', chunks)[0]!.chunk.heading).toBe('Evcil hayvanlar')
  })
})
