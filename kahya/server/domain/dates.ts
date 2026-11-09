// Tarih yardımcıları. İş tarihleri 'YYYY-AA-GG' metnidir ve İstanbul saatine göre belirlenir.
// Hesaplar UTC gece yarısı üzerinden yapılır; yaz saati yoktur (Türkiye 2016'dan beri UTC+3).

export const TZ = 'Europe/Istanbul'
const DAY = 86_400_000

const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

export function today(now: Date = new Date()): string {
  return ymd.format(now)
}

export function nowIso(now: Date = new Date()): string {
  return now.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function isDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

export function isMonth(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s)
}

const toUtc = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)))
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export function addDays(date: string, n: number): string {
  return fromUtc(toUtc(date) + n * DAY)
}

/** b − a (gün). */
export function diffDays(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / DAY)
}

export function monthOf(date: string): string {
  return date.slice(0, 7)
}

export function addMonths(month: string, n: number): string {
  const y = Number(month.slice(0, 4))
  const m = Number(month.slice(5, 7)) - 1 + n
  const yy = y + Math.floor(m / 12)
  const mm = ((m % 12) + 12) % 12
  return `${yy}-${String(mm + 1).padStart(2, '0')}`
}

export function daysInMonth(month: string): number {
  const y = Number(month.slice(0, 4))
  const m = Number(month.slice(5, 7))
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** Ayın `day`. günü; ay kısa ise son günü. */
export function dateInMonth(month: string, day: number): string {
  const d = Math.min(Math.max(1, day), daysInMonth(month))
  return `${month}-${String(d).padStart(2, '0')}`
}

export function addMonthsToDate(date: string, n: number): string {
  return dateInMonth(addMonths(monthOf(date), n), Number(date.slice(8, 10)))
}

export function monthsBetween(fromMonth: string, toMonth: string): number {
  return (
    (Number(toMonth.slice(0, 4)) - Number(fromMonth.slice(0, 4))) * 12 +
    Number(toMonth.slice(5, 7)) -
    Number(fromMonth.slice(5, 7))
  )
}

const MONTHS = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
]

export function monthLabel(month: string): string {
  return `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`
}

export function dateLabel(date: string): string {
  return `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`
}

/** ISO zaman damgası → İstanbul yerel 'GG Ay YYYY SS:DD'. */
export function dateTimeLabel(iso: string): string {
  const d = new Date(iso)
  const date = today(d)
  const time = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(d)
  return `${dateLabel(date)} ${time}`
}

/** 'YYYY-AA-GGTSS:DD' (İstanbul yerel) → ISO UTC. */
export function localToIso(local: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(local)
  if (!m) throw new Error('Geçersiz tarih-saat')
  const ms = toUtc(m[1]!) + (Number(m[2]) - 3) * 3_600_000 + Number(m[3]) * 60_000
  return nowIso(new Date(ms))
}

/** ISO UTC → İstanbul yerel 'YYYY-AA-GGTSS:DD'. */
export function isoToLocal(iso: string): string {
  const ms = new Date(iso).getTime() + 3 * 3_600_000
  return new Date(ms).toISOString().slice(0, 16)
}
