/**
 * TV Rehberi'nin saf geometrisi ve yön tuşu mantığı (testli: guideModel.test.ts). React ve DOM yok.
 *
 * Izgara: kanallar aşağı, zaman sağa; 30 dakikalık sütunlar, bloklar süreleriyle orantılı (rem).
 * Odak bloktan bloğa gider. Bir "odak anı" (anchor) tutulur:
 *   ←/→  aynı kanalda önceki / sonraki blok; odak anı yeni bloğun (görünen) başlangıcı olur
 *   ↑/↓  komşu kanalda odak anını kapsayan blok (yoksa en yakını); odak anı DEĞİŞMEZ — art arda ↑/↓ aynı
 *        anda kalır, düzensiz (farklı uzunlukta) bloklarda kaymaz. Boş kanal satırları atlanır.
 * Pencere: o günün 06:00'sı → ertesi gün 02:00 (Türkiye saati); bugün için şimdiyi kapsayacak kadar genişler.
 */
import { TIME_ZONE } from '../../../../shared/constants'

export const MIN_MS = 60_000
export const SLOT_MS = 30 * MIN_MS
/** 30 dakika = 14 rem (1920 px'te ~3 saat görünür) */
export const REM_PER_SLOT = 14
export const DAY_START_HOUR = 6
export const DAY_END_HOUR = 2

export type GuideDay = 0 | 1

export interface GuideWindow {
  from: number
  to: number
}

/* ───────────── Saat dilimi ───────────── */

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

interface Zoned {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

export function zonedParts(t: number): Zoned {
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

/** Türkiye saatindeki duvar saati → epoch ms. */
export function zonedTime(year: number, month: number, day: number, hour = 0, minute = 0): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute)
  const p = zonedParts(guess)
  const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - guess
  return guess - offset
}

const floorTo = (t: number, step: number): number => Math.floor(t / step) * step
const ceilTo = (t: number, step: number): number => Math.ceil(t / step) * step

/** Gün penceresi (0 bugün, 1 yarın). */
export function guideWindow(day: GuideDay, now: number): GuideWindow {
  const p = zonedParts(now)
  const from = zonedTime(p.year, p.month, p.day + day, DAY_START_HOUR)
  const to = zonedTime(p.year, p.month, p.day + day + 1, DAY_END_HOUR)
  if (day !== 0) return { from, to }
  return {
    from: Math.min(from, floorTo(now - 60 * MIN_MS, SLOT_MS)),
    to: Math.max(to, ceilTo(now + 2 * 60 * MIN_MS, SLOT_MS)),
  }
}

export const timeToRem = (t: number, w: GuideWindow, remPerSlot = REM_PER_SLOT): number =>
  ((t - w.from) / SLOT_MS) * remPerSlot

export const windowRem = (w: GuideWindow, remPerSlot = REM_PER_SLOT): number => timeToRem(w.to, w, remPerSlot)

export interface SlotTick {
  t: number
  left: number
  /** "20:30" */
  label: string
  major: boolean
}

/** 30 dakikalık sütun başları. */
export function slotTicks(w: GuideWindow, remPerSlot = REM_PER_SLOT): SlotTick[] {
  const out: SlotTick[] = []
  for (let t = ceilTo(w.from, SLOT_MS); t < w.to; t += SLOT_MS) {
    const p = zonedParts(t)
    out.push({
      t,
      left: timeToRem(t, w, remPerSlot),
      label: `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`,
      major: p.minute === 0,
    })
  }
  return out
}

/* ───────────── Bloklar ───────────── */

export interface GuideItem {
  id: string
  startAt: string
  endAt: string
}

export interface PlacedBlock<T extends GuideItem = GuideItem> {
  item: T
  id: string
  /** pencereye kırpılmış başlangıç / bitiş (epoch ms) */
  start: number
  end: number
  /** rem */
  left: number
  width: number
  clippedStart: boolean
  clippedEnd: boolean
}

/**
 * Bir kanalın yayınlarını pencereye yerleştirir: sıralar, pencere dışını atar, kenarda kırpar; çakışan yayında
 * sonraki yayının başı öncekinin bitişine çekilir (bloklar üst üste binmez, sıra bozulmaz).
 */
export function placeRow<T extends GuideItem>(
  items: readonly T[],
  w: GuideWindow,
  remPerSlot = REM_PER_SLOT,
): PlacedBlock<T>[] {
  const sorted = [...items].sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))
  const out: PlacedBlock<T>[] = []
  let cursor = w.from
  for (const item of sorted) {
    const s = Date.parse(item.startAt)
    const e = Date.parse(item.endAt)
    if (!Number.isFinite(s) || !Number.isFinite(e)) continue
    const start = Math.max(s, w.from, cursor)
    const end = Math.min(e, w.to)
    if (!(end > start)) continue
    cursor = end
    const left = timeToRem(start, w, remPerSlot)
    out.push({
      item,
      id: item.id,
      start,
      end,
      left,
      width: timeToRem(end, w, remPerSlot) - left,
      clippedStart: s < w.from,
      clippedEnd: e > w.to,
    })
  }
  return out
}

/** Satırda `t` anını kapsayan bloğun sırası; yoksa en yakın blok (boşluğa uzaklığa göre); satır boşsa null. */
export function blockAt(row: readonly Pick<PlacedBlock, 'start' | 'end'>[], t: number): number | null {
  if (!row.length) return null
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < row.length; i++) {
    const b = row[i]!
    if (b.start <= t && t < b.end) return i
    const dist = t < b.start ? b.start - t : t - b.end
    if (dist < bestDist) {
      bestDist = dist
      best = i
    }
  }
  return best
}

/** ←/→: aynı satırda komşu blok; kenardaysa null. */
export function horizontalStep(row: readonly unknown[], index: number, dir: -1 | 1): number | null {
  const next = index + dir
  return next >= 0 && next < row.length ? next : null
}

/** ↑/↓: odak anını kapsayan blok, boş satırlar atlanır; kenardaysa null. */
export function verticalStep(
  rows: readonly (readonly Pick<PlacedBlock, 'start' | 'end'>[])[],
  rowIndex: number,
  anchor: number,
  dir: -1 | 1,
): { row: number; index: number } | null {
  for (let r = rowIndex + dir; r >= 0 && r < rows.length; r += dir) {
    const i = blockAt(rows[r]!, anchor)
    if (i !== null) return { row: r, index: i }
  }
  return null
}

/**
 * ←/→ sonrası yeni odak anı: bloğun görünen kısmının başı. Görünür alanın solundan başlayan uzun blokta
 * görünür alanın başı alınır (ekranda bulunmayan bir ana kayılmaz).
 */
export function anchorFor(block: Pick<PlacedBlock, 'start' | 'end'>, viewFrom: number): number {
  if (block.start >= viewFrom) return block.start
  return Math.min(viewFrom, block.end - 1)
}

/**
 * Yatay kaydırma (rem): odaktaki blok görünür kalsın. Blok görünüme sığıyorsa tamamı, sığmıyorsa başı (ya da odak
 * anı) görünür alanın içinde, kenardan `margin` kadar içeride tutulur. Sonuç [0, toplam − görünüm] aralığındadır.
 */
export function scrollXFor(
  current: number,
  view: number,
  block: { left: number; width: number },
  total: number,
  anchorLeft: number = block.left,
  margin = 2,
): number {
  const max = Math.max(0, total - view)
  let x = current
  const right = block.left + block.width
  if (block.width <= view - 2 * margin) {
    if (block.left < x + margin) x = block.left - margin
    else if (right > x + view - margin) x = right - view + margin
  } else {
    // Geniş blok: odak anı görünür olsun; blok zaten görünümün tamamını kaplıyorsa kaydırma.
    const covers = block.left <= x && right >= x + view
    if (!covers) {
      if (anchorLeft < x + margin) x = anchorLeft - margin
      else if (anchorLeft > x + view - margin) x = anchorLeft - margin
    }
  }
  return Math.min(max, Math.max(0, x))
}

/**
 * Dikey kaydırma (satır cinsinden ilk görünen satır): odaktaki satırın üstünde bir satır pay bırakılır
 * (bir önceki kanal görünür kalır); listenin sonunda boşluk bırakılmaz.
 */
export function firstRowFor(currentFirst: number, visible: number, focused: number, total: number): number {
  const max = Math.max(0, total - visible)
  let first = currentFirst
  if (focused < first + 1) first = focused - 1
  else if (focused > first + visible - 2) first = focused - visible + 2
  return Math.min(max, Math.max(0, first))
}
