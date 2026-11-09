// Bağımsız bölüm (daire) cari hesabı: tahakkuklar (borç) ve tahsilatlar (alacak).
// Tahsilat en eski vadeli borçtan başlayarak kapatılır (FIFO). Gecikme tazminatı KMK m.20'ye göre
// gecikilen her gün için aylık oran / 30 ile, ana borç üzerinden ve basit (bileşik olmayan) hesaplanır.
import { diffDays } from './dates.ts'

export type LedgerCharge = {
  id: number
  kind: string
  amount: number
  due_date: string
  late_fee: number
  late_fee_until: string | null
  description: string
  period?: string | null
}
export type LedgerPayment = {
  id: number
  amount: number
  paid_on: string
  method?: string
  reference?: string | null
  note?: string | null
}
export type Allocation = { paymentId: number; amount: number; date: string }

const byCharge = (a: LedgerCharge, b: LedgerCharge) => a.due_date.localeCompare(b.due_date) || a.id - b.id
const byPayment = (a: LedgerPayment, b: LedgerPayment) => a.paid_on.localeCompare(b.paid_on) || a.id - b.id

/** Tahsilatları vadesi en eski borçtan başlayarak dağıtır. Artan tutar avanstır (credit). */
export function allocate(charges: LedgerCharge[], payments: LedgerPayment[]) {
  const sortedCharges = [...charges].sort(byCharge)
  const queue = [...payments].sort(byPayment).map((p) => ({ ...p, rem: p.amount }))
  const allocations = new Map<number, Allocation[]>()
  let qi = 0
  for (const c of sortedCharges) {
    let rem = c.amount
    const list: Allocation[] = []
    while (rem > 0 && qi < queue.length) {
      const p = queue[qi]!
      const use = Math.min(rem, p.rem)
      list.push({ paymentId: p.id, amount: use, date: p.paid_on })
      rem -= use
      p.rem -= use
      if (p.rem === 0) qi++
    }
    allocations.set(c.id, list)
  }
  const credit = queue.slice(qi).reduce((a, p) => a + p.rem, 0)
  return { allocations, credit }
}

export function paidOf(allocs: Allocation[] | undefined, asOf?: string): number {
  return (allocs ?? []).filter((a) => !asOf || a.date <= asOf).reduce((s, a) => s + a.amount, 0)
}

/**
 * Bir borç kalemi için [from, to] aralığındaki gecikme tazminatı (kuruş).
 * Gecikme günü = ödeme tarihi − vade. Vade gününde ve öncesinde yapılan ödeme tazminat doğurmaz.
 * monthlyBps: aylık oran (500 = %5).
 */
export function lateFee(p: {
  amount: number
  dueDate: string
  allocations: Allocation[]
  from?: string | null
  to: string
  monthlyBps: number
}): number {
  const start = p.from && p.from > p.dueDate ? p.from : p.dueDate
  if (p.to <= start || p.monthlyBps <= 0) return 0
  const allocs = [...p.allocations].sort((a, b) => a.date.localeCompare(b.date))
  let outstanding = p.amount - allocs.filter((a) => a.date <= start).reduce((s, a) => s + a.amount, 0)
  let cursor = start
  let weighted = 0 // kuruş × gün
  for (const a of allocs) {
    if (a.date <= start || a.date > p.to) continue
    weighted += outstanding * diffDays(cursor, a.date)
    outstanding -= a.amount
    cursor = a.date
  }
  if (outstanding > 0) weighted += outstanding * diffDays(cursor, p.to)
  return Math.round((weighted * p.monthlyBps) / (10_000 * 30))
}

export type Aging = { d0_30: number; d31_60: number; d61_90: number; d90p: number }

export type Position = {
  charged: number
  paid: number
  /** Pozitif: borç, negatif: avans. */
  balance: number
  overdue: number
  credit: number
  /** Henüz tahakkuk ettirilmemiş gecikme tazminatı. */
  lateFeeAccrued: number
  oldestOverdue: string | null
  maxOverdueDays: number
  aging: Aging
  nextDue: { date: string; amount: number } | null
}

export function position(
  charges: LedgerCharge[],
  payments: LedgerPayment[],
  asOf: string,
  monthlyBps: number,
): Position {
  const { allocations, credit } = allocate(charges, payments)
  const aging: Aging = { d0_30: 0, d31_60: 0, d61_90: 0, d90p: 0 }
  let overdue = 0
  let lateFeeAccrued = 0
  let oldestOverdue: string | null = null
  let nextDueDate: string | null = null
  let nextDueAmount = 0
  for (const c of [...charges].sort(byCharge)) {
    const allocs = allocations.get(c.id) ?? []
    const outstanding = c.amount - paidOf(allocs)
    if (c.late_fee && c.kind !== 'gecikme') {
      lateFeeAccrued += lateFee({
        amount: c.amount,
        dueDate: c.due_date,
        allocations: allocs,
        from: c.late_fee_until,
        to: asOf,
        monthlyBps,
      })
    }
    if (outstanding <= 0) continue
    if (c.due_date < asOf) {
      overdue += outstanding
      oldestOverdue ??= c.due_date
      const days = diffDays(c.due_date, asOf)
      if (days <= 30) aging.d0_30 += outstanding
      else if (days <= 60) aging.d31_60 += outstanding
      else if (days <= 90) aging.d61_90 += outstanding
      else aging.d90p += outstanding
    } else if (nextDueDate === null || c.due_date === nextDueDate) {
      nextDueDate = c.due_date
      nextDueAmount += outstanding
    }
  }
  const charged = charges.reduce((s, c) => s + c.amount, 0)
  const paid = payments.reduce((s, p) => s + p.amount, 0)
  return {
    charged,
    paid,
    balance: charged - paid,
    overdue,
    credit,
    lateFeeAccrued,
    oldestOverdue,
    maxOverdueDays: oldestOverdue ? diffDays(oldestOverdue, asOf) : 0,
    aging,
    nextDue: nextDueDate ? { date: nextDueDate, amount: nextDueAmount } : null,
  }
}

/** Tahakkuk ettirilecek gecikme tazminatları: borç kalemi başına [late_fee_until|vade, asOf] aralığı. */
export function lateFeePostings(charges: LedgerCharge[], payments: LedgerPayment[], asOf: string, monthlyBps: number) {
  const { allocations } = allocate(charges, payments)
  const out: { chargeId: number; amount: number }[] = []
  for (const c of charges) {
    if (!c.late_fee || c.kind === 'gecikme') continue
    const amount = lateFee({
      amount: c.amount,
      dueDate: c.due_date,
      allocations: allocations.get(c.id) ?? [],
      from: c.late_fee_until,
      to: asOf,
      monthlyBps,
    })
    if (amount > 0) out.push({ chargeId: c.id, amount })
  }
  return out
}

export type StatementLine = {
  date: string
  type: 'borc' | 'odeme'
  id: number
  kind: string
  description: string
  debit: number
  credit: number
  balance: number
}

/** Hesap ekstresi: tarih sırasıyla borç ve ödemeler, yürüyen bakiye. */
export function statement(charges: LedgerCharge[], payments: LedgerPayment[]): StatementLine[] {
  const rows: Omit<StatementLine, 'balance'>[] = [
    ...charges.map((c) => ({
      date: c.due_date,
      type: 'borc' as const,
      id: c.id,
      kind: c.kind,
      description: c.description,
      debit: c.amount,
      credit: 0,
    })),
    ...payments.map((p) => ({
      date: p.paid_on,
      type: 'odeme' as const,
      id: p.id,
      kind: p.method ?? 'odeme',
      description: p.note || 'Tahsilat',
      debit: 0,
      credit: p.amount,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date) || (a.type === b.type ? a.id - b.id : a.type === 'borc' ? -1 : 1))
  let balance = 0
  return rows.map((r) => {
    balance += r.debit - r.credit
    return { ...r, balance }
  })
}
