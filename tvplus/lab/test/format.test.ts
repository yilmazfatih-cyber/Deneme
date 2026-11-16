/**
 * Kompakt metin çıktısı (lab/src/core/format.ts): sayı, yüzde, yüzde puanı, göreli değişim, çarpan ve p değeri
 * biçimleri (belge yorumlarındaki örneklerle), hizalı tablo (satır bütçesi, kırpma), gün ↔ tarih dönüşümü ve
 * küçük yardımcılar.
 */
import { describe, expect, it } from 'vitest'
import {
  bar,
  ci,
  clip,
  dayNum,
  dayStr,
  kv,
  num,
  pct,
  pp,
  pval,
  rel,
  spark,
  table,
  times,
  type Col,
} from '../src/core/format'

describe('num: kısaltılmış sayı', () => {
  it.each([
    [1234567, '1.23M'],
    [12345, '12.3K'],
    [123.4, '123'],
    [12.34, '12.3'],
    [0.01234, '0.0123'],
  ])('belge örneği: %d → %s', (x, expected) => {
    expect(num(x)).toBe(expected)
  })

  it('tam sayılar 10 binin altında olduğu gibi yazılır', () => {
    expect(num(0)).toBe('0')
    expect(num(-0)).toBe('0')
    expect(num(7)).toBe('7')
    expect(num(999)).toBe('999')
    expect(num(1000)).toBe('1000')
    expect(num(9999)).toBe('9999')
  })

  it('büyüklük sınırları: K, M, Mr', () => {
    expect(num(10_000)).toBe('10K')
    expect(num(99_999)).toBe('100K')
    expect(num(999_499)).toBe('999K')
    expect(num(1_000_000)).toBe('1M')
    expect(num(123_456_789)).toBe('123M')
    expect(num(1_000_000_000)).toBe('1Mr')
    expect(num(1_500_000_000)).toBe('1.5Mr')
    expect(num(10_000.4)).toBe('10K')
  })

  it('ondalıklar büyüklüğe göre yuvarlanır, sondaki sıfırlar atılır', () => {
    expect(num(0.5)).toBe('0.5')
    expect(num(0.999)).toBe('0.999')
    expect(num(0.9999)).toBe('1')
    expect(num(1.005)).toBe('1')
    expect(num(17.25)).toBe('17.3')
    expect(num(99.96)).toBe('100')
    expect(num(9.996)).toBe('10')
    expect(num(999.6)).toBe('1000')
    expect(num(1234.5)).toBe('1235')
    expect(num(0.1 + 0.2)).toBe('0.3')
    // Çok küçük değerler üstel yazılır
    expect(num(1e-7)).toBe('1.00e-7')
  })

  it('negatifler gerçek eksi işaretiyle (−), eksik değerler kısa çizgiyle (–)', () => {
    expect(num(-1)).toBe('−1')
    expect(num(-12345)).toBe('−12.3K')
    expect(num(-0.5)).toBe('−0.5')
    expect(num(null)).toBe('–')
    expect(num(undefined)).toBe('–')
    expect(num(NaN)).toBe('–')
    expect(num(Infinity)).toBe('∞')
    expect(num(-Infinity)).toBe('−∞')
  })

  it('10 bin ile 1 trilyon arasında hiçbir değer üstel yazıma düşmez (yuvarlama sınırları dahil)', () => {
    // 999 500 … 999 999 üç anlamlı basamakta 1000'e yuvarlanır: "1M" (ya da "1000K") beklenir, "1.00e+3K" değil
    const samples = [
      999_500, 999_999, 999_999.9, 999_500_000, 999_999_999, 99_950, 9_995_000, 99_999_999, 314_159_265_358,
    ]
    for (let e = 4.1; e < 12; e += 0.37) samples.push(Math.round(10 ** e), 10 ** e * 0.9996)
    const bad = samples.filter((x) => !/^\d+(\.\d+)?(K|M|Mr)$/.test(num(x))).map((x) => `${x} → ${num(x)}`)
    expect(bad).toEqual([])
    expect(num(-999_999)).not.toMatch(/e\+/)
  })
})

describe('pct, pp, rel, times, pval', () => {
  it.each([
    ['pct', () => pct(0.2345), '%23.5'],
    ['pp', () => pp(0.021), '+2.1p'],
    ['rel', () => rel(0.123), '+%12.3'],
    ['times', () => times(2.31), '2.31x'],
    ['pval', () => pval(0.00003), '<0.001'],
  ])('belge örneği: %s', (_name, f, expected) => {
    expect(f()).toBe(expected)
  })

  it('pct: oran → yüzde, basamak sayısı ayarlanabilir', () => {
    expect(pct(0)).toBe('%0')
    expect(pct(1)).toBe('%100')
    expect(pct(0.5)).toBe('%50')
    expect(pct(0.123456)).toBe('%12.3')
    expect(pct(0.2346)).toBe('%23.5')
    expect(pct(0.2346, 0)).toBe('%23')
    expect(pct(0.2346, 2)).toBe('%23.46')
    expect(pct(1.5)).toBe('%150')
    expect(pct(0.0005)).toBe('%0.1')
    expect(pct(null)).toBe('–')
    expect(pct(undefined)).toBe('–')
    expect(pct(NaN)).toBe('–')
  })

  it('pp: işaretli yüzde puanı', () => {
    expect(pp(-0.021)).toBe('−2.1p')
    expect(pp(0.5)).toBe('+50p')
    expect(pp(0)).toBe('+0p')
    expect(pp(0.0216, 2)).toBe('+2.16p')
    expect(pp(NaN)).toBe('–')
    expect(pp(null)).toBe('–')
  })

  it('rel: işaretli göreli değişim', () => {
    expect(rel(-0.123)).toBe('−%12.3')
    expect(rel(1)).toBe('+%100')
    expect(rel(2.5)).toBe('+%250')
    expect(rel(0)).toBe('+%0')
    expect(rel(0.1234, 2)).toBe('+%12.34')
    expect(rel(NaN)).toBe('–')
    expect(rel(undefined)).toBe('–')
  })

  it('times: çarpan (10 ve üstünde tek ondalık)', () => {
    expect(times(1)).toBe('1x')
    expect(times(0.5)).toBe('0.5x')
    expect(times(12.345)).toBe('12.3x')
    expect(times(9.999)).toBe('10x')
    expect(times(10)).toBe('10x')
    expect(times(0)).toBe('0x')
    expect(times(NaN)).toBe('–')
    expect(times(null)).toBe('–')
  })

  it('pval: üç ondalık, çok küçükler <0.001', () => {
    expect(pval(0.0009999)).toBe('<0.001')
    expect(pval(0)).toBe('<0.001')
    expect(pval(0.001)).toBe('0.001')
    expect(pval(0.0123)).toBe('0.012')
    expect(pval(0.05)).toBe('0.05')
    expect(pval(0.5)).toBe('0.5')
    expect(pval(1)).toBe('1')
    expect(pval(NaN)).toBe('–')
    expect(pval(null)).toBe('–')
    expect(pval(undefined)).toBe('–')
  })

  it('ci: aralık, verilen biçimleyiciyle', () => {
    expect(ci(0.1234, 5.678)).toBe('[0.123, 5.68]')
    expect(ci(0.1, 0.25, pct)).toBe('[%10, %25]')
    expect(ci(0.87, 2.5, times)).toBe('[0.87x, 2.5x]')
  })
})

describe('table: hizalı düz metin', () => {
  interface Row {
    ad: string
    n: number
    oran: number
    p: number
    not: string
    ok: boolean
    bos: number | null
  }
  const rows: Row[] = [
    { ad: 'TV', n: 12345, oran: 0.25, p: 0.00003, not: 'çok uzun bir açıklama metni burada', ok: true, bos: null },
    { ad: 'MOBIL cihaz', n: 7, oran: 0.5, p: 0.04, not: 'kısa', ok: false, bos: 3 },
    { ad: 'WEB', n: 1234567, oran: 0.01, p: 0.5, not: 'orta boy metin', ok: true, bos: 1.5 },
  ]
  const cols: Col<Row>[] = [
    { h: 'ad', v: 'ad' },
    { h: 'n', v: 'n' },
    { h: 'oran', v: 'oran', f: 'pct' },
    { h: 'p', v: 'p', f: 'p' },
    { h: 'açıklama', v: 'not', max: 10 },
    { h: 'ok', v: 'ok' },
    { h: 'boş', v: 'bos' },
    { h: 'işlev', v: (r) => r.n * 2, f: (v) => `<${String(v)}>` },
  ]

  it('metin sola, sayı sağa yaslanır; biçimler uygulanır; satır sonunda boşluk kalmaz', () => {
    expect(table(rows, cols).split('\n')).toEqual([
      'ad               n  oran       p  açıklama    ok     boş  işlev',
      'TV           12.3K   %25  <0.001  çok uzun …  evet     –  <24690>',
      'MOBIL cihaz      7   %50    0.04  kısa        hayır    3  <14>',
      'WEB          1.23M    %1     0.5  orta boy …  evet   1.5  <2469134>',
    ])
  })

  it('her satırda sütunlar aynı konumda başlar ya da biter', () => {
    const lines = table(rows, cols.slice(0, 4)).split('\n')
    // Sola yaslı ilk sütun: değerler 0. konumda; sağa yaslı sütunlar: bitiş konumları eşit
    for (const l of lines) expect(l).not.toMatch(/^\s/)
    const ends = (text: string): number[] => [...text.matchAll(/\S(?=\s|$)/g)].map((m) => m.index).slice(-3)
    for (const l of lines.slice(1)) expect(ends(l)).toEqual(ends(lines[0]))
    expect(new Set(lines.map((l) => l.length)).size).toBe(1)
  })

  it('limit: satır bütçesi aşılınca "+N satır daha" yazılır (ipucuyla)', () => {
    const out = table(rows, cols.slice(0, 2), { limit: 2, more: '--limit 50' }).split('\n')
    expect(out).toHaveLength(4)
    expect(out[3]).toBe('… +1 satır daha (--limit 50)')
    expect(out.join('\n')).not.toMatch(/WEB/)
    // İpucu verilmezse yalnız sayı; bütçe yetiyorsa not yok
    expect(table(rows, cols.slice(0, 2), { limit: 1 }).split('\n')[2]).toBe('… +2 satır daha')
    expect(table(rows, cols.slice(0, 2), { limit: 3 })).not.toMatch(/satır daha/)
    expect(table(rows, cols.slice(0, 2), { limit: 10 }).split('\n')).toHaveLength(4)
    expect(table(rows, cols.slice(0, 1), { limit: 0 }).split('\n')).toEqual(['ad', '… +3 satır daha'])
  })

  it('max: uzun metin … ile kesilir ve hücre sınırı aşmaz', () => {
    const out = table(rows, [
      { h: 'açıklama', v: 'not', max: 12 },
      { h: 'n', v: 'n' },
    ]).split('\n')
    expect(out.slice(1).map((l) => l.slice(0, 12).trimEnd())).toEqual(['çok uzun bi…', 'kısa', 'orta boy me…'])
    // Kesilen sütunun genişliği sınırdır: sonraki sütun 12 + 2 boşluktan sonra gelir (sağa yaslı, 5 karakter)
    for (const l of out) expect(l).toHaveLength(12 + 2 + 5)
    // Sınıra sığan metne dokunulmaz
    expect(table(rows, [{ h: 'ad', v: 'ad', max: 11 }]).split('\n')[2]).toBe('MOBIL cihaz')
  })

  it('girinti, elle hizalama ve boş tablo', () => {
    const out = table(rows, cols.slice(0, 2), { indent: '  ', limit: 2, more: 'x' }).split('\n')
    for (const l of out) expect(l.startsWith('  ')).toBe(true)
    expect(out[3]).toBe('  … +1 satır daha (x)')
    expect(
      table(rows, [
        { h: 'n', v: 'n', align: 'l' },
        { h: 'ad', v: 'ad', align: 'r' },
      ]).split('\n'),
    ).toEqual(['n               ad', '12.3K           TV', '7      MOBIL cihaz', '1.23M          WEB'])
    expect(table([] as Row[], cols.slice(0, 2))).toBe('ad  n')
  })

  it('biçim kısaltmaları: pct, pp, rel, x, p ve düz metin (s)', () => {
    const out = table(rows.slice(0, 1), [
      { h: 'a', v: 'oran', f: 'pct' },
      { h: 'b', v: 'oran', f: 'pp' },
      { h: 'c', v: 'oran', f: 'rel' },
      { h: 'd', v: 'oran', f: 'x' },
      { h: 'e', v: 'p', f: 'p' },
      { h: 'f', v: 'n', f: 's' },
    ]).split('\n')[1]
    expect(out.trim().split(/\s+/)).toEqual(['%25', '+25p', '+%25', '0.25x', '<0.001', '12.3K'])
  })
})

describe('gün ↔ tarih', () => {
  it('dayStr ve dayNum birbirinin tersidir', () => {
    expect(dayStr(0)).toBe('1970-01-01')
    expect(dayNum('1970-01-01')).toBe(0)
    expect(dayStr(20768)).toBe('2026-11-11')
    expect(dayNum('2026-11-11')).toBe(20768)
    expect(dayStr(dayNum('2024-02-29'))).toBe('2024-02-29')
    for (let d = 19_000; d < 21_500; d += 7) expect(dayNum(dayStr(d))).toBe(d)
    for (const iso of ['2025-12-31', '2026-01-01', '2026-03-29', '2026-10-25', '2000-02-29'])
      expect(dayStr(dayNum(iso))).toBe(iso)
    // Ardışık günler ardışık numara alır (yaz saati geçişlerinde de)
    expect(dayNum('2026-03-30') - dayNum('2026-03-29')).toBe(1)
    expect(dayNum('2026-01-01') - dayNum('2025-12-31')).toBe(1)
  })

  it('geçersiz tarih Türkçe hata verir', () => {
    expect(() => dayNum('yarin')).toThrow(/Geçersiz tarih: yarin/)
    expect(() => dayNum('2026-13-45')).toThrow(/beklenen YYYY-AA-GG/)
    expect(() => dayNum('')).toThrow(/Geçersiz tarih/)
  })
})

describe('küçük yardımcılar', () => {
  it('kv: boş değerler atlanır, sayılar kısaltılır', () => {
    expect(kv({ a: 1234567, b: 'x', c: null, d: undefined, e: '', f: 0 })).toBe('a: 1.23M · b: x · f: 0')
    expect(kv({})).toBe('')
  })

  it('clip: satır bütçesi', () => {
    expect(clip('a\nb\nc\nd', 2, '--limit 4')).toBe('a\nb\n… +2 satır daha (--limit 4)')
    expect(clip('a\nb\nc', 2)).toBe('a\nb\n… +1 satır daha')
    expect(clip('a\nb', 2)).toBe('a\nb')
  })

  it('bar ve spark: metin grafikleri', () => {
    expect(bar(0)).toBe('··········')
    expect(bar(0.5)).toBe('▇▇▇▇▇·····')
    expect(bar(1)).toBe('▇▇▇▇▇▇▇▇▇▇')
    // Aralık dışı değerler kırpılır; genişlik sabit kalır
    expect(bar(1.7)).toBe('▇▇▇▇▇▇▇▇▇▇')
    expect(bar(-1)).toBe('··········')
    expect(bar(0.25, 4)).toBe('▇···')
    expect(spark([1, 2, 3, 4, 5, 6, 7, 8])).toBe('▁▂▃▄▅▆▇█')
    expect(spark([5, 5, 5])).toBe('▄▄▄')
    expect(spark([1, NaN, 3])).toBe('▁ █')
    expect(spark([])).toBe('')
  })
})
