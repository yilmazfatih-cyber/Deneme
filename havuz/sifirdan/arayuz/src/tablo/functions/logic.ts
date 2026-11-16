// Mantık ve bilgi işlevleri. EĞER ve EĞERHATA tembeldir: seçilmeyen dal hiç hesaplanmaz (ör. sıfıra bölme
// içeren dal seçilmezse hata çıkmaz).
// Genişletme: YENİ İŞLEV BURAYA → `LOGIC` dizisine ekleyin.
import { isError, isMatrix } from '../values.ts'
import { bool, check, collectValues, scalar, type FunctionDef } from './registry.ts'

function booleans(values: ReturnType<typeof collectValues>): boolean[] {
  return values
    .filter((v) => typeof check(v) === 'boolean' || typeof v === 'number')
    .map((v) => v === true || (typeof v === 'number' && v !== 0))
}

export const LOGIC: FunctionDef[] = [
  {
    names: ['EĞER', 'IF'],
    min: 1,
    max: 3,
    fn: (a, ctx) => (bool(a[0], ctx) ? scalar(a[1]?.() ?? true) : a[2] ? scalar(a[2]()) : false),
  },
  {
    names: ['VE', 'AND'],
    min: 1,
    max: 255,
    fn: (a, ctx) => a.every((t) => (isMatrix(t()) ? booleans(collectValues([t])).every(Boolean) : bool(t, ctx))),
  },
  {
    names: ['YADA', 'OR'],
    min: 1,
    max: 255,
    fn: (a, ctx) => a.some((t) => (isMatrix(t()) ? booleans(collectValues([t])).some(Boolean) : bool(t, ctx))),
  },
  { names: ['DEĞİL', 'NOT'], min: 1, max: 1, fn: (a, ctx) => !bool(a[0], ctx) },
  {
    names: ['EĞERHATA', 'IFERROR'],
    min: 2,
    max: 2,
    fn: (a) => {
      const value = scalar(a[0]?.() ?? null)
      return isError(value) ? scalar(a[1]?.() ?? null) : value
    },
  },
  { names: ['EHATALIYSA', 'ISERROR'], min: 1, max: 1, fn: (a) => isError(scalar(a[0]?.() ?? null)) },
  { names: ['EBOŞSA', 'ISBLANK'], min: 1, max: 1, fn: (a) => scalar(a[0]?.() ?? null) === null },
  { names: ['ESAYIYSA', 'ISNUMBER'], min: 1, max: 1, fn: (a) => typeof scalar(a[0]?.() ?? null) === 'number' },
  { names: ['EMETİNSE', 'ISTEXT'], min: 1, max: 1, fn: (a) => typeof scalar(a[0]?.() ?? null) === 'string' },
]
