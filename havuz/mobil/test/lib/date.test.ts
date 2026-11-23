/**
 * Tarih yardımcıları: yerel gün, gün ekleme, son tarih durumu, Türkçe gösterim, elle yazılan günün ayrıştırılması.
 * Kaynak: uygulama/web/test/lib/date.test.ts (+ parseDayInput / formatDayInput).
 */
import {
  addDays,
  dueState,
  formatDay,
  formatDayInput,
  formatRelative,
  parseDayInput,
  toIsoDate,
} from '../../src/lib/date.ts'

describe('tarih yardımcıları', () => {
  it('bugün YEREL güne göre hesaplanır (gece yarısına yakın saatlerde de)', () => {
    expect(toIsoDate(new Date(2026, 10, 16, 0, 5))).toBe('2026-11-16')
    expect(toIsoDate(new Date(2026, 10, 16, 23, 55))).toBe('2026-11-16')
    expect(toIsoDate(new Date(2026, 0, 3, 12))).toBe('2026-01-03')
  })

  it('gün ekleme ay ve yıl sınırını doğru geçer', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29')
  })

  it('son tarih durumu', () => {
    const today = '2026-11-16'
    expect(dueState('2026-11-15', today)).toBe('overdue')
    expect(dueState('2026-11-16', today)).toBe('today')
    expect(dueState('2026-11-17', today)).toBe('tomorrow')
    expect(dueState('2026-11-23', today)).toBe('week')
    expect(dueState('2026-12-01', today)).toBe('later')
  })

  it('Türkçe gösterim: Bugün / Yarın / Dün / gün ay (başka yılda yıl da)', () => {
    const today = '2026-11-16'
    expect(formatDay('2026-11-16', today)).toBe('Bugün')
    expect(formatDay('2026-11-17', today)).toBe('Yarın')
    expect(formatDay('2026-11-15', today)).toBe('Dün')
    expect(formatDay('2026-12-03', today)).toBe('3 Aralık')
    expect(formatDay('2027-01-03', today)).toBe('3 Ocak 2027')
  })

  it('göreli zaman', () => {
    const now = new Date('2026-11-16T09:00:00.000Z')
    expect(formatRelative('2026-11-16T08:59:50.000Z', now)).toBe('az önce')
    expect(formatRelative('2026-11-16T08:55:00.000Z', now)).toBe('5 dakika önce')
    expect(formatRelative('2026-11-16T07:00:00.000Z', now)).toBe('2 saat önce')
    expect(formatRelative('2026-11-15T09:00:00.000Z', now)).toBe('dün')
  })

  it('elle yazılan gün: GG.AA.YYYY, GG/AA/YYYY, YYYY-AA-GG; olmayan gün reddedilir', () => {
    expect(parseDayInput('17.11.2026')).toBe('2026-11-17')
    expect(parseDayInput(' 3/1/2027 ')).toBe('2027-01-03')
    expect(parseDayInput('2026-11-17')).toBe('2026-11-17')
    expect(parseDayInput('29.02.2028')).toBe('2028-02-29')
    expect(parseDayInput('29.02.2027')).toBeNull()
    expect(parseDayInput('31.04.2026')).toBeNull()
    expect(parseDayInput('17.11.26')).toBeNull()
    expect(parseDayInput('yarın')).toBeNull()
    expect(formatDayInput('2026-01-03')).toBe('03.01.2026')
  })
})
