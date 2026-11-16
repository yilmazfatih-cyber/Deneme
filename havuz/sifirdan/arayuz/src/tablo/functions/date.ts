// Tarih işlevleri. Tarih bir "seri sayı"dır: 1899-12-30'dan bu yana geçen gün (Excel'in 1 Mart 1900 sonrası
// için kullandığı sistem). Hesaplar UTC üzerinde yapılır ki yaz saati/saat dilimi bir günü kaydırmasın.
// BUGÜN() saati dışarıdan alır (`ctx.now`): testlerde sabit bir tarih verilir.
// Genişletme: YENİ İŞLEV BURAYA → `DATE` dizisine ekleyin (ör. SERİAY/EOMONTH).
import { fail, num, type FunctionDef } from './registry.ts'

const DAY = 86_400_000
const EPOCH = Date.UTC(1899, 11, 30)

/** Yıl/ay/gün → seri sayı. Taşan ay ve günler normalleşir: TARİH(2026; 13; 1) = 2027-01-01. */
export function serialFromParts(year: number, month: number, day: number): number {
  return Math.round((Date.UTC(year, month - 1, day) - EPOCH) / DAY)
}

export function partsFromSerial(serial: number): { year: number; month: number; day: number; weekday: number } {
  if (!Number.isFinite(serial) || serial < 0) fail('num', 'geçersiz tarih')
  const date = new Date(EPOCH + Math.floor(serial) * DAY)
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    weekday: date.getUTCDay(),
  }
}

export const DATE: FunctionDef[] = [
  {
    names: ['TARİH', 'DATE'],
    min: 3,
    max: 3,
    fn: (a, ctx) => {
      const year = Math.trunc(num(a[0], ctx))
      if (year < 1900 || year > 9999) fail('num', 'yıl 1900–9999 arasında olmalı')
      return serialFromParts(year, Math.trunc(num(a[1], ctx)), Math.trunc(num(a[2], ctx)))
    },
  },
  { names: ['YIL', 'YEAR'], min: 1, max: 1, fn: (a, ctx) => partsFromSerial(num(a[0], ctx)).year },
  { names: ['AY', 'MONTH'], min: 1, max: 1, fn: (a, ctx) => partsFromSerial(num(a[0], ctx)).month },
  { names: ['GÜN', 'DAY'], min: 1, max: 1, fn: (a, ctx) => partsFromSerial(num(a[0], ctx)).day },
  {
    names: ['BUGÜN', 'TODAY'],
    min: 0,
    max: 0,
    fn: (_a, ctx) => {
      const now = ctx.now()
      return serialFromParts(now.getFullYear(), now.getMonth() + 1, now.getDate())
    },
  },
  {
    names: ['HAFTANINGÜNÜ', 'WEEKDAY'],
    min: 1,
    max: 2,
    fn: (a, ctx) => {
      const sunday0 = partsFromSerial(num(a[0], ctx)).weekday
      const type = num(a[1], ctx, 1)
      if (type === 1) return sunday0 + 1
      if (type === 2) return ((sunday0 + 6) % 7) + 1
      if (type === 3) return (sunday0 + 6) % 7
      return fail('num', 'tür 1, 2 ya da 3 olmalı')
    },
  },
  {
    names: ['GÜNSAY', 'DAYS'],
    min: 2,
    max: 2,
    fn: (a, ctx) => Math.trunc(num(a[0], ctx)) - Math.trunc(num(a[1], ctx)),
  },
]
