import { addDays, diffDays, type ISODate } from './dates'

// ---------- Veri modeli ----------

export interface Period {
  id: string
  start: ISODate
  /** Dahil son gün. */
  end: ISODate
  /** Kullanıcı "Adet bitti" dedi mi, yoksa bitiş tahmin mi? */
  endConfirmed: boolean
}

export interface Profile {
  cycleLength: number
  periodLength: number
  /** Ortalama yerine elle girilen uzunluklar kullanılsın mı? */
  manualLengths: boolean
}

export const DEFAULT_PROFILE: Profile = { cycleLength: 28, periodLength: 5, manualLengths: false }

export const LUTEAL_LENGTH = 14
export const MIN_CYCLE = 15
export const MAX_CYCLE = 60
export const MIN_PERIOD = 1
export const MAX_PERIOD = 12
/** Ortalamaya giren son döngü sayısı. */
export const AVERAGE_WINDOW = 6
/** Bitişik (ertesi gün) veya çakışan adet günleri aynı adete sayılır. */
const MERGE_GAP = 1

export type Phase = 'period' | 'follicular' | 'fertile' | 'ovulation' | 'luteal'
export type Chance = 'low' | 'medium' | 'high'

export interface DayInfo {
  date: ISODate
  cycleDay: number | null
  phase: Phase | null
  /** Kullanıcının kaydettiği adet günü. */
  loggedPeriod: boolean
  /** Tahmin edilen adet günü. */
  predictedPeriod: boolean
  fertile: boolean
  ovulation: boolean
  chance: Chance | null
}

// ---------- Adet düzenleme ----------

const newId = () => Math.random().toString(36).slice(2, 10)

export function sortPeriods(periods: Period[]): Period[] {
  return [...periods].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
}

export function isPeriodDay(periods: Period[], date: ISODate): boolean {
  return periods.some((p) => date >= p.start && date <= p.end)
}

export function findPeriod(periods: Period[], date: ISODate): Period | undefined {
  return periods.find((p) => date >= p.start && date <= p.end)
}

/** Yeni adet başlat: bugünden itibaren tahmini süre kadar günü işaretler (bitiş onaysız). */
export function startPeriod(periods: Period[], date: ISODate, periodLength: number): Period[] {
  const existing = findPeriod(periods, date)
  if (existing) return periods
  const end = addDays(date, Math.max(MIN_PERIOD, periodLength) - 1)
  return mergeOverlaps([...periods, { id: newId(), start: date, end, endConfirmed: false }])
}

/** Adeti verilen günde bitir. */
export function endPeriod(periods: Period[], date: ISODate): Period[] {
  const p = findPeriod(periods, date)
  if (!p) return periods
  return periods.map((x) => (x.id === p.id ? { ...x, end: date, endConfirmed: true } : x))
}

/** Takvimden tek bir günü adet olarak işaretle / kaldır. */
export function togglePeriodDay(periods: Period[], date: ISODate): Period[] {
  const p = findPeriod(periods, date)
  if (!p) {
    return mergeOverlaps([...periods, { id: newId(), start: date, end: date, endConfirmed: true }])
  }
  const rest = periods.filter((x) => x.id !== p.id)
  if (p.start === p.end) return rest
  if (date === p.start) return [...rest, { ...p, start: addDays(date, 1) }]
  if (date === p.end) return [...rest, { ...p, end: addDays(date, -1), endConfirmed: true }]
  // Ortadan kaldırma: adet ikiye bölünür.
  return [
    ...rest,
    { ...p, end: addDays(date, -1), endConfirmed: true },
    { id: newId(), start: addDays(date, 1), end: p.end, endConfirmed: p.endConfirmed },
  ]
}

/** Birbirine değen veya çakışan adetleri tek adete birleştirir. */
export function mergeOverlaps(periods: Period[]): Period[] {
  const sorted = sortPeriods(periods)
  const out: Period[] = []
  for (const p of sorted) {
    const last = out[out.length - 1]
    if (last && diffDays(last.end, p.start) <= MERGE_GAP) {
      last.end = p.end > last.end ? p.end : last.end
      last.endConfirmed = last.endConfirmed || p.endConfirmed
    } else {
      out.push({ ...p })
    }
  }
  return out
}

// ---------- İstatistik ----------

export interface CycleStats {
  cycleLength: number
  periodLength: number
  /** Ortalamaya giren döngü sayısı (0 ise profil değeri kullanılır). */
  cycleSamples: number
  periodSamples: number
  /** Kaydedilen döngülerin uzunlukları (eski → yeni). */
  cycleLengths: number[]
  /** Döngü uzunluğu değişkenliği (gün, en büyük − en küçük). */
  variation: number
}

export function clampCycle(n: number): number {
  return Math.min(MAX_CYCLE, Math.max(MIN_CYCLE, Math.round(n)))
}
export function clampPeriod(n: number): number {
  return Math.min(MAX_PERIOD, Math.max(MIN_PERIOD, Math.round(n)))
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

export function computeStats(periods: Period[], profile: Profile): CycleStats {
  const sorted = sortPeriods(periods)
  const cycleLengths: number[] = []
  for (let i = 1; i < sorted.length; i++) {
    const len = diffDays(sorted[i - 1].start, sorted[i].start)
    if (len >= MIN_CYCLE && len <= MAX_CYCLE) cycleLengths.push(len)
  }
  const recentCycles = cycleLengths.slice(-AVERAGE_WINDOW)
  const periodLengths = sorted
    .filter((p) => p.endConfirmed)
    .map((p) => diffDays(p.start, p.end) + 1)
    .filter((n) => n >= MIN_PERIOD && n <= MAX_PERIOD)
    .slice(-AVERAGE_WINDOW)

  const cycleLength =
    profile.manualLengths || recentCycles.length === 0 ? profile.cycleLength : clampCycle(mean(recentCycles))
  const periodLength =
    profile.manualLengths || periodLengths.length === 0 ? profile.periodLength : clampPeriod(mean(periodLengths))

  return {
    cycleLength,
    periodLength,
    cycleSamples: recentCycles.length,
    periodSamples: periodLengths.length,
    cycleLengths,
    variation: recentCycles.length >= 2 ? Math.max(...recentCycles) - Math.min(...recentCycles) : 0,
  }
}

// ---------- Tahmin ----------

export interface Prediction {
  /** Son kaydedilen adetin başlangıcı. */
  lastStart: ISODate | null
  /** Bir sonraki adet başlangıcı (tahmin). */
  nextStart: ISODate | null
  nextEnd: ISODate | null
  ovulation: ISODate | null
  fertileStart: ISODate | null
  fertileEnd: ISODate | null
}

/** Tek bir döngünün (başlangıcı verilen) penceresi. */
function cycleWindows(start: ISODate, stats: CycleStats) {
  const nextStart = addDays(start, stats.cycleLength)
  const ovulation = addDays(nextStart, -LUTEAL_LENGTH)
  return {
    nextStart,
    nextEnd: addDays(nextStart, stats.periodLength - 1),
    ovulation,
    fertileStart: addDays(ovulation, -5),
    fertileEnd: addDays(ovulation, 1),
  }
}

export function predict(periods: Period[], stats: CycleStats, today: ISODate): Prediction {
  const sorted = sortPeriods(periods).filter((p) => p.start <= today)
  const last = sorted[sorted.length - 1]
  if (!last) {
    return { lastStart: null, nextStart: null, nextEnd: null, ovulation: null, fertileStart: null, fertileEnd: null }
  }
  return { lastStart: last.start, ...cycleWindows(last.start, stats) }
}

export function pregnancyChance(phase: Phase | null): Chance | null {
  if (!phase) return null
  if (phase === 'ovulation' || phase === 'fertile') return 'high'
  if (phase === 'follicular') return 'medium'
  return 'low'
}

/**
 * Belirli bir günün döngü bilgisi. Geçmiş günler kaydedilen adetlere, gelecek günler tahmine dayanır.
 */
export function dayInfo(date: ISODate, periods: Period[], stats: CycleStats, today: ISODate): DayInfo {
  const sorted = sortPeriods(periods)
  const loggedPeriod = isPeriodDay(sorted, date)

  // Bu güne ait döngünün başlangıcı: tarihe eşit veya önceki son adet başlangıcı.
  const starts = sorted.map((p) => p.start)
  let cycleStart: ISODate | null = null
  for (const s of starts) if (s <= date) cycleStart = s

  const info: DayInfo = {
    date,
    cycleDay: null,
    phase: null,
    loggedPeriod,
    predictedPeriod: false,
    fertile: false,
    ovulation: false,
    chance: null,
  }
  if (!cycleStart) return info

  // Son kayıttan sonraki döngüleri tahminle ilerlet (gelecek aylar için).
  let start = cycleStart
  let w = cycleWindows(start, stats)
  const isLastLogged = start === starts[starts.length - 1]
  if (isLastLogged) {
    while (date >= w.nextStart) {
      start = w.nextStart
      w = cycleWindows(start, stats)
    }
  }
  const nextLoggedStart = starts.find((s) => s > start)
  const cycleEnd = nextLoggedStart ? addDays(nextLoggedStart, -1) : addDays(w.nextStart, -1)
  if (date > cycleEnd) return info

  info.cycleDay = diffDays(start, date) + 1
  const predictedCycle = start !== cycleStart
  info.predictedPeriod = predictedCycle && date <= addDays(start, stats.periodLength - 1) && date > today
  info.fertile = date >= w.fertileStart && date <= w.fertileEnd && !loggedPeriod
  info.ovulation = date === w.ovulation && !loggedPeriod

  const inPeriod = loggedPeriod || (predictedCycle && date <= addDays(start, stats.periodLength - 1))
  if (inPeriod) info.phase = 'period'
  else if (info.ovulation) info.phase = 'ovulation'
  else if (info.fertile) info.phase = 'fertile'
  else if (date < w.fertileStart) info.phase = 'follicular'
  else info.phase = 'luteal'
  info.chance = pregnancyChance(info.phase)
  return info
}

/** Bugünün durumu: başlık + alt yazı için gereken sayılar. */
export interface TodayStatus {
  kind: 'none' | 'period' | 'countdown' | 'late' | 'ovulation' | 'fertile'
  /** Adet günü (period) veya kalan gün (countdown) veya gecikme (late) */
  n: number
  cycleDay: number | null
  phase: Phase | null
  chance: Chance | null
  periodOngoing: Period | null
}

export function todayStatus(periods: Period[], stats: CycleStats, today: ISODate): TodayStatus {
  const info = dayInfo(today, periods, stats, today)
  const ongoing = findPeriod(periods, today) ?? null
  const pred = predict(periods, stats, today)
  const base = { cycleDay: info.cycleDay, phase: info.phase, chance: info.chance, periodOngoing: ongoing }
  if (!pred.lastStart || !pred.nextStart) return { kind: 'none', n: 0, ...base }
  if (ongoing) return { kind: 'period', n: diffDays(ongoing.start, today) + 1, ...base }
  const remaining = diffDays(today, pred.nextStart)
  if (remaining < 0) return { kind: 'late', n: -remaining, ...base }
  if (info.phase === 'ovulation') return { kind: 'ovulation', n: remaining, ...base }
  if (info.phase === 'fertile') return { kind: 'fertile', n: remaining, ...base }
  return { kind: 'countdown', n: remaining, ...base }
}

/** Geçmiş döngülerin listesi (yeni → eski): başlangıç, adet süresi, döngü uzunluğu. */
export interface CycleRow {
  start: ISODate
  periodLength: number
  cycleLength: number | null
  ongoing: boolean
}

export function cycleHistory(periods: Period[], today: ISODate): CycleRow[] {
  const sorted = sortPeriods(periods)
  const rows: CycleRow[] = sorted.map((p, i) => {
    const next = sorted[i + 1]
    return {
      start: p.start,
      periodLength: diffDays(p.start, p.end) + 1,
      cycleLength: next ? diffDays(p.start, next.start) : null,
      ongoing: !next && p.end >= today,
    }
  })
  return rows.reverse()
}
