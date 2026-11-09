import { describe, expect, it } from 'vitest'
import { computeAidat, splitExtra } from '../../server/domain/budget.ts'
import {
  allocate,
  lateFee,
  lateFeePostings,
  position,
  statement,
  type LedgerCharge,
} from '../../server/domain/ledger.ts'

const charge = (id: number, amount: number, due: string, extra: Partial<LedgerCharge> = {}): LedgerCharge => ({
  id,
  kind: 'aidat',
  amount,
  due_date: due,
  late_fee: 1,
  late_fee_until: null,
  description: `Aidat ${due}`,
  ...extra,
})

describe('FIFO tahsilat dağıtımı', () => {
  it('ödeme en eski borcu kapatır, artan avans olur', () => {
    const charges = [charge(2, 100_000, '2026-02-15'), charge(1, 100_000, '2026-01-15')]
    const payments = [{ id: 1, amount: 150_000, paid_on: '2026-02-01' }]
    const { allocations, credit } = allocate(charges, payments)
    expect(allocations.get(1)).toEqual([{ paymentId: 1, amount: 100_000, date: '2026-02-01' }])
    expect(allocations.get(2)).toEqual([{ paymentId: 1, amount: 50_000, date: '2026-02-01' }])
    expect(credit).toBe(0)
    const extra = allocate(charges, [{ id: 9, amount: 250_000, paid_on: '2026-01-01' }])
    expect(extra.credit).toBe(50_000)
  })
})

describe('KMK m.20 gecikme tazminatı (aylık %5, gün esaslı)', () => {
  it('30 gün geciken 1.000 TL için 50 TL', () => {
    expect(
      lateFee({ amount: 100_000, dueDate: '2026-01-15', allocations: [], to: '2026-02-14', monthlyBps: 500 }),
    ).toBe(5_000)
  })

  it('vadesinde yapılan ödeme tazminat doğurmaz', () => {
    const fee = lateFee({
      amount: 100_000,
      dueDate: '2026-01-15',
      allocations: [{ paymentId: 1, amount: 100_000, date: '2026-01-15' }],
      to: '2026-03-01',
      monthlyBps: 500,
    })
    expect(fee).toBe(0)
  })

  it('kısmi ödemede kalan anapara üzerinden, bileşik olmadan hesaplanır', () => {
    // 10 gün 1.000 TL, sonra 20 gün 400 TL geç: (100000×10 + 40000×20) × 0.05/30 = 3000 kuruş
    const fee = lateFee({
      amount: 100_000,
      dueDate: '2026-01-15',
      allocations: [{ paymentId: 1, amount: 60_000, date: '2026-01-25' }],
      to: '2026-02-14',
      monthlyBps: 500,
    })
    expect(fee).toBe(3_000)
  })

  it('tahakkuk edilmiş dönem tekrar hesaplanmaz (late_fee_until)', () => {
    const a = lateFee({ amount: 100_000, dueDate: '2026-01-15', allocations: [], to: '2026-01-25', monthlyBps: 500 })
    const b = lateFee({
      amount: 100_000,
      dueDate: '2026-01-15',
      allocations: [],
      from: '2026-01-25',
      to: '2026-02-14',
      monthlyBps: 500,
    })
    const whole = lateFee({
      amount: 100_000,
      dueDate: '2026-01-15',
      allocations: [],
      to: '2026-02-14',
      monthlyBps: 500,
    })
    expect(a + b).toBe(whole)
  })

  it('oran sıfırsa tazminat yok', () => {
    expect(lateFee({ amount: 100_000, dueDate: '2026-01-15', allocations: [], to: '2026-06-01', monthlyBps: 0 })).toBe(
      0,
    )
  })
})

describe('daire pozisyonu ve ekstre', () => {
  const charges = [
    charge(1, 100_000, '2026-08-15'),
    charge(2, 100_000, '2026-09-15'),
    charge(3, 100_000, '2026-10-15'),
    charge(4, 100_000, '2026-11-15'),
    charge(5, 2_000, '2026-10-31', { kind: 'gecikme', late_fee: 0, description: 'Gecikme tazminatı' }),
  ]
  const payments = [{ id: 1, amount: 100_000, paid_on: '2026-08-20' }]

  it('vadesi geçmiş borç, yaşlandırma ve tazminat', () => {
    const p = position(charges, payments, '2026-11-09', 500)
    expect(p.balance).toBe(302_000)
    expect(p.overdue).toBe(202_000)
    expect(p.nextDue).toEqual({ date: '2026-11-15', amount: 100_000 })
    expect(p.aging.d31_60).toBe(100_000)
    expect(p.aging.d0_30).toBe(102_000)
    expect(p.oldestOverdue).toBe('2026-09-15')
    expect(p.lateFeeAccrued).toBeGreaterThan(0)
  })

  it('tazminat kayıtları yalnız tazminata tabi kalemler için', () => {
    const posts = lateFeePostings(charges, payments, '2026-11-09', 500)
    expect(posts.map((x) => x.chargeId).sort()).toEqual([1, 2, 3])
    // Ağustos borcu 5 gün geç ödendi: 100000×5×0.05/30 = 833 kuruş
    expect(posts.find((x) => x.chargeId === 1)!.amount).toBe(833)
  })

  it('ekstrede yürüyen bakiye', () => {
    const lines = statement(charges, payments)
    expect(lines.at(-1)!.balance).toBe(302_000)
    expect(lines[0]!.type).toBe('borc')
    expect(lines[1]!.type).toBe('odeme')
  })
})

describe('işletme projesi → aidat', () => {
  const units = [
    { id: 1, land_share: 20, area_m2: 100 },
    { id: 2, land_share: 30, area_m2: 150 },
    { id: 3, land_share: 50, area_m2: 250 },
  ]

  it('personel eşit, diğerleri arsa payı oranında', () => {
    const r = computeAidat(
      [
        { name: 'Kapıcı', category: 'personel', annual_amount: 3_600_000, method: 'esit' },
        { name: 'Bakım', category: 'bakim', annual_amount: 1_200_000, method: 'arsa_payi' },
      ],
      units,
      12,
      1,
    )
    expect(r.shares.map((s) => s.monthly)).toEqual([120_000, 130_000, 150_000])
    expect(r.roundingDiff).toBe(0)
  })

  it('tam liraya yuvarlama farkı raporlanır', () => {
    const r = computeAidat(
      [{ name: 'Gider', category: 'bakim', annual_amount: 1_000_000, method: 'esit' }],
      units,
      12,
      100,
    )
    expect(r.shares.every((s) => s.monthly % 100 === 0)).toBe(true)
    expect(r.collectedTotal - r.budgetTotal).toBe(r.roundingDiff)
  })

  it('ek toplama kuruşu kuruşuna dağıtılır', () => {
    const parts = splitExtra(1_000_001, 'arsa_payi', units)
    expect(parts.reduce((a, p) => a + p.amount, 0)).toBe(1_000_001)
  })

  it('m² dağıtımında eksik alan hata verir', () => {
    expect(() => splitExtra(100, 'm2', [{ id: 1, land_share: 1, area_m2: null }])).toThrow()
  })
})
