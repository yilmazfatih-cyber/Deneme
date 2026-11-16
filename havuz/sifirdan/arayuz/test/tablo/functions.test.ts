import { describe, expect, it } from 'vitest'
import { listFunctions, Sheet, shiftFormula, parseTSV, toTSV } from '../../src/tablo/index.ts'

function evaluateAll(formulas: [string, unknown][], setup: [string, string][] = []) {
  const s = new Sheet({ rows: 50, cols: 10, now: () => new Date(2026, 10, 16, 15, 30) })
  s.setCells(setup)
  return formulas.map(([formula]) => {
    s.setCell('J50', formula)
    const v = s.getValue('J50')
    return typeof v === 'object' && v !== null ? v.code : v
  })
}

const data: [string, string][] = [
  ['A1', 'elma'],
  ['B1', '10'],
  ['A2', 'Armut'],
  ['B2', '20'],
  ['A3', 'ELMA'],
  ['B3', '5'],
  ['A4', 'İncir'],
  ['B4', 'yok'],
  ['D1', '1'],
  ['E1', 'bir'],
  ['D2', '5'],
  ['E2', 'beş'],
  ['D3', '10'],
  ['E3', 'on'],
  ['G1', '1'],
  ['H1', '5'],
  ['I1', '10'],
  ['G2', 'a'],
  ['H2', 'b'],
  ['I2', 'c'],
]

const cases: [string, unknown][] = [
  ['=TOPLA(B1:B4)', 35],
  ['=ORTALAMA(B1:B3)', 35 / 3],
  ['=MİN(B1:B3;4)', 4],
  ['=MAK(B1:B4)', 20],
  ['=BAĞ_DEĞ_SAY(B1:B4)', 3],
  ['=BAĞ_DEĞ_DOLU_SAY(A1:B4)', 8],
  ['=BAĞ_DEĞ_SAY(G1:I2)', 3],
  ['=ÇARPIM(2;3;4)', 24],
  ['=YUVARLA(1,005;2)', 1.01],
  ['=YUVARLA(-2,5;0)', -3],
  ['=YUVARLA(1234;-2)', 1200],
  ['=YUKARIYUVARLA(1,201;1)', 1.3],
  ['=AŞAĞIYUVARLA(-1,29;1)', -1.2],
  ['=MUTLAK(-7)', 7],
  ['=KAREKÖK(-1)', '#SAYI!'],
  ['=KUVVET(2;10)', 1024],
  ['=MOD(-3;2)', 1],
  ['=MOD(5;0)', '#BÖL/0!'],
  ['=TAMSAYI(-2,5)', -3],
  ['=YUVARLA(Pİ();4)', 3.1416],
  ['=ORTANCA(1;9;3;7)', 5],
  ['=ETOPLA(B1:B4;">5")', 30],
  ['=ETOPLA(A1:A4;"elma";B1:B4)', 15],
  ['=EĞERSAY(A1:A4;"el*")', 2],
  ['=EĞERSAY(A1:A4;"<>elma")', 2],
  ['=EĞERORTALAMA(A1:A4;"elma";B1:B4)', 7.5],
  ['=EĞER(B1>5;"büyük";"küçük")', 'büyük'],
  ['=EĞER(YANLIŞ;1/0;"güvenli")', 'güvenli'],
  ['=VE(DOĞRU;B1>5)', true],
  ['=YADA(YANLIŞ;B3>5)', false],
  ['=DEĞİL(DOĞRU)', false],
  ['=EĞERHATA(1/0;"sıfıra bölme")', 'sıfıra bölme'],
  ['=EHATALIYSA(B4+1)', true],
  ['=EBOŞSA(C9)', true],
  ['=ESAYIYSA(B1)', true],
  ['=EMETİNSE(A1)', true],
  ['=BİRLEŞTİR(A1;" ";B1)', 'elma 10'],
  ['=UZUNLUK("👍🏽iş")', 3],
  ['=BÜYÜKHARF("istanbul ılık")', 'İSTANBUL ILIK'],
  ['=KÜÇÜKHARF("IĞDIR İLİ")', 'ığdır ili'],
  ['=YAZIM.DÜZENİ("IĞDIR ilçesi")', 'Iğdır İlçesi'],
  ['=YAZIM.DÜZENİ("iĞDIR")', 'İğdır'],
  ['=SOLDAN("Merhaba";3)', 'Mer'],
  ['=SAĞDAN("Merhaba";2)', 'ba'],
  ['=PARÇAAL("Merhaba";2;3)', 'erh'],
  ['=KIRP("  çok   boşluk  ")', 'çok boşluk'],
  ['=YİNELE("ab";3)', 'ababab'],
  ['=BUL("ş";"Aşkım")', 2],
  ['=BUL("z";"abc")', '#DEĞER!'],
  ['=YERİNEKOY("a-b-c";"-";"+")', 'a+b+c'],
  ['=YERİNEKOY("a-b-c";"-";"+";2)', 'a-b+c'],
  ['=TARİH(2026;11;16)', 46342],
  ['=YIL(TARİH(2026;13;1))', 2027],
  ['=AY(46342)', 11],
  ['=GÜN(TARİH(2024;2;30))', 1],
  ['=BUGÜN()', 46342],
  ['=HAFTANINGÜNÜ(TARİH(2026;11;16);2)', 1],
  ['=GÜNSAY(TARİH(2026;12;31);TARİH(2026;1;1))', 364],
  ['=DÜŞEYARA(5;D1:E3;2;YANLIŞ)', 'beş'],
  ['=DÜŞEYARA(7;D1:E3;2)', 'beş'],
  ['=DÜŞEYARA(0;D1:E3;2)', '#YOK'],
  ['=DÜŞEYARA("ELMA";A1:B4;2;YANLIŞ)', 10],
  ['=YATAYARA(5;G1:I2;2;YANLIŞ)', 'b'],
  ['=YATAYARA(7;G1:I2;3)', '#BAŞV!'],
  ['=İNDİS(D1:E3;3;2)', 'on'],
  ['=KAÇINCI(10;D1:D3;0)', 3],
  ['=KAÇINCI(6;D1:D3)', 2],
  ['=ELEMAN(2;"bir";"iki";"üç")', 'iki'],
  ['=SUM(1;2)+AVERAGE(2;4)+IF(TRUE;1;0)', 7],
]

describe('işlevler', () => {
  it('en az 30 işlev var; her biri bir Türkçe ad taşır', () => {
    const all = listFunctions()
    expect(all.length).toBeGreaterThanOrEqual(30)
    for (const def of all) expect(def.names.length).toBeGreaterThan(0)
  })

  it.each(cases)('%s = %s', (formula, expected) => {
    const [actual] = evaluateAll([[formula, expected]], data)
    if (typeof expected === 'number') expect(actual).toBeCloseTo(expected, 10)
    else expect(actual).toBe(expected)
  })
})

describe('başvuru kaydırma ve pano', () => {
  const opts = { decimalComma: true }
  it('göreli kayar, mutlak kalır; dışa taşan #BAŞV! olur; yazım korunur', () => {
    expect(shiftFormula('=A1+$B$1+C$2+$D3', 1, 1, opts)).toBe('=B2+$B$1+D$2+$D4')
    expect(shiftFormula('=topla( A1:B2 ; 3)', 2, 0, opts)).toBe('=topla( A3:B4 ; 3)')
    expect(shiftFormula('=A1*2', -1, 0, opts)).toBe('=#BAŞV!*2')
    expect(shiftFormula('düz metin', 1, 1, opts)).toBe('düz metin')
  })

  it('TSV gidiş-dönüş: sekme, satır sonu ve tırnak korunur', () => {
    const rows = [
      ['a', 'b\tc', ''],
      ['"tırnak"', 'iki\nsatır', '=A1'],
    ]
    expect(parseTSV(toTSV(rows))).toEqual(rows)
    expect(parseTSV('1\t2\r\n3\t4\r\n')).toEqual([
      ['1', '2'],
      ['3', '4'],
    ])
  })
})
