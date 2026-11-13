/**
 * Zaman ve süre biçimleri (UX_SPEC §1 "Saat 24'lük", §2 "Canlı her öğe ilerleme + bitiş/kalan süre taşır").
 * Her yerde Türkiye saati ve 24 saat: "20:00–23:15", "42 dk kaldı", "Bugün 22:15", "1 sa 28 dk", "S1:B3".
 * Saf işlevler — birim testi: format.test.ts.
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

/** Kısa gün adları (Pazar = 0): "Cmt 20:00". */
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

/** Dakikadan süre: 42 → "42 dk", 88 → "1 sa 28 dk", 120 → "2 sa". 0 ya da geçersiz → "". */
export function formatMinutes(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return ''
  const m = Math.max(1, Math.round(min))
  if (m < 60) return `${m} dk`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h} sa ${r} dk` : `${h} sa`
}

/** Saniyeden çalışma süresi (Netflix bilgi satırı): 5280 → "1 sa 28 dk". */
export function formatRuntime(sec: number | null | undefined): string {
  if (!sec || sec <= 0) return ''
  return formatMinutes(sec / 60)
}

/** Kalan saniyeden: "23 dk kaldı" (İzlemeye Devam Et altyazısı). Bittiyse "". */
export function formatTimeLeft(remainingSec: number): string {
  if (!Number.isFinite(remainingSec) || remainingSec <= 0) return ''
  return `${formatMinutes(Math.ceil(remainingSec / 60))} kaldı`
}

/** Kalan dakika (yukarı yuvarlanır, en az 0). */
export function minutesLeft(end: DateInput, now: DateInput = Date.now()): number {
  return Math.max(0, Math.ceil((toDate(end).getTime() - toDate(now).getTime()) / 60_000))
}

/** Canlı yayının kalanı: "42 dk kaldı", "1 sa 12 dk kaldı"; bittiyse null. */
export function formatRemaining(end: DateInput, now: DateInput = Date.now()): string | null {
  const m = minutesLeft(end, now)
  return m > 0 ? `${formatMinutes(m)} kaldı` : null
}

/** "20:00–23:15 · 42 dk kaldı" — canlı öğenin zaman satırı. Başlamamışsa yalnız aralık. */
export function formatLiveLine(start: DateInput, end: DateInput, now: DateInput = Date.now()): string {
  const range = formatTimeRange(start, end)
  if (toDate(now).getTime() < toDate(start).getTime()) return range
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

/** Türkiye saatine göre gün numarası (gün farkı hesabı için). */
function dayNumber(d: Date): number {
  const [y, m, day] = dayFmt.format(d).split('-').map(Number)
  return Math.round(Date.UTC(y ?? 1970, (m ?? 1) - 1, day ?? 1) / 86_400_000)
}

/** Türkiye saatine göre haftanın günü (Pazar = 0). */
export function weekdayIndex(d: DateInput): number {
  return (((dayNumber(toDate(d)) + 4) % 7) + 7) % 7 // 1 Ocak 1970 Perşembe
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
  if (Math.abs(diff) < 7) return `${WEEKDAYS_SHORT[weekdayIndex(date)]} ${clock}`
  const [, m, day] = dayFmt.format(date).split('-').map(Number)
  return `${day} ${MONTHS_SHORT[(m ?? 1) - 1]} ${clock}`
}

/** "S1:B3" — bölüm kodu (Netflix "S1:E3"). */
export function formatEpisodeCode(season: number, episode: number): string {
  return `S${season}:B${episode}`
}

/** "2 Sezon" · "1 Sezon"; 0 ya da yoksa "". */
export function formatSeasons(count: number | null | undefined): string {
  return count && count > 0 ? `${count} Sezon` : ''
}

/** Noktalı bilgi parçalarını birleştirir, boşları atlar: joinDot(['2024', '', '1 sa']) → "2024 · 1 sa". */
export function joinDot(parts: (string | number | null | undefined | false)[]): string {
  return parts.filter((p) => p !== null && p !== undefined && p !== false && p !== '').join(' · ')
}
