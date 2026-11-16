/**
 * cron — cron ifadesi ayrıştırma ve sonraki çalışma zamanını bulma (5 alan: dakika saat gün ay haftanın-günü).
 * `*`, liste (1,15), aralık (1-5), adım (*\/15, 1-30/5, 5/15), ad (JAN–DEC, SUN–SAT), makrolar (@daily…) desteklenir.
 * Hesap SABİT bir saat farkıyla yapılır; varsayılan Türkiye (UTC+3, yaz saati yok).
 *
 * Kullanım:
 *   nextRun('0 9 * * 1-5', '2026-11-16T10:00:00+03:00')    // Date: 17 Kasım 2026 Salı 09:00 (Türkiye)
 *   nextRuns('*\/15 * * * *', new Date(), 4)                // sonraki 4 çeyrek saat
 *   parseCron('@daily')                                     // { minutes: [0], hours: [0], … }
 *   matchesCron('30 8 1 * *', '2026-12-01T08:30:00+03:00') // true
 *
 * Kural (Vixie cron): gün (ayın günü) ve haftanın günü İKİSİ DE kısıtlıysa (ikisi de "*" ile başlamıyorsa) biri tutması
 * yeter: "0 0 1 * 1" → her ayın 1'i VE her pazartesi. Haftanın günü 0 ve 7 pazardır.
 *
 * Sınırlar: Saniye alanı, L/W/# (Quartz) ve @reboot yoktur. Yaz saati uygulayan saat dilimleri desteklenmez (sabit
 * fark): Avrupa saatleri için UTC'de (offsetMinutes: 0) düşünün. Hiç çalışmayan ifade (30 Şubat) 28 yıl aranıp
 * CronError verir.
 *
 * Genişletme: Yeni makro `MACROS`'a, yeni ad `NAMES`'e eklenir; Python eşine (kutuphane/cron.py) aynı kuralla eklenir
 * ve `vektorler/cron.json`'a örnek yazılır.
 */

export interface CronSchedule {
  minutes: number[]
  hours: number[]
  daysOfMonth: number[]
  months: number[]
  daysOfWeek: number[]
  domRestricted: boolean
  dowRestricted: boolean
}

export class CronError extends Error {
  override name = 'CronError'
}

const MACROS: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
}
const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const FIELDS = [
  { label: 'Dakika', min: 0, max: 59, names: [] as string[], nameBase: 0 },
  { label: 'Saat', min: 0, max: 23, names: [] as string[], nameBase: 0 },
  { label: 'Ayın günü', min: 1, max: 31, names: [] as string[], nameBase: 0 },
  { label: 'Ay', min: 1, max: 12, names: MONTH_NAMES, nameBase: 1 },
  { label: 'Haftanın günü', min: 0, max: 7, names: DAY_NAMES, nameBase: 0 },
] as const
const SEARCH_DAYS = 366 * 28

function parseNumber(text: string, field: (typeof FIELDS)[number]): number {
  const upper = text.toUpperCase() // harf: ay/gün adları ASCII
  const named = (field.names as readonly string[]).indexOf(upper)
  if (named !== -1) return named + field.nameBase
  if (!/^[0-9]+$/.test(text)) throw new CronError(`${field.label} alanında "${text}" anlaşılmadı.`)
  const value = Number(text)
  if (value < field.min || value > field.max) {
    throw new CronError(`${field.label} alanında ${value} geçersiz (${field.min}–${field.max}).`)
  }
  return value
}

function parseField(text: string, field: (typeof FIELDS)[number]): number[] {
  const values = new Set<number>()
  for (const item of text.split(',')) {
    const [rangePart = '', stepPart, extra] = item.split('/')
    if (extra !== undefined || rangePart === '') throw new CronError(`${field.label} alanında "${item}" anlaşılmadı.`)
    const step = stepPart === undefined ? 1 : Number(stepPart)
    if (!Number.isInteger(step) || step < 1 || !/^[0-9]+$/.test(stepPart ?? '1')) {
      throw new CronError(`${field.label} alanında adım "${stepPart ?? ''}" geçersiz.`)
    }
    let start: number
    let end: number
    if (rangePart === '*') {
      start = field.min
      end = field.max
    } else if (rangePart.includes('-')) {
      const [a = '', b = ''] = rangePart.split('-')
      start = parseNumber(a, field)
      end = parseNumber(b, field)
      if (start > end) throw new CronError(`${field.label} alanında aralık ters: "${rangePart}".`)
    } else {
      start = parseNumber(rangePart, field)
      end = stepPart === undefined ? start : field.max
    }
    for (let value = start; value <= end; value += step) values.add(value)
  }
  return [...values].sort((x, y) => x - y)
}

/** Cron ifadesini çözümler; hatalıysa hangi alanda ne olduğunu söyleyen CronError. */
export function parseCron(expression: string): CronSchedule {
  const trimmed = expression.trim()
  const macro = MACROS[trimmed.toLowerCase()] // harf: makro adları ASCII
  if (trimmed.startsWith('@') && macro === undefined) throw new CronError(`Desteklenmeyen makro: ${trimmed}.`)
  const parts = (macro ?? trimmed).split(/\s+/)
  if (parts.length !== 5) {
    throw new CronError(`Cron ifadesi 5 alan olmalı (dakika saat gün ay haftanın-günü); ${parts.length} alan var.`)
  }
  const [minute = '', hour = '', dom = '', month = '', dow = ''] = parts
  const daysOfWeek = [...new Set(parseField(dow, FIELDS[4]).map((d) => (d === 7 ? 0 : d)))].sort((x, y) => x - y)
  return {
    minutes: parseField(minute, FIELDS[0]),
    hours: parseField(hour, FIELDS[1]),
    daysOfMonth: parseField(dom, FIELDS[2]),
    months: parseField(month, FIELDS[3]),
    daysOfWeek,
    domRestricted: !dom.startsWith('*'),
    dowRestricted: !dow.startsWith('*'),
  }
}

function civilFromDays(days: number): [number, number, number] {
  const z = days + 719468
  const era = Math.floor(z / 146097)
  const doe = z - era * 146097
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365)
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100))
  const mp = Math.floor((5 * doy + 2) / 153)
  const month = mp < 10 ? mp + 3 : mp - 9
  return [yoe + era * 400 + (month <= 2 ? 1 : 0), month, doy - Math.floor((153 * mp + 2) / 5) + 1]
}

function dayMatches(schedule: CronSchedule, days: number): boolean {
  const [, month, day] = civilFromDays(days)
  if (!schedule.months.includes(month)) return false
  const weekday = (((days + 4) % 7) + 7) % 7 // 0 = pazar
  const domOk = schedule.daysOfMonth.includes(day)
  const dowOk = schedule.daysOfWeek.includes(weekday)
  if (schedule.domRestricted && schedule.dowRestricted) return domOk || dowOk
  return domOk && dowOk
}

function toMs(input: Date | string): number {
  if (input instanceof Date) return input.getTime()
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(input.trim())) {
    throw new CronError(`"${input}" okunamadı: saat dilimli ISO zaman verin ("2026-11-16T10:00:00+03:00").`)
  }
  return Date.parse(input.trim())
}

/** `after` anından SONRAKİ ilk çalışma zamanı (dakika başı). */
export function nextRun(
  expression: string | CronSchedule,
  after: Date | string,
  options: { offsetMinutes?: number } = {},
): Date {
  const schedule = typeof expression === 'string' ? parseCron(expression) : expression
  const offset = options.offsetMinutes ?? 180
  const startLocal = Math.floor(toMs(after) / 60_000) + offset + 1
  let day = Math.floor(startLocal / 1440)
  let fromMinute = startLocal - day * 1440
  for (let i = 0; i < SEARCH_DAYS; i++, day++, fromMinute = 0) {
    if (!dayMatches(schedule, day)) continue
    for (const hour of schedule.hours) {
      if (hour * 60 + 59 < fromMinute) continue
      const minute = schedule.minutes.find((m) => hour * 60 + m >= fromMinute)
      if (minute !== undefined) return new Date((day * 1440 + hour * 60 + minute - offset) * 60_000)
    }
  }
  throw new CronError('Bu ifade önümüzdeki 28 yılda hiç çalışmıyor (ör. 30 Şubat).')
}

/** Sonraki `count` çalışma zamanı. */
export function nextRuns(
  expression: string | CronSchedule,
  after: Date | string,
  count: number,
  options: { offsetMinutes?: number } = {},
): Date[] {
  const schedule = typeof expression === 'string' ? parseCron(expression) : expression
  const runs: Date[] = []
  let cursor: Date | string = after
  for (let i = 0; i < count; i++) {
    const run = nextRun(schedule, cursor, options)
    runs.push(run)
    cursor = run
  }
  return runs
}

/** Verilen an (dakikası) ifadeye uyuyor mu? */
export function matchesCron(expression: string | CronSchedule, at: Date | string, options: { offsetMinutes?: number } = {}): boolean {
  const schedule = typeof expression === 'string' ? parseCron(expression) : expression
  const local = Math.floor(toMs(at) / 60_000) + (options.offsetMinutes ?? 180)
  const day = Math.floor(local / 1440)
  const minuteOfDay = local - day * 1440
  return (
    dayMatches(schedule, day) &&
    schedule.hours.includes(Math.floor(minuteOfDay / 60)) &&
    schedule.minutes.includes(minuteOfDay % 60)
  )
}
