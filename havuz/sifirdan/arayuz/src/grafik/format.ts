// Türkçe sayı ve tarih biçimi: binlik ayraç nokta, ondalık virgül (1.234,5); kısa gösterim "1,2 B" (bin),
// "3,4 Mn" (milyon), "5 Mr" (milyar); yüzde "%26" (Türkçede % öne yazılır). Hepsi Intl.NumberFormat'tan
// gelir; yerel ayar tek yerde.
// Genişletme: para birimi için `currency` biçimleyicisi (`style: 'currency', currency: 'TRY'`) ekleyin.

export const LOCALE = 'tr-TR'

const plain = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 })
const compact = new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1 })
const percent = new Intl.NumberFormat(LOCALE, { style: 'percent', maximumFractionDigits: 1 })
const longDate = new Intl.DateTimeFormat(LOCALE, { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' })

export const formatNumber = (n: number) => plain.format(n)
/** Eksen için: 10.000 ve üstü kısaltılır. */
export const formatAxis = (n: number) => (Math.abs(n) >= 10_000 ? compact.format(n) : plain.format(n))
export const formatPercent = (ratio: number) => percent.format(ratio)
export const formatDate = (value: number | Date) => longDate.format(value)
