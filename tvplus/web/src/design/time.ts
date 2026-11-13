/**
 * Zaman biçimi yardımcıları (DESIGN_SPEC §1 "Saat biçimi", netflix_patterns §3 ilke 9).
 * Her yerde 24 saat, Türkiye saati: "20:00–23:15", "42 dk kaldı", "Bugün 22:15", "Dün 20:00", "Cmt 20:00".
 * Geri sayım ("42 dk kaldı") yalnızca son 60 dakikada gösterilir.
 */
import { TIME_ZONE } from '../../../shared/constants'

export type DateInput = Date | string | number

const toDate = (d: DateInput): Date => (d instanceof Date ? d : new Date(d))

const clockFmt = new Intl.DateTimeFormat('tr-TR', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: TIME_ZONE,
})
const dayFmt = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: TIME_ZONE,
})

/** Kısa gün adları (Pazar = 0), DESIGN_SPEC sözlüğüyle aynı: "Cmt 20:00". */
export const WEEKDAYS_SHORT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'] as const
const MONTHS_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'] as const

/** "20:00" */
export function formatClock(d: DateInput): string {
  return clockFmt.format(toDate(d))
}

/** "20:00–23:15" (en tire) */
export function formatTimeRange(start: DateInput, end: DateInput): string {
  return `${formatClock(start)}–${formatClock(end)}`
}

/** Türkiye saatine göre gün numarası (gün farkı hesabı için). */
function dayNumber(d: Date): number {
  const [y, m, day] = dayFmt.format(d).split('-').map(Number)
  return Math.round(Date.UTC(y ?? 1970, (m ?? 1) - 1, day ?? 1) / 86_400_000)
}

/** Türkiye saatine göre haftanın günü (Pazar = 0). */
export function weekdayIndex(d: DateInput): number {
  return (((dayNumber(toDate(d)) + 4) % 7) + 7) % 7 // 1 Ocak 1970 Perşembe
}

/** "Cmt" */
export function weekdayShort(d: DateInput): string {
  return WEEKDAYS_SHORT[weekdayIndex(d)] ?? ''
}

/** Kalan dakika (yukarı yuvarlanır, en az 0). */
export function minutesLeft(end: DateInput, now: DateInput = Date.now()): number {
  return Math.max(0, Math.ceil((toDate(end).getTime() - toDate(now).getTime()) / 60_000))
}

/** "42 dk kaldı" — yalnızca son 60 dakikada; öncesinde null (geri sayım gösterilmez). */
export function formatRemaining(end: DateInput, now: DateInput = Date.now()): string | null {
  const m = minutesLeft(end, now)
  if (m <= 0 || m > 60) return null
  return `${m} dk kaldı`
}

/** "20:00–23:15 · 42 dk kaldı" — canlı öğenin zaman satırı (son 60 dk dışında yalnızca aralık). */
export function formatLiveLine(start: DateInput, end: DateInput, now: DateInput = Date.now()): string {
  const range = formatTimeRange(start, end)
  const rem = formatRemaining(end, now)
  return rem ? `${range} · ${rem}` : range
}

/** Yayının ilerlemesi 0–1 (başlamadıysa 0, bittiyse 1). */
export function liveProgress(start: DateInput, end: DateInput, now: DateInput = Date.now()): number {
  const s = toDate(start).getTime()
  const e = toDate(end).getTime()
  if (!(e > s)) return 0
  return Math.min(1, Math.max(0, (toDate(now).getTime() - s) / (e - s)))
}

/**
 * Göreli gün + saat: "Bugün 22:15", "Dün 20:00", "Yarın 09:00", bir hafta içinde "Cmt 20:00",
 * daha uzakta "12 Kas 20:00".
 */
export function formatDayTime(d: DateInput, now: DateInput = Date.now()): string {
  const date = toDate(d)
  const diff = dayNumber(date) - dayNumber(toDate(now))
  const clock = formatClock(date)
  if (diff === 0) return `Bugün ${clock}`
  if (diff === -1) return `Dün ${clock}`
  if (diff === 1) return `Yarın ${clock}`
  if (Math.abs(diff) < 7) return `${weekdayShort(date)} ${clock}`
  const [, m, day] = dayFmt.format(date).split('-').map(Number)
  return `${day} ${MONTHS_SHORT[(m ?? 1) - 1]} ${clock}`
}
