/**
 * Tarih yardımcıları. Son tarih gibi "gün" değerleri saat ve saat dilimi taşımaz: düz `YYYY-AA-GG`.
 * "Bugün" HER ZAMAN cihazın yerel gününe göre hesaplanır ve saat dışarıdan verilir (test edilebilsin diye).
 * Gösterim `Intl` ile Türkçe yapılır: "16 Kasım", "3 Ocak 2027", "Bugün".
 *
 * Genişletme: yeni bir biçim gerekiyorsa buraya işlev ekleyin; testini test/lib/date.test.ts'e yazın.
 */
import { TR } from '@uygulama/shared'
import { t } from '../i18n/index.ts'

const pad = (value: number) => String(value).padStart(2, '0')

/** Verilen anın YEREL günü: `YYYY-AA-GG`. */
export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function parseIsoDate(iso: string): { year: number; month: number; day: number } {
  const [year = 1970, month = 1, day = 1] = iso.split('-').map(Number)
  return { year, month, day }
}

/** `YYYY-AA-GG` gününe gün ekler (eksi de olabilir). */
export function addDays(iso: string, days: number): string {
  const { year, month, day } = parseIsoDate(iso)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

/** Son tarihin bugüne göre durumu. */
export type DueState = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later'

export function dueState(dueDate: string, today: string): DueState {
  if (dueDate < today) return 'overdue'
  if (dueDate === today) return 'today'
  if (dueDate === addDays(today, 1)) return 'tomorrow'
  if (dueDate <= addDays(today, 7)) return 'week'
  return 'later'
}

const dayMonth = new Intl.DateTimeFormat(TR, { day: 'numeric', month: 'long', timeZone: 'UTC' })
const dayMonthYear = new Intl.DateTimeFormat(TR, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const weekday = new Intl.DateTimeFormat(TR, { weekday: 'long', timeZone: 'UTC' })

/** "Bugün", "Yarın", "Dün", bu yıl içinde "16 Kasım", başka yılda "3 Ocak 2027". */
export function formatDay(iso: string, today: string): string {
  if (iso === today) return t('date.today')
  if (iso === addDays(today, 1)) return t('date.tomorrow')
  if (iso === addDays(today, -1)) return t('date.yesterday')
  const { year, month, day } = parseIsoDate(iso)
  const date = new Date(Date.UTC(year, month - 1, day))
  return year === parseIsoDate(today).year ? dayMonth.format(date) : dayMonthYear.format(date)
}

/** Haftanın günü: "Pazartesi". */
export function formatWeekday(iso: string): string {
  const { year, month, day } = parseIsoDate(iso)
  return weekday.format(new Date(Date.UTC(year, month - 1, day)))
}

const dateTime = new Intl.DateTimeFormat(TR, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

/** Bir anı yerel saatle gösterir: "16 Kasım 14:05". */
export function formatDateTime(isoDateTime: string): string {
  return dateTime.format(new Date(isoDateTime))
}

const relative = new Intl.RelativeTimeFormat(TR, { numeric: 'auto' })

/** "az önce", "5 dakika önce", "2 saat önce", "dün"… */
export function formatRelative(isoDateTime: string, now: Date): string {
  const seconds = Math.round((new Date(isoDateTime).getTime() - now.getTime()) / 1000)
  const abs = Math.abs(seconds)
  if (abs < 45) return t('date.justNow')
  if (abs < 3600) return relative.format(Math.round(seconds / 60), 'minute')
  if (abs < 86_400) return relative.format(Math.round(seconds / 3600), 'hour')
  return relative.format(Math.round(seconds / 86_400), 'day')
}
