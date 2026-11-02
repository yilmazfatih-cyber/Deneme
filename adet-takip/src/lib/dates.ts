// Tarihler her yerde "YYYY-AA-GG" biçiminde yerel gün dizgisi olarak taşınır (saat dilimi kaymaz).

export type ISODate = string

const pad = (n: number) => String(n).padStart(2, '0')

export function toISO(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function fromISO(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function today(): ISODate {
  return toISO(new Date())
}

export function addDays(iso: ISODate, days: number): ISODate {
  const d = fromISO(iso)
  d.setDate(d.getDate() + days)
  return toISO(d)
}

/** b − a, gün olarak (b sonra ise pozitif). */
export function diffDays(a: ISODate, b: ISODate): number {
  const ms =
    Date.UTC(fromISO(b).getFullYear(), fromISO(b).getMonth(), fromISO(b).getDate()) -
    Date.UTC(fromISO(a).getFullYear(), fromISO(a).getMonth(), fromISO(a).getDate())
  return Math.round(ms / 86_400_000)
}

export function isBetween(iso: ISODate, start: ISODate, end: ISODate): boolean {
  return iso >= start && iso <= end
}

export function startOfMonth(iso: ISODate): ISODate {
  return iso.slice(0, 8) + '01'
}

export function daysInMonth(iso: ISODate): number {
  const d = fromISO(iso)
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
}

export function addMonths(iso: ISODate, months: number): ISODate {
  const d = fromISO(startOfMonth(iso))
  d.setMonth(d.getMonth() + months)
  return toISO(d)
}

/** Pazartesi = 0 … Pazar = 6 */
export function weekdayIndex(iso: ISODate): number {
  return (fromISO(iso).getDay() + 6) % 7
}

export const WEEKDAYS_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']

export function formatLong(iso: ISODate): string {
  return fromISO(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' })
}

export function formatShort(iso: ISODate): string {
  return fromISO(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
}

export function formatMonthYear(iso: ISODate): string {
  return fromISO(iso).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
}

export function formatDayMonthYear(iso: ISODate): string {
  return fromISO(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
}
