import { describe, expect, it } from 'vitest'
import { addDays, diffDays } from '../src/lib/dates'
import {
  DEFAULT_PROFILE,
  computeStats,
  cycleHistory,
  dayInfo,
  endPeriod,
  predict,
  startPeriod,
  todayStatus,
  togglePeriodDay,
  type Period,
} from '../src/lib/cycle'

const P = (start: string, end: string, endConfirmed = true): Period => ({ id: start, start, end, endConfirmed })

describe('tarih yardımcıları', () => {
  it('gün ekler ve fark alır', () => {
    expect(addDays('2026-01-30', 3)).toBe('2026-02-02')
    expect(diffDays('2026-01-01', '2026-01-31')).toBe(30)
    expect(diffDays('2026-03-28', '2026-03-29')).toBe(1) // yaz saati geçişinde de 1
  })
})

describe('adet kaydı', () => {
  it('adet başlat tahmini süre kadar günü işaretler', () => {
    const ps = startPeriod([], '2026-10-01', 5)
    expect(ps).toHaveLength(1)
    expect(ps[0].start).toBe('2026-10-01')
    expect(ps[0].end).toBe('2026-10-05')
    expect(ps[0].endConfirmed).toBe(false)
  })
  it('adet bitti bitişi onaylar', () => {
    const ps = endPeriod(startPeriod([], '2026-10-01', 5), '2026-10-03')
    expect(ps[0].end).toBe('2026-10-03')
    expect(ps[0].endConfirmed).toBe(true)
  })
  it('takvimden gün ekleme/çıkarma: uç, orta ve tekil', () => {
    let ps = [P('2026-10-01', '2026-10-05')]
    ps = togglePeriodDay(ps, '2026-10-06') // bitişe eklenir, birleşir
    expect(ps).toHaveLength(1)
    expect(ps[0].end).toBe('2026-10-06')
    ps = togglePeriodDay(ps, '2026-10-01') // baş kısalır
    expect(ps[0].start).toBe('2026-10-02')
    ps = togglePeriodDay(ps, '2026-10-04') // ortadan bölünür
    expect(ps).toHaveLength(2)
    ps = togglePeriodDay(ps, '2026-10-20') // yeni tek günlük adet
    expect(ps).toHaveLength(3)
    ps = togglePeriodDay(ps, '2026-10-20') // tekil kaldırılır
    expect(ps).toHaveLength(2)
  })
})

describe('istatistik ve tahmin', () => {
  const periods = [P('2026-07-01', '2026-07-05'), P('2026-07-29', '2026-08-02'), P('2026-08-28', '2026-09-01')]
  it('ortalama döngü ve adet süresi kayıtlardan hesaplanır', () => {
    const s = computeStats(periods, DEFAULT_PROFILE)
    expect(s.cycleLengths).toEqual([28, 30])
    expect(s.cycleLength).toBe(29)
    expect(s.periodLength).toBe(5)
    expect(s.variation).toBe(2)
  })
  it('kayıt yoksa profil değerleri kullanılır', () => {
    const s = computeStats([], { cycleLength: 31, periodLength: 4, manualLengths: false })
    expect(s.cycleLength).toBe(31)
    expect(s.periodLength).toBe(4)
  })
  it('elle uzunluk seçilince ortalama yok sayılır', () => {
    const s = computeStats(periods, { cycleLength: 26, periodLength: 3, manualLengths: true })
    expect(s.cycleLength).toBe(26)
  })
  it('sonraki adet, yumurtlama ve doğurgan pencere', () => {
    const s = computeStats(periods, DEFAULT_PROFILE)
    const p = predict(periods, s, '2026-09-10')
    expect(p.nextStart).toBe('2026-09-26')
    expect(p.ovulation).toBe('2026-09-12')
    expect(p.fertileStart).toBe('2026-09-07')
    expect(p.fertileEnd).toBe('2026-09-13')
  })
  it('gün bilgisi: evreler ve döngü günü', () => {
    const s = computeStats(periods, DEFAULT_PROFILE)
    const today = '2026-09-10'
    expect(dayInfo('2026-08-29', periods, s, today).phase).toBe('period')
    expect(dayInfo('2026-09-03', periods, s, today).phase).toBe('follicular')
    expect(dayInfo('2026-09-08', periods, s, today).phase).toBe('fertile')
    expect(dayInfo('2026-09-12', periods, s, today).phase).toBe('ovulation')
    expect(dayInfo('2026-09-20', periods, s, today).phase).toBe('luteal')
    expect(dayInfo('2026-09-10', periods, s, today).cycleDay).toBe(14)
  })
  it('gelecek aylar için tahmini adet günleri üretilir', () => {
    const s = computeStats(periods, DEFAULT_PROFILE)
    const today = '2026-09-10'
    const d = dayInfo('2026-09-27', periods, s, today)
    expect(d.predictedPeriod).toBe(true)
    expect(d.cycleDay).toBe(2)
    const d2 = dayInfo('2026-10-25', periods, s, today) // 26 Eyl + 29 = 25 Eki
    expect(d2.predictedPeriod).toBe(true)
    expect(d2.cycleDay).toBe(1)
    // Tahmini yumurtlama bir sonraki döngüde de hesaplanır
    expect(dayInfo('2026-10-11', periods, s, today).ovulation).toBe(true)
  })
  it('bugünün durumu: adet, geri sayım, gecikme', () => {
    const s = computeStats(periods, DEFAULT_PROFILE)
    expect(todayStatus(periods, s, '2026-08-30')).toMatchObject({ kind: 'period', n: 3 })
    expect(todayStatus(periods, s, '2026-09-20')).toMatchObject({ kind: 'countdown', n: 6 })
    expect(todayStatus(periods, s, '2026-09-28')).toMatchObject({ kind: 'late', n: 2 })
    expect(todayStatus(periods, s, '2026-09-12')).toMatchObject({ kind: 'ovulation' })
    expect(todayStatus([], s, '2026-09-12')).toMatchObject({ kind: 'none' })
  })
  it('döngü geçmişi yeni → eski sıralanır', () => {
    const rows = cycleHistory(periods, '2026-09-10')
    expect(rows[0].start).toBe('2026-08-28')
    expect(rows[0].cycleLength).toBeNull()
    expect(rows[1].cycleLength).toBe(30)
    expect(rows[2].periodLength).toBe(5)
  })
})
