// Arama işlevleri: DÜŞEYARA/YATAYARA (tablonun ilk sütununda/satırında ara, aynı satırdan/sütundan değer al),
// İNDİS (konumdan değer), KAÇINCI (değerin konumu), ELEMAN (listeden seç). Yaklaşık eşleme (sıralı veri)
// ikili aramayla "aranandan küçük ya da eşit en büyük" değeri bulur. Metin eşlemesi Türkçe ve harf duyarsız.
// Genişletme: YENİ İŞLEV BURAYA → `LOOKUP` dizisine ekleyin (ör. ÇAPRAZARA/XLOOKUP).
import { compareValues, isError, type CellValue } from '../values.ts'
import { asMatrix, bool, check, fail, num, scalar, type FunctionDef } from './registry.ts'

/** Sıralı dizide `target`'tan küçük ya da eşit son öğenin indisi (yoksa -1). */
function approximateIndex(values: CellValue[], target: CellValue): number {
  let lo = 0
  let hi = values.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (compareValues(values[mid] ?? null, target) <= 0) {
      found = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return found
}

function exactIndex(values: CellValue[], target: CellValue): number {
  return values.findIndex(
    (v) => !isError(v) && v !== null && typeof v === typeof target && compareValues(v, target) === 0,
  )
}

function tableLookup(vertical: boolean): FunctionDef['fn'] {
  return (a, ctx) => {
    const target = check(scalar(a[0]?.() ?? null))
    const table = asMatrix(check(a[1]?.() ?? null))
    const offset = Math.trunc(num(a[2], ctx))
    const approximate = bool(a[3], ctx, true)
    const keys = vertical ? table.map((row) => row[0] ?? null) : (table[0] ?? [])
    const width = vertical ? (table[0]?.length ?? 0) : table.length
    if (offset < 1 || offset > width) fail('ref', 'sütun/satır numarası tablonun dışında')
    const index = approximate ? approximateIndex(keys, target) : exactIndex(keys, target)
    if (index < 0) fail('na', 'aranan değer bulunamadı')
    return (vertical ? table[index]?.[offset - 1] : table[offset - 1]?.[index]) ?? null
  }
}

export const LOOKUP: FunctionDef[] = [
  { names: ['DÜŞEYARA', 'VLOOKUP'], min: 3, max: 4, fn: tableLookup(true) },
  { names: ['YATAYARA', 'HLOOKUP'], min: 3, max: 4, fn: tableLookup(false) },
  {
    names: ['İNDİS', 'INDEX'],
    min: 2,
    max: 3,
    fn: (a, ctx) => {
      const table = asMatrix(check(a[0]?.() ?? null))
      let row = Math.trunc(num(a[1], ctx))
      let col = Math.trunc(num(a[2], ctx, 1))
      if (table.length === 1 && a.length === 2) [row, col] = [1, row]
      const value = table[row - 1]?.[col - 1]
      return value === undefined || row < 1 || col < 1 ? fail('ref', 'konum aralığın dışında') : value
    },
  },
  {
    names: ['KAÇINCI', 'MATCH'],
    min: 2,
    max: 3,
    fn: (a, ctx) => {
      const target = check(scalar(a[0]?.() ?? null))
      const values = asMatrix(check(a[1]?.() ?? null)).flat()
      const mode = num(a[2], ctx, 1)
      let index: number
      if (mode === 0) index = exactIndex(values, target)
      else if (mode > 0) index = approximateIndex(values, target)
      else index = values.reduce<number>((best, v, i) => (compareValues(v, target) >= 0 ? i : best), -1)
      return index < 0 ? fail('na', 'aranan değer bulunamadı') : index + 1
    },
  },
  {
    names: ['ELEMAN', 'CHOOSE'],
    min: 2,
    max: 255,
    fn: (a, ctx) => {
      const index = Math.trunc(num(a[0], ctx))
      const chosen = a[index]
      return index < 1 || !chosen ? fail('value', 'sıra numarası listenin dışında') : scalar(chosen())
    },
  },
]
