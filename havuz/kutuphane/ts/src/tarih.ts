/**
 * tarih — Türkçe tarih biçimleme/ayrıştırma ("16 Kasım 2026 Pazartesi", "16.11.2026"), göreli zaman ("dün",
 * "3 gün önce", "2 saat sonra"), iş günü hesabı (hafta sonu + sabit tarihli resmî tatiller; dinî bayramlar
 * dışarıdan liste olarak verilir), yaş, ISO hafta.
 *
 * Kullanım:
 *   formatDateTr('2026-11-16', 'uzun')                    // "16 Kasım 2026 Pazartesi"
 *   formatDateTr(new Date('2026-11-16T21:30:00Z'), 'tam')  // "17 Kasım 2026 Salı 00:30"  (Türkiye saatiyle!)
 *   parseDateTr('16 kasım 2026')                          // "2026-11-16"
 *   relativeTimeTr('2026-11-15T10:00:00+03:00', '2026-11-16T12:00:00+03:00')   // "dün"
 *   addBusinessDays('2026-10-27', 2)                      // "2026-10-30"  (29 Ekim tatil)
 *   isBusinessDay('2026-03-20', { holidays: ['2026-03-20'] })   // false (bayramı siz verirsiniz)
 *
 * İki tür girdi vardır ve karıştırılmaz:
 *  - TAKVİM GÜNÜ: "YYYY-MM-DD" metni. Saat dilimi yoktur; doğum günü, fatura tarihi, tatil böyledir.
 *    Çıktıdaki tarihler de hep bu biçimdedir.
 *  - AN: `Date` ya da saat dilimi yazılı ISO metni ("…T21:30:00Z", "…+03:00"). Önce Türkiye saatine (UTC+3)
 *    çevrilir, sonra takvim gününe. Saat dilimi YAZILMAMIŞ saatli metin ("2026-11-16T10:00") HATA verir; çünkü JS
 *    onu tarayıcının saat dilimiyle okur ve sunucuda başka gün çıkar.
 * Saat dilimi tuzağı: Türkiye 2016'dan beri yaz saati uygulamaz, sabit UTC+3'tür. `new Date().getDate()` ve
 * `toISOString().slice(0, 10)` YANLIŞ gün verebilir (gece 00:00–03:00 arası UTC'de hâlâ önceki gündür).
 * Başka bir sabit fark için `offsetMinutes` verin (ör. UTC için 0).
 *
 * Sınırlar: Yaz saati olan saat dilimleri desteklenmez (sabit fark). Dinî bayramlar (Ramazan, Kurban) ve arife
 * yarım günleri hesaplanmaz; liste olarak verin. 28 Ekim öğleden sonra ve arife yarım günleri iş günü sayılır.
 * Sabit tatiller 2394 sayılı Kanun'a göredir: 1 Mayıs 2009'dan, 15 Temmuz 2017'den beri; 1981 öncesi doğrulanmadı.
 *
 * Genişletme: Yeni sabit tatil `FIXED_HOLIDAYS`'e (ay, gün, ad, başlangıç yılı) eklenir; yeni biçim kalıbı
 * `PRESETS`'e. Her ekleme için `vektorler/tarih.json` dosyasına örnek yazın.
 */

export class DateError extends Error {
  override name = 'DateError'
}

/** Türkiye'nin UTC'ye göre sabit farkı (dakika). */
export const TURKEY_OFFSET_MINUTES = 180

export interface Holiday {
  date: string
  name: string
}

export interface BusinessDayOptions {
  /** Ek tatiller (dinî bayramlar, idari izin): "YYYY-MM-DD" listesi. */
  holidays?: readonly string[]
  /** Hafta sonu sayılan ISO gün numaraları (1 = Pazartesi … 7 = Pazar). Varsayılan [6, 7]. */
  weekend?: readonly number[]
  /** Sabit tarihli resmî tatiller hesaba katılsın mı? Varsayılan true. */
  includeFixedHolidays?: boolean
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
const MONTHS_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
const DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']
const DAYS_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']
const PRESETS: Record<string, string> = {
  kisa: 'dd.MM.yyyy',
  orta: 'd MMMM yyyy',
  uzun: 'd MMMM yyyy EEEE',
  saat: 'dd.MM.yyyy HH:mm',
  tam: 'd MMMM yyyy EEEE HH:mm',
}
/** [ay, gün, ad, ilk yıl] — 2394 sayılı Ulusal Bayram ve Genel Tatiller Hakkında Kanun. */
const FIXED_HOLIDAYS: readonly (readonly [number, number, string, number])[] = [
  [1, 1, 'Yılbaşı', 0],
  [4, 23, 'Ulusal Egemenlik ve Çocuk Bayramı', 0],
  [5, 1, 'Emek ve Dayanışma Günü', 2009],
  [5, 19, "Atatürk'ü Anma, Gençlik ve Spor Bayramı", 0],
  [7, 15, 'Demokrasi ve Millî Birlik Günü', 2017],
  [8, 30, 'Zafer Bayramı', 0],
  [10, 29, 'Cumhuriyet Bayramı', 0],
]

interface WallClock {
  days: number // 1970-01-01'den beri gün
  hour: number
  minute: number
  second: number
}

// ---------------------------------------------------------------------------------------------------------------
// Takvim aritmetiği (saat dilimsiz; H. Hinnant'ın tam sayı algoritmaları)
// ---------------------------------------------------------------------------------------------------------------

function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year
  const era = Math.floor(y / 400)
  const yoe = y - era * 400
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1
  return era * 146097 + yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy - 719468
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

function isoFromDays(days: number): string {
  const [y, m, d] = civilFromDays(days)
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

export function daysInMonth(year: number, month: number): number {
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new DateError(`Ay 1–12 arasında olmalı: ${month}.`)
  return month === 2 ? (isLeapYear(year) ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31
}

function checkedDays(year: number, month: number, day: number, source: string): number {
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new DateError(`"${source}" geçerli bir tarih değil (gün.ay.yıl sırasını ve ayın gün sayısını denetleyin).`)
  }
  return daysFromCivil(year, month, day)
}

/** Girdiyi duvar saatine çevirir: takvim günü → 00:00; an → `offsetMinutes` farkla yerel saat. */
function wallClock(input: string | Date, offsetMinutes: number): WallClock {
  if (typeof input === 'string') {
    const text = input.trim()
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
    if (dateOnly) {
      const days = checkedDays(Number(dateOnly[1]), Number(dateOnly[2]), Number(dateOnly[3]), text)
      return { days, hour: 0, minute: 0, second: 0 }
    }
    const instant = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.exec(text)
    if (!instant) {
      throw new DateError(
        `"${text}" okunamadı. Takvim günü için "YYYY-MM-DD", an için saat dilimli ISO ("2026-11-16T10:00:00+03:00") verin.`,
      )
    }
    return wallClock(new Date(text.replace(' ', 'T')), offsetMinutes)
  }
  const ms = input.getTime()
  if (Number.isNaN(ms)) throw new DateError('Geçersiz Date nesnesi.')
  const local = ms + offsetMinutes * 60_000
  const days = Math.floor(local / 86_400_000)
  const seconds = Math.floor((local - days * 86_400_000) / 1000)
  return { days, hour: Math.floor(seconds / 3600), minute: Math.floor(seconds / 60) % 60, second: seconds % 60 }
}

/** Girdinin UTC milisaniyesi; takvim günü `offsetMinutes` saat diliminde gece yarısı sayılır. */
function instantMs(input: string | Date, offsetMinutes: number): number {
  if (input instanceof Date) return input.getTime()
  const text = input.trim()
  const clock = wallClock(text, offsetMinutes) // biçimi de denetler
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return clock.days * 86_400_000 - offsetMinutes * 60_000
  return new Date(text.replace(' ', 'T')).getTime()
}

/** Takvim gününü "YYYY-MM-DD" olarak verir; an girdisi Türkiye saatine göre güne çevrilir. */
export function toIsoDate(input: string | Date, offsetMinutes = TURKEY_OFFSET_MINUTES): string {
  return isoFromDays(wallClock(input, offsetMinutes).days)
}

export function addDays(date: string | Date, days: number): string {
  if (!Number.isInteger(days)) throw new DateError(`Gün sayısı tam sayı olmalı: ${days}.`)
  return isoFromDays(wallClock(date, TURKEY_OFFSET_MINUTES).days + days)
}

/** ISO gün numarası: 1 = Pazartesi … 7 = Pazar. */
export function dayOfWeek(date: string | Date): number {
  return ((((wallClock(date, TURKEY_OFFSET_MINUTES).days + 3) % 7) + 7) % 7) + 1
}

export function dayNameTr(date: string | Date): string {
  return DAYS[dayOfWeek(date) - 1] ?? ''
}

// ---------------------------------------------------------------------------------------------------------------
// Biçimleme ve ayrıştırma
// ---------------------------------------------------------------------------------------------------------------

/**
 * Kalıpla biçimler. Hazır kalıplar: kisa "16.11.2026", orta "16 Kasım 2026", uzun "16 Kasım 2026 Pazartesi",
 * saat "16.11.2026 14:30", tam "16 Kasım 2026 Pazartesi 14:30". Simgeler: yyyy yy MMMM MMM MM M dd d EEEE EEE
 * HH H mm ss; tek tırnak içi olduğu gibi yazılır ('Saat' HH:mm).
 */
export function formatDateTr(
  input: string | Date,
  pattern = 'kisa',
  offsetMinutes: number = TURKEY_OFFSET_MINUTES,
): string {
  const clock = wallClock(input, offsetMinutes)
  const [year, month, day] = civilFromDays(clock.days)
  const weekday = (((clock.days + 3) % 7) + 7) % 7
  const pad = (n: number, width = 2): string => String(n).padStart(width, '0')
  const tokens: Record<string, string> = {
    yyyy: pad(year, 4),
    yy: pad(year % 100),
    MMMM: MONTHS[month - 1] ?? '',
    MMM: MONTHS_SHORT[month - 1] ?? '',
    MM: pad(month),
    M: String(month),
    dd: pad(day),
    d: String(day),
    EEEE: DAYS[weekday] ?? '',
    EEE: DAYS_SHORT[weekday] ?? '',
    HH: pad(clock.hour),
    H: String(clock.hour),
    mm: pad(clock.minute),
    ss: pad(clock.second),
  }
  return (PRESETS[pattern] ?? pattern).replace(
    /'([^']*)'|yyyy|yy|MMMM|MMM|MM|M|dd|d|EEEE|EEE|HH|H|mm|ss/g,
    (token, literal: string | undefined) => literal ?? tokens[token] ?? token,
  )
}

function foldTr(text: string): string {
  return text
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .toLowerCase() // harf: İ/I önce elle çevrildi
    .replace(/i\u{307}/gu, 'i')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u')
}

function lookup(word: string, full: readonly string[], short: readonly string[]): number {
  const key = foldTr(word)
  const index = full.findIndex((name, i) => foldTr(name) === key || foldTr(short[i] ?? '') === key)
  return index
}

/**
 * Türkçe yazılmış tarihi "YYYY-MM-DD" takvim gününe çevirir. Kabul edilenler: "16.11.2026", "16/11/2026",
 * "16-11-2026", "16 Kasım 2026", "16 kasim 2026 Pazartesi", "Pazartesi, 16 Kas 2026", "2026-11-16".
 * İki haneli yıl, olmayan gün (31.02) ve tutmayan gün adı açık hata verir.
 */
export function parseDateTr(text: string): string {
  const clean = text.trim().replace(/\s+/g, ' ')
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean)
  if (iso) return isoFromDays(checkedDays(Number(iso[1]), Number(iso[2]), Number(iso[3]), clean))
  const numeric = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/.exec(clean)
  if (numeric) {
    if ((numeric[3] ?? '').length !== 4) throw new DateError(`"${clean}": yılı dört haneli yazın (16.11.2026).`)
    return isoFromDays(checkedDays(Number(numeric[3]), Number(numeric[2]), Number(numeric[1]), clean))
  }
  const named = /^(?:([\p{L}]+),? )?(\d{1,2})\.? ([\p{L}]+) (\d{4})(?:,? ([\p{L}]+))?$/u.exec(clean)
  if (!named) throw new DateError(`"${clean}" tarih olarak okunamadı. Örnek: 16.11.2026 ya da 16 Kasım 2026.`)
  const month = lookup(named[3] ?? '', MONTHS, MONTHS_SHORT) + 1
  if (month === 0) throw new DateError(`"${named[3] ?? ''}" bir ay adı değil (Ocak, Şubat, … Aralık).`)
  const days = checkedDays(Number(named[4]), month, Number(named[2]), clean)
  const dayWord = named[1] ?? named[5]
  if (dayWord !== undefined) {
    const written = lookup(dayWord, DAYS, DAYS_SHORT)
    const actual = (((days + 3) % 7) + 7) % 7
    if (written !== actual) {
      throw new DateError(`"${clean}": bu tarih ${DAYS[actual] ?? ''} gününe denk gelir; yazılan gün tutmuyor.`)
    }
  }
  return isoFromDays(days)
}

// ---------------------------------------------------------------------------------------------------------------
// Göreli zaman
// ---------------------------------------------------------------------------------------------------------------

function monthsBetween(fromDays: number, toDays: number): number {
  const [y1, m1, d1] = civilFromDays(fromDays)
  const [y2, m2, d2] = civilFromDays(toDays)
  return (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0)
}

/**
 * "şimdi", "5 dakika önce", "2 saat sonra", "dün", "yarın", "3 gün önce", "2 hafta önce", "3 ay önce", "2 yıl sonra".
 * 24 saatten kısa farklar saatle, daha uzunları Türkiye takvim günüyle söylenir. `now` zorunludur (test edilebilirlik).
 */
export function relativeTimeTr(
  target: string | Date,
  now: string | Date,
  offsetMinutes: number = TURKEY_OFFSET_MINUTES,
): string {
  const seconds = (instantMs(target, offsetMinutes) - instantMs(now, offsetMinutes)) / 1000
  const abs = Math.abs(seconds)
  const direction = seconds > 0 ? 'sonra' : 'önce'
  if (abs < 45) return 'şimdi'
  if (abs < 3600) return `${Math.max(1, Math.floor(abs / 60))} dakika ${direction}`
  if (abs < 86_400) return `${Math.floor(abs / 3600)} saat ${direction}`
  const targetDays = wallClock(target, offsetMinutes).days
  const nowDays = wallClock(now, offsetMinutes).days
  const dayDiff = Math.abs(targetDays - nowDays)
  if (dayDiff === 1) return seconds > 0 ? 'yarın' : 'dün'
  if (dayDiff < 7) return `${dayDiff} gün ${direction}`
  if (dayDiff < 30) return `${Math.floor(dayDiff / 7)} hafta ${direction}`
  const months = Math.max(1, monthsBetween(Math.min(targetDays, nowDays), Math.max(targetDays, nowDays)))
  if (dayDiff < 365) return `${months} ay ${direction}`
  return `${Math.max(1, Math.floor(months / 12))} yıl ${direction}`
}

// ---------------------------------------------------------------------------------------------------------------
// Tatil ve iş günü
// ---------------------------------------------------------------------------------------------------------------

/** O yılın sabit tarihli resmî tatilleri (dinî bayramlar HARİÇ). */
export function fixedHolidaysTr(year: number): Holiday[] {
  return FIXED_HOLIDAYS.filter(([, , , since]) => year >= since).map(([month, day, name]) => ({
    date: isoFromDays(daysFromCivil(year, month, day)),
    name,
  }))
}

function isFixedHoliday(days: number): boolean {
  const [year, month, day] = civilFromDays(days)
  return FIXED_HOLIDAYS.some(([m, d, , since]) => m === month && d === day && year >= since)
}

function businessDayAt(days: number, options: BusinessDayOptions): boolean {
  const weekend = options.weekend ?? [6, 7]
  if (weekend.includes(((((days + 3) % 7) + 7) % 7) + 1)) return false
  if ((options.includeFixedHolidays ?? true) && isFixedHoliday(days)) return false
  return !(options.holidays ?? []).includes(isoFromDays(days))
}

export function isBusinessDay(date: string | Date, options: BusinessDayOptions = {}): boolean {
  return businessDayAt(wallClock(date, TURKEY_OFFSET_MINUTES).days, options)
}

/** `count` iş günü ileri (negatifse geri) gider; başlangıç günü sayılmaz. 0 → tarihin kendisi. */
export function addBusinessDays(date: string | Date, count: number, options: BusinessDayOptions = {}): string {
  if (!Number.isInteger(count)) throw new DateError(`İş günü sayısı tam sayı olmalı: ${count}.`)
  if ((options.weekend ?? [6, 7]).length >= 7) throw new DateError('Haftanın her günü tatil olamaz.')
  let days = wallClock(date, TURKEY_OFFSET_MINUTES).days
  const step = count < 0 ? -1 : 1
  for (let left = Math.abs(count); left > 0;) {
    days += step
    if (businessDayAt(days, options)) left -= 1
  }
  return isoFromDays(days)
}

/**
 * Başlangıçtan bitişe giderken üzerine basılan iş günü sayısı: ileri (başlangıç, bitiş], geri [bitiş, başlangıç)
 * sayılır ve geri giderken sonuç negatiftir. Böylece addBusinessDays'in tam tersidir.
 */
export function businessDaysBetween(
  start: string | Date,
  end: string | Date,
  options: BusinessDayOptions = {},
): number {
  const from = wallClock(start, TURKEY_OFFSET_MINUTES).days
  const to = wallClock(end, TURKEY_OFFSET_MINUTES).days
  const [low, high] = to >= from ? [from + 1, to] : [to, from - 1]
  let count = 0
  for (let day = low; day <= high; day++) if (businessDayAt(day, options)) count += 1
  return to >= from ? count : -count
}

// ---------------------------------------------------------------------------------------------------------------
// Yaş ve ISO hafta
// ---------------------------------------------------------------------------------------------------------------

/** Tamamlanmış yaş. 29 Şubat doğumlular artık olmayan yıllarda 1 Mart'ta bir yaş büyür. */
export function ageOn(birthDate: string | Date, onDate: string | Date): number {
  const [by, bm, bd] = civilFromDays(wallClock(birthDate, TURKEY_OFFSET_MINUTES).days)
  const [oy, om, od] = civilFromDays(wallClock(onDate, TURKEY_OFFSET_MINUTES).days)
  const age = oy - by - (om < bm || (om === bm && od < bd) ? 1 : 0)
  if (age < 0) throw new DateError('Doğum tarihi, yaşın hesaplandığı tarihten sonra olamaz.')
  return age
}

/** ISO 8601 hafta numarası: yılın ilk perşembesini içeren hafta 1. haftadır. */
export function isoWeek(date: string | Date): { year: number; week: number } {
  const days = wallClock(date, TURKEY_OFFSET_MINUTES).days
  const thursday = days - ((((days + 3) % 7) + 7) % 7) + 3
  const [year] = civilFromDays(thursday)
  return { year, week: Math.floor((thursday - daysFromCivil(year, 1, 1)) / 7) + 1 }
}
