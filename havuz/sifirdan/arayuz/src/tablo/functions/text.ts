// Metin işlevleri. Konum ve uzunluk "kullanıcının gördüğü karakter" (grafem) üzerinden sayılır: UZUNLUK("👍🏽")
// = 1 (Excel 4 der; bilinçli fark, README'de). Büyük/küçük harf Türkçe kuralla: BÜYÜKHARF("istanbul") =
// "İSTANBUL", KÜÇÜKHARF("IĞDIR") = "ığdır".
// Genişletme: YENİ İŞLEV BURAYA → `TEXT` dizisine ekleyin.
import { fail, num, text, type FunctionDef } from './registry.ts'

const segmenter = new Intl.Segmenter('tr', { granularity: 'grapheme' })
export const graphemes = (value: string): string[] => [...segmenter.segment(value)].map((s) => s.segment)

function count(n: number): number {
  if (n < 0) fail('value', 'karakter sayısı negatif olamaz')
  return Math.trunc(n)
}

export const TEXT: FunctionDef[] = [
  {
    names: ['BİRLEŞTİR', 'CONCATENATE', 'CONCAT'],
    min: 1,
    max: 255,
    fn: (a, ctx) => a.map((t) => text(t, ctx)).join(''),
  },
  { names: ['UZUNLUK', 'LEN'], min: 1, max: 1, fn: (a, ctx) => graphemes(text(a[0], ctx)).length },
  { names: ['BÜYÜKHARF', 'UPPER'], min: 1, max: 1, fn: (a, ctx) => text(a[0], ctx).toLocaleUpperCase('tr-TR') },
  { names: ['KÜÇÜKHARF', 'LOWER'], min: 1, max: 1, fn: (a, ctx) => text(a[0], ctx).toLocaleLowerCase('tr-TR') },
  {
    names: ['YAZIM.DÜZENİ', 'PROPER'],
    min: 1,
    max: 1,
    fn: (a, ctx) =>
      text(a[0], ctx)
        .toLocaleLowerCase('tr-TR')
        .replace(/(^|[^\p{L}])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toLocaleUpperCase('tr-TR')),
  },
  {
    names: ['SOLDAN', 'LEFT'],
    min: 1,
    max: 2,
    fn: (a, ctx) =>
      graphemes(text(a[0], ctx))
        .slice(0, count(num(a[1], ctx, 1)))
        .join(''),
  },
  {
    names: ['SAĞDAN', 'RIGHT'],
    min: 1,
    max: 2,
    fn: (a, ctx) => {
      const n = count(num(a[1], ctx, 1))
      return n === 0 ? '' : graphemes(text(a[0], ctx)).slice(-n).join('')
    },
  },
  {
    names: ['PARÇAAL', 'MID'],
    min: 3,
    max: 3,
    fn: (a, ctx) => {
      const start = num(a[1], ctx)
      if (start < 1) fail('value', 'başlangıç 1 ya da büyük olmalı')
      return graphemes(text(a[0], ctx))
        .slice(start - 1, start - 1 + count(num(a[2], ctx)))
        .join('')
    },
  },
  { names: ['KIRP', 'TRIM'], min: 1, max: 1, fn: (a, ctx) => text(a[0], ctx).trim().replace(/ {2,}/g, ' ') },
  { names: ['YİNELE', 'REPT'], min: 2, max: 2, fn: (a, ctx) => text(a[0], ctx).repeat(count(num(a[1], ctx))) },
  {
    names: ['BUL', 'FIND'],
    min: 2,
    max: 3,
    fn: (a, ctx) => {
      const needle = text(a[0], ctx)
      const haystack = graphemes(text(a[1], ctx))
      const from = num(a[2], ctx, 1)
      for (let i = Math.max(0, from - 1); i < haystack.length; i++) {
        if (haystack.slice(i).join('').startsWith(needle)) return i + 1
      }
      return fail('value', 'aranan metin bulunamadı')
    },
  },
  {
    names: ['YERİNEKOY', 'SUBSTITUTE'],
    min: 3,
    max: 4,
    fn: (a, ctx) => {
      const source = text(a[0], ctx)
      const old = text(a[1], ctx)
      const replacement = text(a[2], ctx)
      if (old === '') return source
      if (!a[3]) return source.split(old).join(replacement)
      const which = num(a[3], ctx)
      let index = -1
      for (let n = 0; n < which; n++) {
        index = source.indexOf(old, index + 1)
        if (index === -1) return source
      }
      return source.slice(0, index) + replacement + source.slice(index + old.length)
    },
  },
]
