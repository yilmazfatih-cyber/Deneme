/**
 * Rehber ızgarasının saf hesapları: gün penceresi (Türkiye saati), zaman → piksel, 30 dakikalık çentikler,
 * program bloklarının pencere kenarlarında kırpılması ve ilk kaydırma konumu.
 *
 * Pencere (her gün için aynı kural): o günün 06:00'sı → ertesi gün 02:00.
 * "Bugün" için şimdi bu aralığın dışındaysa (gece 00:00–06:00) pencere şimdiyi kapsayacak kadar genişler.
 */
import { TIME_ZONE } from '../../../../shared/constants'

export const MIN_MS = 60_000
export const SLOT_MIN = 30
/** Web ızgarası ölçeği: 30 dk = 180 px */
export const PX_PER_MIN = 6
export const DAY_START_HOUR = 6
export const DAY_END_HOUR = 2

export type DayOffset = -1 | 0 | 1

const partsFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

export interface ZonedParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

/** Bir anın Türkiye saatindeki takvim parçaları. */
export function zonedParts(t: number): ZonedParts & { second: number } {
  const p: Record<string, number> = {}
  for (const part of partsFmt.formatToParts(new Date(t))) if (part.type !== 'literal') p[part.type] = Number(part.value)
  return {
    year: p.year ?? 1970,
    month: p.month ?? 1,
    day: p.day ?? 1,
    hour: p.hour ?? 0,
    minute: p.minute ?? 0,
    second: p.second ?? 0,
  }
}

/** Türkiye saatindeki duvar saati → epoch ms (gün taşmaları Date.UTC ile düzelir). */
export function zonedTime(year: number, month: number, day: number, hour = 0, minute = 0): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute)
  const p = zonedParts(guess)
  const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - guess
  return guess - offset
}

export interface GuideWindow {
  from: number
  to: number
}

const floorTo = (t: number, step: number) => Math.floor(t / step) * step
const ceilTo = (t: number, step: number) => Math.ceil(t / step) * step

/** Gün penceresi. `day` şimdiye göre: -1 Dün, 0 Bugün, 1 Yarın. */
export function dayWindow(day: DayOffset, now: number): GuideWindow {
  const p = zonedParts(now)
  const from = zonedTime(p.year, p.month, p.day + day, DAY_START_HOUR)
  const to = zonedTime(p.year, p.month, p.day + day + 1, DAY_END_HOUR)
  if (day !== 0) return { from, to }
  const slot = SLOT_MIN * MIN_MS
  return {
    from: Math.min(from, floorTo(now - 60 * MIN_MS, slot)),
    to: Math.max(to, ceilTo(now + 60 * MIN_MS, slot)),
  }
}

export const timeToPx = (t: number, w: GuideWindow, pxPerMin = PX_PER_MIN): number => ((t - w.from) / MIN_MS) * pxPerMin
export const windowWidth = (w: GuideWindow, pxPerMin = PX_PER_MIN): number => timeToPx(w.to, w, pxPerMin)

export interface Tick {
  t: number
  px: number
  /** "20:00" — tam saatlerde vurgulu */
  label: string
  major: boolean
}

/** 30 dakikalık çentikler (24 saat biçimi), pencerenin başından sonuna. */
export function ticks(w: GuideWindow, pxPerMin = PX_PER_MIN): Tick[] {
  const out: Tick[] = []
  const slot = SLOT_MIN * MIN_MS
  for (let t = ceilTo(w.from, slot); t < w.to; t += slot) {
    const p = zonedParts(t)
    out.push({
      t,
      px: timeToPx(t, w, pxPerMin),
      label: `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`,
      major: p.minute === 0,
    })
  }
  return out
}

export interface BlockLayout<T> {
  item: T
  left: number
  width: number
  /** Program pencerenin başlangıcından önce başlıyor (sol kenar kırpıldı) */
  clippedStart: boolean
  /** Program pencerenin sonundan sonra bitiyor */
  clippedEnd: boolean
}

/** Programları pencereye yerleştirir: dışarıda kalanlar atlanır, taşanlar kenarda kırpılır. */
export function layoutBlocks<T extends { startAt: string; endAt: string }>(
  items: readonly T[],
  w: GuideWindow,
  pxPerMin = PX_PER_MIN,
): BlockLayout<T>[] {
  const out: BlockLayout<T>[] = []
  for (const item of items) {
    const s = Date.parse(item.startAt)
    const e = Date.parse(item.endAt)
    const a = Math.max(s, w.from)
    const b = Math.min(e, w.to)
    if (!(b > a)) continue
    out.push({
      item,
      left: timeToPx(a, w, pxPerMin),
      width: timeToPx(b, w, pxPerMin) - timeToPx(a, w, pxPerMin),
      clippedStart: s < w.from,
      clippedEnd: e > w.to,
    })
  }
  return out.sort((x, y) => x.left - y.left)
}

/** "Şimdi" çizgisinin konumu; pencere dışındaysa null. */
export function nowPx(now: number, w: GuideWindow, pxPerMin = PX_PER_MIN): number | null {
  if (now < w.from || now > w.to) return null
  return timeToPx(now, w, pxPerMin)
}

/** İlk kaydırma: şimdi görünür olsun, solunda 30 dk geçmiş kalsın. Pencere dışındaysa 0. */
export function initialScrollLeft(now: number, w: GuideWindow, pxPerMin = PX_PER_MIN): number {
  const x = nowPx(now, w, pxPerMin)
  if (x === null) return 0
  return Math.max(0, x - SLOT_MIN * pxPerMin)
}

/** Mobil liste: seçili kanalın yayınlarını "Şimdi", "Sıradaki", "Daha sonra", "Daha önce" gruplarına ayırır. */
export interface ListGroups<T> {
  now: T | null
  next: T | null
  later: T[]
  earlier: T[]
}

export function groupForList<T extends { startAt: string; endAt: string }>(
  items: readonly T[],
  now: number,
): ListGroups<T> {
  const sorted = [...items].sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))
  const live = sorted.find((a) => Date.parse(a.startAt) <= now && now < Date.parse(a.endAt)) ?? null
  const upcoming = sorted.filter((a) => Date.parse(a.startAt) > now)
  return {
    now: live,
    next: upcoming[0] ?? null,
    later: upcoming.slice(1),
    earlier: sorted.filter((a) => Date.parse(a.endAt) <= now).reverse(),
  }
}
