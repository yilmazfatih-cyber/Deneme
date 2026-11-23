/**
 * Tarih yardımcıları. Son tarih gibi "gün" değerleri saat ve saat dilimi taşımaz: düz `YYYY-AA-GG`.
 * "Bugün" HER ZAMAN cihazın yerel gününe göre hesaplanır ve saat dışarıdan verilir (test edilebilsin diye).
 * Gösterim `Intl` ile Türkçe yapılır: "16 Kasım", "3 Ocak 2027", "Bugün". Kullanıcı girişi: "17.11.2026".
 *
 * Kaynak: uygulama/web/src/lib/date.ts (+ `parseDayInput`/`formatDayInput`: telefonda tarih kutusu yok).
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

/** "Bugün", "Yarın", "Dün", bu yıl içinde "16 Kasım", başka yılda "3 Ocak 2027". */
export function formatDay(iso: string, today: string): string {
  if (iso === today) return t('date.today')
  if (iso === addDays(today, 1)) return t('date.tomorrow')
  if (iso === addDays(today, -1)) return t('date.yesterday')
  const { year, month, day } = parseIsoDate(iso)
  const date = new Date(Date.UTC(year, month - 1, day))
  return year === parseIsoDate(today).year ? dayMonth.format(date) : dayMonthYear.format(date)
}

/** Kullanıcının yazdığı günü `YYYY-AA-GG`'ye çevirir: "17.11.2026", "17/11/2026", "2026-11-17". Geçersizse `null`. */
export function parseDayInput(text: string): string | null {
  const value = text.trim()
  let year: number
  let month: number
  let day: number
  const tr = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(value)
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value)
  if (tr) [day, month, year] = [Number(tr[1]), Number(tr[2]), Number(tr[3])]
  else if (iso) [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
  else return null
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return `${year}-${pad(month)}-${pad(day)}`
}

/** `YYYY-AA-GG` → "17.11.2026" (tarih kutusunda gösterim). */
export function formatDayInput(iso: string): string {
  const { year, month, day } = parseIsoDate(iso)
  return `${pad(day)}.${pad(month)}.${year}`
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
