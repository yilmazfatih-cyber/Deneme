// Zaman ölçeği ve takvim çizgileri. Aralık uzunluğuna göre adım seçilir: 1/5/15/30 sn, 1/5/15/30 dk,
// 1/3/6/12 sa, 1/2 gün, 1 hafta, 1/3/6 ay, 1/2/5/10… yıl. Ay ve yıl adımları takvimle atılır (ayların günü
// farklıdır). Etiketler Türkçe ve adıma uygun ayrıntıdadır: "14:05", "16 Kas", "Kas", "2026".
// Hesaplar UTC takvimindedir (saat dilimi testleri etkilemesin); veri yerel saatteyse önce UTC'ye çevirin.
// Genişletme: iş günü ekseni (hafta sonlarını atlayan) için ayrı bir `businessDays` ölçeği yazılabilir.
import { tickStep } from './ticks.ts'

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

type Interval = { ms: number; months?: number; format: Intl.DateTimeFormatOptions }

const INTERVALS: Interval[] = [
  ...[1, 5, 15, 30].map(
    (n) => ({ ms: n * SECOND, format: { hour: '2-digit', minute: '2-digit', second: '2-digit' } }) as Interval,
  ),
  ...[1, 5, 15, 30].map((n) => ({ ms: n * MINUTE, format: { hour: '2-digit', minute: '2-digit' } }) as Interval),
  ...[1, 3, 6, 12].map((n) => ({ ms: n * HOUR, format: { hour: '2-digit', minute: '2-digit' } }) as Interval),
  { ms: DAY, format: { day: 'numeric', month: 'short' } },
  { ms: 2 * DAY, format: { day: 'numeric', month: 'short' } },
  { ms: 7 * DAY, format: { day: 'numeric', month: 'short' } },
  { ms: 30 * DAY, months: 1, format: { month: 'short' } },
  { ms: 91 * DAY, months: 3, format: { month: 'short', year: 'numeric' } },
  { ms: 182 * DAY, months: 6, format: { month: 'short', year: 'numeric' } },
  { ms: 365 * DAY, months: 12, format: { year: 'numeric' } },
]

export interface TimeTick {
  value: number
  label: string
}

/** UTC takvimiyle zaman çizgileri. */
export function timeTicks(start: number, end: number, count = 6): TimeTick[] {
  const [lo, hi] = start <= end ? [start, end] : [end, start]
  const span = hi - lo
  let interval = INTERVALS.find((i) => span / i.ms <= count)
  let years = 1
  if (!interval) {
    interval = INTERVALS[INTERVALS.length - 1] as Interval
    years = Math.max(1, tickStep(0, span / (365 * DAY), count))
  }
  const format = new Intl.DateTimeFormat('tr-TR', { timeZone: 'UTC', ...interval.format })
  const values: number[] = []
  if (interval.months) {
    // Mutlak ay sırası (yıl×12 + ay): ay başına yuvarla, sonra adımın katına hizala (çeyrek: Oca/Nis/Tem/Eki).
    const first = new Date(lo)
    let index = first.getUTCFullYear() * 12 + first.getUTCMonth()
    if (Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1) < lo) index++
    const stepMonths = interval.months === 12 ? 12 * years : interval.months
    index = Math.ceil(index / stepMonths) * stepMonths
    for (
      let t = Date.UTC(Math.floor(index / 12), index % 12, 1);
      t <= hi;
      t = Date.UTC(Math.floor(index / 12), index % 12, 1)
    ) {
      values.push(t)
      index += stepMonths
    }
  } else {
    const ms = interval.ms
    const offset = ms === 7 * DAY ? 4 * DAY : 0 // haftalık çizgiler pazartesiye otursun (1970-01-01 perşembe)
    for (let t = Math.ceil((lo - offset) / ms) * ms + offset; t <= hi; t += ms) values.push(t)
  }
  return values.map((value) => ({ value, label: format.format(value) }))
}

export interface TimeScale {
  (value: Date | number): number
  domain: [number, number]
  ticks(count?: number): TimeTick[]
}

export function timeScale(domain: [Date | number, Date | number], range: [number, number]): TimeScale {
  const d0 = +domain[0]
  const d1 = +domain[1]
  const span = d1 - d0 || 1
  const map = (value: Date | number) => range[0] + ((+value - d0) / span) * (range[1] - range[0])
  return Object.assign(map, { domain: [d0, d1] as [number, number], ticks: (count = 6) => timeTicks(d0, d1, count) })
}
