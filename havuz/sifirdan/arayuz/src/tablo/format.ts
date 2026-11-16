// Değerleri ekranda gösterme: sayılar Türkçe biçimle (binlik nokta, ondalık virgül), mantıksallar
// DOĞRU/YANLIŞ, hatalar Türkçe kodla. Düzenleme kutusunda ise ham giriş (formül) gösterilir.
// Genişletme: hücre biçimleri (para, yüzde, tarih) için `formatValue`'ya bir `format` parametresi ekleyin.
import { isError, type CellValue } from './values.ts'

const trNumber = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 10 })
const enNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 10, useGrouping: false })

export function formatValue(value: CellValue, decimalComma = true): string {
  if (value === null) return ''
  if (isError(value)) return value.code
  if (typeof value === 'boolean') return value ? 'DOĞRU' : 'YANLIŞ'
  if (typeof value === 'number') return (decimalComma ? trNumber : enNumber).format(Number(value.toPrecision(15)))
  return value
}

/** Hücre içeriği sağa mı (sayı) sola mı (metin) yaslanır? */
export function alignment(value: CellValue): 'start' | 'end' | 'center' {
  if (typeof value === 'number') return 'end'
  if (typeof value === 'boolean' || isError(value)) return 'center'
  return 'start'
}
