// Matematik ve istatistik işlevleri (Türkçe ad önce, İngilizce eş anlamlısı sonra).
// YUVARLA, Excel gibi "yarımı sıfırdan uzağa" yuvarlar ve ikili kayan nokta hatasını 15 anlamlı basamakla
// düzeltir: YUVARLA(1,005; 2) = 1,01 (düz Math.round 1,00 verirdi).
// Genişletme: YENİ İŞLEV BURAYA → `MATH` dizisine { names, min, max, fn } ekleyin.
import { isError, type CellValue } from '../values.ts'
import { makeCriteria } from './criteria.ts'
import {
  asMatrix,
  check,
  collectNumbers,
  collectValues,
  fail,
  finite,
  num,
  scalar,
  type FunctionDef,
  type Thunk,
  type FnContext,
} from './registry.ts'

/** Yarımı sıfırdan uzağa yuvarlar; `mode` yukarı/aşağı yuvarlamada da kullanılır. */
export function roundTo(value: number, digits: number, mode: 'nearest' | 'up' | 'down' = 'nearest'): number {
  const factor = 10 ** Math.trunc(digits)
  const scaled = Number((Math.abs(value) * factor).toPrecision(15))
  const rounded = mode === 'nearest' ? Math.round(scaled) : mode === 'up' ? Math.ceil(scaled) : Math.floor(scaled)
  return (Math.sign(value) * rounded) / factor
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0)

function conditional(args: Thunk[], ctx: FnContext, reduce: (values: number[]) => CellValue): CellValue {
  const range = asMatrix(check(args[0]?.() ?? null))
  const criterion = check(scalar(args[1]?.() ?? null))
  const target = args[2] ? asMatrix(check(args[2]())) : range
  const matches = makeCriteria(criterion, ctx.style)
  const picked: number[] = []
  range.forEach((row, r) =>
    row.forEach((cell, c) => {
      const value = target[r]?.[c] ?? null
      if (matches(cell) && typeof value === 'number') picked.push(value)
    }),
  )
  return reduce(picked)
}

export const MATH: FunctionDef[] = [
  { names: ['TOPLA', 'SUM'], min: 1, max: 255, fn: (a, ctx) => sum(collectNumbers(a, ctx)) },
  {
    names: ['ORTALAMA', 'AVERAGE'],
    min: 1,
    max: 255,
    fn: (a, ctx) => {
      const values = collectNumbers(a, ctx)
      return values.length === 0 ? fail('div0') : sum(values) / values.length
    },
  },
  {
    names: ['MİN', 'MIN'],
    min: 1,
    max: 255,
    fn: (a, ctx) =>
      collectNumbers(a, ctx).reduce<number | undefined>((m, v) => (m === undefined || v < m ? v : m), undefined) ?? 0,
  },
  {
    names: ['MAK', 'MAX'],
    min: 1,
    max: 255,
    fn: (a, ctx) =>
      collectNumbers(a, ctx).reduce<number | undefined>((m, v) => (m === undefined || v > m ? v : m), undefined) ?? 0,
  },
  {
    names: ['BAĞ_DEĞ_SAY', 'COUNT'],
    min: 1,
    max: 255,
    fn: (a) => collectValues(a).filter((v) => typeof v === 'number').length,
  },
  {
    names: ['BAĞ_DEĞ_DOLU_SAY', 'COUNTA'],
    min: 1,
    max: 255,
    fn: (a) => collectValues(a).filter((v) => v !== null).length,
  },
  {
    names: ['ÇARPIM', 'PRODUCT'],
    min: 1,
    max: 255,
    fn: (a, ctx) => finite(collectNumbers(a, ctx).reduce((x, y) => x * y, 1)),
  },
  { names: ['YUVARLA', 'ROUND'], min: 2, max: 2, fn: (a, ctx) => roundTo(num(a[0], ctx), num(a[1], ctx)) },
  {
    names: ['YUKARIYUVARLA', 'ROUNDUP'],
    min: 2,
    max: 2,
    fn: (a, ctx) => roundTo(num(a[0], ctx), num(a[1], ctx), 'up'),
  },
  {
    names: ['AŞAĞIYUVARLA', 'ROUNDDOWN'],
    min: 2,
    max: 2,
    fn: (a, ctx) => roundTo(num(a[0], ctx), num(a[1], ctx), 'down'),
  },
  { names: ['MUTLAK', 'ABS'], min: 1, max: 1, fn: (a, ctx) => Math.abs(num(a[0], ctx)) },
  {
    names: ['KAREKÖK', 'SQRT'],
    min: 1,
    max: 1,
    fn: (a, ctx) => {
      const n = num(a[0], ctx)
      return n < 0 ? fail('num', 'negatif sayının karekökü') : Math.sqrt(n)
    },
  },
  { names: ['KUVVET', 'POWER'], min: 2, max: 2, fn: (a, ctx) => finite(num(a[0], ctx) ** num(a[1], ctx)) },
  {
    names: ['MOD'],
    min: 2,
    max: 2,
    fn: (a, ctx) => {
      const n = num(a[0], ctx)
      const d = num(a[1], ctx)
      if (d === 0) fail('div0')
      return n - d * Math.floor(n / d)
    },
  },
  { names: ['TAMSAYI', 'INT'], min: 1, max: 1, fn: (a, ctx) => Math.floor(num(a[0], ctx)) },
  { names: ['Pİ', 'PI'], min: 0, max: 0, fn: () => Math.PI },
  {
    names: ['ORTANCA', 'MEDIAN'],
    min: 1,
    max: 255,
    fn: (a, ctx) => {
      const values = collectNumbers(a, ctx).sort((x, y) => x - y)
      if (values.length === 0) fail('num')
      const mid = values.length >> 1
      return values.length % 2 ? (values[mid] as number) : ((values[mid - 1] as number) + (values[mid] as number)) / 2
    },
  },
  { names: ['ETOPLA', 'SUMIF'], min: 2, max: 3, fn: (a, ctx) => conditional(a, ctx, sum) },
  {
    names: ['EĞERSAY', 'COUNTIF'],
    min: 2,
    max: 2,
    fn: (a, ctx) => {
      const matches = makeCriteria(check(scalar(a[1]?.() ?? null)), ctx.style)
      return asMatrix(check(a[0]?.() ?? null))
        .flat()
        .filter((v) => !isError(v) && matches(v)).length
    },
  },
  {
    names: ['EĞERORTALAMA', 'AVERAGEIF'],
    min: 2,
    max: 3,
    fn: (a, ctx) => conditional(a, ctx, (values) => (values.length === 0 ? fail('div0') : sum(values) / values.length)),
  },
]
