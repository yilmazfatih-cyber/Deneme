// Finans servisleri: cari hesap, tahakkuk, tahsilat, gecikme tazminatı, raporlar.
import { all, audit, get, insert, run, tx, type DB } from '../db/db.ts'
import { computeAidat } from '../domain/budget.ts'
import { addMonths, dateInMonth, dateLabel, monthLabel, monthOf, monthsBetween } from '../domain/dates.ts'
import {
  allocate,
  lateFeePostings,
  position,
  statement,
  type LedgerCharge,
  type LedgerPayment,
  type Position,
} from '../domain/ledger.ts'
import { formatTL } from '../domain/money.ts'
import { fail } from '../http.ts'

export type ChargeRow = LedgerCharge & {
  site_id: number
  unit_id: number
  period: string | null
  status: string
  budget_id: number | null
  created_at: string
}
export type PaymentRow = LedgerPayment & {
  site_id: number
  unit_id: number
  method: string
  source: string
  status: string
  created_at: string
}

export function unitCharges(db: DB, unitId: number): ChargeRow[] {
  return all<ChargeRow>(
    db,
    `SELECT * FROM charges WHERE unit_id = ? AND status = 'aktif' ORDER BY due_date, id`,
    unitId,
  )
}

export function unitPayments(db: DB, unitId: number): PaymentRow[] {
  return all<PaymentRow>(
    db,
    `SELECT * FROM payments WHERE unit_id = ? AND status = 'aktif' ORDER BY paid_on, id`,
    unitId,
  )
}

export function siteBps(db: DB, siteId: number): number {
  return get<{ late_fee_bps: number }>(db, 'SELECT late_fee_bps FROM sites WHERE id = ?', siteId)?.late_fee_bps ?? 500
}

export function unitPosition(db: DB, unitId: number, asOf: string, bps?: number): Position {
  const unit = get<{ site_id: number }>(db, 'SELECT site_id FROM units WHERE id = ?', unitId)
  return position(unitCharges(db, unitId), unitPayments(db, unitId), asOf, bps ?? siteBps(db, unit?.site_id ?? 0))
}

export function unitStatement(db: DB, unitId: number) {
  return statement(unitCharges(db, unitId), unitPayments(db, unitId))
}

export type UnitBrief = {
  id: number
  site_id: number
  block: string | null
  no: string
  floor: number | null
  kind: string
  area_m2: number | null
  land_share: number
  payer_id: number | null
  payer_name: string | null
  payer_phone: string | null
  owner_name: string | null
  tenant_name: string | null
}

/** Sitenin bağımsız bölümleri: ödeyen kişi (yoksa malik), malik ve kiracı adlarıyla. */
export function siteUnits(db: DB, siteId: number): UnitBrief[] {
  return all<UnitBrief>(
    db,
    `SELECT u.id, u.site_id, b.name AS block, u.no, u.floor, u.kind, u.area_m2, u.land_share,
       (SELECT p.id FROM occupancies o JOIN people p ON p.id = o.person_id
         WHERE o.unit_id = u.id AND (o.end_date IS NULL OR o.end_date >= date('now'))
         ORDER BY o.is_payer DESC, o.role = 'malik' DESC, o.id LIMIT 1) AS payer_id,
       (SELECT p.full_name FROM occupancies o JOIN people p ON p.id = o.person_id
         WHERE o.unit_id = u.id AND (o.end_date IS NULL OR o.end_date >= date('now'))
         ORDER BY o.is_payer DESC, o.role = 'malik' DESC, o.id LIMIT 1) AS payer_name,
       (SELECT p.phone FROM occupancies o JOIN people p ON p.id = o.person_id
         WHERE o.unit_id = u.id AND (o.end_date IS NULL OR o.end_date >= date('now'))
         ORDER BY o.is_payer DESC, o.role = 'malik' DESC, o.id LIMIT 1) AS payer_phone,
       (SELECT group_concat(p.full_name, ', ') FROM occupancies o JOIN people p ON p.id = o.person_id
         WHERE o.unit_id = u.id AND o.role = 'malik' AND (o.end_date IS NULL OR o.end_date >= date('now'))) AS owner_name,
       (SELECT group_concat(p.full_name, ', ') FROM occupancies o JOIN people p ON p.id = o.person_id
         WHERE o.unit_id = u.id AND o.role = 'kiraci' AND (o.end_date IS NULL OR o.end_date >= date('now'))) AS tenant_name
     FROM units u LEFT JOIN blocks b ON b.id = u.block_id
     WHERE u.site_id = ?
     ORDER BY b.name, CAST(u.no AS INTEGER), u.no`,
    siteId,
  )
}

export const labelOf = (u: { block: string | null; no: string }) =>
  u.block ? `${u.block} No ${u.no}` : `Daire ${u.no}`

export type UnitStanding = UnitBrief & {
  label: string
  position: Position
  monthly: number | null
  lastReminder: { stage: string; created_at: string } | null
}

/** Tüm sitenin borç durumu (tek seferde okunur). */
export function siteStandings(db: DB, siteId: number, asOf: string): UnitStanding[] {
  const bps = siteBps(db, siteId)
  const units = siteUnits(db, siteId)
  const charges = all<ChargeRow>(db, `SELECT * FROM charges WHERE site_id = ? AND status = 'aktif'`, siteId)
  const payments = all<PaymentRow>(db, `SELECT * FROM payments WHERE site_id = ? AND status = 'aktif'`, siteId)
  const reminders = all<{ unit_id: number; stage: string; created_at: string }>(
    db,
    `SELECT r.unit_id, r.stage, r.created_at FROM reminders r JOIN units u ON u.id = r.unit_id
     WHERE u.site_id = ? ORDER BY r.created_at`,
    siteId,
  )
  const month = monthOf(asOf)
  return units.map((u) => {
    const uc = charges.filter((c) => c.unit_id === u.id)
    const up = payments.filter((p) => p.unit_id === u.id)
    const aidat =
      uc.find((c) => c.kind === 'aidat' && c.period === month) ?? [...uc].reverse().find((c) => c.kind === 'aidat')
    const last = [...reminders].reverse().find((r) => r.unit_id === u.id)
    return {
      ...u,
      label: labelOf(u),
      position: position(uc, up, asOf, bps),
      monthly: aidat?.amount ?? null,
      lastReminder: last ? { stage: last.stage, created_at: last.created_at } : null,
    }
  })
}

// --- Bütçe (işletme projesi) ---

export type BudgetRow = {
  id: number
  site_id: number
  name: string
  start_month: string
  months: number
  round_to: number
  status: 'taslak' | 'onaylandi' | 'gecici'
  approved_at: string | null
  approved_note: string | null
}
export type BudgetLineRow = {
  id: number
  budget_id: number
  category: string
  name: string
  annual_amount: number
  method: string
}

export function budgetPreview(db: DB, budgetId: number) {
  const budget = get<BudgetRow>(db, 'SELECT * FROM budgets WHERE id = ?', budgetId)
  if (!budget) fail(404, 'İşletme projesi bulunamadı')
  const lines = all<BudgetLineRow>(db, 'SELECT * FROM budget_lines WHERE budget_id = ? ORDER BY id', budgetId)
  const units = siteUnits(db, budget.site_id)
  if (units.length === 0) return { budget, lines, units: [], totals: null }
  let calc
  try {
    calc = computeAidat(lines, units, budget.months, budget.round_to)
  } catch (e) {
    fail(400, (e as Error).message)
  }
  const shares = new Map(calc.shares.map((s) => [s.unitId, s]))
  return {
    budget,
    lines,
    units: units.map((u) => ({
      id: u.id,
      label: labelOf(u),
      payer_name: u.payer_name,
      land_share: u.land_share,
      area_m2: u.area_m2,
      monthly: shares.get(u.id)!.monthly,
      annual: shares.get(u.id)!.annual,
      byMethod: shares.get(u.id)!.byMethod,
    })),
    totals: { budgetTotal: calc.budgetTotal, collectedTotal: calc.collectedTotal, roundingDiff: calc.roundingDiff },
  }
}

/** Ayı kapsayan onaylı (yoksa geçici) işletme projesi. */
export function activeBudget(db: DB, siteId: number, month: string): BudgetRow | undefined {
  return all<BudgetRow>(
    db,
    `SELECT * FROM budgets WHERE site_id = ? AND status IN ('onaylandi','gecici')
     ORDER BY status = 'onaylandi' DESC, start_month DESC, id DESC`,
    siteId,
  ).find((b) => {
    const k = monthsBetween(b.start_month, month)
    return k >= 0 && k < b.months
  })
}

/** Aylık aidat tahakkuku. Aynı ay için tekrar çalıştırmak çift kayıt üretmez. */
export function generateAccruals(db: DB, p: { siteId: number; month: string; userId?: number | null; orgId: number }) {
  const site = get<{ due_day: number }>(db, 'SELECT due_day FROM sites WHERE id = ?', p.siteId)
  if (!site) fail(404, 'Site bulunamadı')
  const budget = activeBudget(db, p.siteId, p.month)
  if (!budget) fail(400, `${monthLabel(p.month)} ayını kapsayan onaylı ya da geçici bir işletme projesi yok`)
  const preview = budgetPreview(db, budget.id)
  const dueDate = dateInMonth(p.month, site.due_day)
  const batchKey = `aidat:${p.month}:b${budget.id}`
  let created = 0
  let skipped = 0
  let total = 0
  tx(db, () => {
    for (const u of preview.units) {
      if (u.monthly <= 0) continue
      const r = run(
        db,
        `INSERT INTO charges (site_id, unit_id, kind, period, description, amount, due_date, late_fee, budget_id, batch_key, created_by)
         VALUES (?, ?, 'aidat', ?, ?, ?, ?, 1, ?, ?, ?)
         ON CONFLICT (unit_id, batch_key) WHERE batch_key IS NOT NULL DO NOTHING`,
        p.siteId,
        u.id,
        p.month,
        `${monthLabel(p.month)} aidatı`,
        u.monthly,
        dueDate,
        budget.id,
        batchKey,
        p.userId ?? null,
      )
      if (r.changes) {
        created++
        total += u.monthly
      } else skipped++
    }
    audit(db, {
      orgId: p.orgId,
      userId: p.userId,
      action: 'tahakkuk',
      entity: 'site',
      entityId: p.siteId,
      detail: { month: p.month, created, total },
    })
  })
  return { created, skipped, total, dueDate, budgetId: budget.id }
}

export function recordPayment(
  db: DB,
  p: {
    orgId: number
    siteId: number
    unitId: number
    amount: number
    paidOn: string
    method: string
    source?: string
    reference?: string | null
    note?: string | null
    userId?: number | null
  },
): number {
  if (p.reference) {
    const dup = get<{ id: number }>(
      db,
      `SELECT id FROM payments WHERE site_id = ? AND reference = ? AND status = 'aktif'`,
      p.siteId,
      p.reference,
    )
    if (dup) fail(409, `Bu referansla kayıtlı bir tahsilat zaten var (#${dup.id})`)
  }
  const id = insert(db, 'payments', {
    site_id: p.siteId,
    unit_id: p.unitId,
    amount: p.amount,
    paid_on: p.paidOn,
    method: p.method,
    source: p.source ?? 'manuel',
    reference: p.reference ?? null,
    note: p.note ?? null,
    created_by: p.userId ?? null,
  })
  audit(db, {
    orgId: p.orgId,
    userId: p.userId,
    action: 'tahsilat',
    entity: 'payment',
    entityId: id,
    detail: { amount: p.amount },
  })
  return id
}

/** KMK m.20 gecikme tazminatını `asOf` tarihine kadar tahakkuk ettirir (daire başına tek kalem). */
export function postLateFees(db: DB, p: { orgId: number; siteId: number; asOf: string; userId?: number | null }) {
  const bps = siteBps(db, p.siteId)
  if (bps <= 0) fail(400, 'Bu sitede gecikme tazminatı oranı sıfır')
  const units = all<{ id: number }>(db, 'SELECT id FROM units WHERE site_id = ?', p.siteId)
  let total = 0
  let unitsCharged = 0
  tx(db, () => {
    for (const u of units) {
      const charges = unitCharges(db, u.id)
      const posts = lateFeePostings(charges, unitPayments(db, u.id), p.asOf, bps)
      const amount = posts.reduce((s, x) => s + x.amount, 0)
      if (amount <= 0) continue
      insert(db, 'charges', {
        site_id: p.siteId,
        unit_id: u.id,
        kind: 'gecikme',
        period: monthOf(p.asOf),
        description: `Gecikme tazminatı (KMK m.20, aylık %${bps / 100}) — ${dateLabel(p.asOf)} itibarıyla`,
        amount,
        due_date: p.asOf,
        late_fee: 0,
        created_by: p.userId ?? null,
      })
      for (const x of posts) run(db, 'UPDATE charges SET late_fee_until = ? WHERE id = ?', p.asOf, x.chargeId)
      total += amount
      unitsCharged++
    }
    audit(db, {
      orgId: p.orgId,
      userId: p.userId,
      action: 'gecikme_tazminati',
      entity: 'site',
      entityId: p.siteId,
      detail: { asOf: p.asOf, total },
    })
  })
  return { total, units: unitsCharged }
}

/** Son `months` ay için tahakkuk ve tahsilat serisi (pano grafiği). */
export function monthlySeries(db: DB, siteIds: number[], endMonth: string, months = 6) {
  const list = siteIds.length ? siteIds.join(',') : '-1'
  const start = addMonths(endMonth, -(months - 1))
  const charged = all<{ m: string; total: number }>(
    db,
    `SELECT substr(due_date, 1, 7) AS m, SUM(amount) AS total FROM charges
     WHERE site_id IN (${list}) AND status = 'aktif' AND kind IN ('aidat','ek') AND substr(due_date,1,7) BETWEEN ? AND ?
     GROUP BY m`,
    start,
    endMonth,
  )
  const collected = all<{ m: string; total: number }>(
    db,
    `SELECT substr(paid_on, 1, 7) AS m, SUM(amount) AS total FROM payments
     WHERE site_id IN (${list}) AND status = 'aktif' AND substr(paid_on,1,7) BETWEEN ? AND ? GROUP BY m`,
    start,
    endMonth,
  )
  return Array.from({ length: months }, (_, i) => {
    const m = addMonths(start, i)
    return {
      month: m,
      label: monthLabel(m).split(' ')[0]!.slice(0, 3),
      charged: charged.find((x) => x.m === m)?.total ?? 0,
      collected: collected.find((x) => x.m === m)?.total ?? 0,
    }
  })
}

/** Gelir-gider ve bütçe-gerçekleşen raporu. */
export function financialReport(db: DB, siteId: number, from: string, to: string) {
  const income = all<{ m: string; total: number }>(
    db,
    `SELECT substr(paid_on,1,7) AS m, SUM(amount) AS total FROM payments
     WHERE site_id = ? AND status = 'aktif' AND paid_on BETWEEN ? AND ? GROUP BY m ORDER BY m`,
    siteId,
    from,
    to,
  )
  const expenses = all<{ category: string; total: number; count: number }>(
    db,
    `SELECT category, SUM(amount) AS total, COUNT(*) AS count FROM expenses
     WHERE site_id = ? AND spent_on BETWEEN ? AND ? GROUP BY category ORDER BY total DESC`,
    siteId,
    from,
    to,
  )
  const accrued = get<{ total: number }>(
    db,
    `SELECT COALESCE(SUM(amount),0) AS total FROM charges WHERE site_id = ? AND status = 'aktif' AND due_date BETWEEN ? AND ?`,
    siteId,
    from,
    to,
  )!.total
  const budget = activeBudget(db, siteId, monthOf(to)) ?? activeBudget(db, siteId, monthOf(from))
  let budgetVsActual: { category: string; planned: number; actual: number }[] = []
  if (budget) {
    const lines = all<BudgetLineRow>(db, 'SELECT * FROM budget_lines WHERE budget_id = ?', budget.id)
    const span = Math.max(1, monthsBetween(monthOf(from), monthOf(to)) + 1)
    const byCat = new Map<string, number>()
    for (const l of lines)
      byCat.set(l.category, (byCat.get(l.category) ?? 0) + Math.round((l.annual_amount * span) / budget.months))
    budgetVsActual = [...new Set([...byCat.keys(), ...expenses.map((e) => e.category)])].map((category) => ({
      category,
      planned: byCat.get(category) ?? 0,
      actual: expenses.find((e) => e.category === category)?.total ?? 0,
    }))
  }
  const totalIncome = income.reduce((s, x) => s + x.total, 0)
  const totalExpense = expenses.reduce((s, x) => s + x.total, 0)
  return {
    from,
    to,
    income,
    expenses,
    accrued,
    totalIncome,
    totalExpense,
    net: totalIncome - totalExpense,
    collectionRate: accrued > 0 ? Math.round((totalIncome / accrued) * 1000) / 10 : null,
    budget: budget ? { id: budget.id, name: budget.name } : null,
    budgetVsActual,
  }
}

/** Sakin asistanı ve hatırlatmalar için düz metin hesap özeti. */
export function accountFacts(db: DB, unitIds: number[], asOf: string): string | null {
  if (unitIds.length === 0) return null
  const lines: string[] = []
  for (const id of unitIds) {
    const u = get<{ id: number; no: string; block: string | null; site_id: number; iban: string | null; site: string }>(
      db,
      `SELECT u.id, u.no, b.name AS block, u.site_id, s.iban, s.name AS site FROM units u
       JOIN sites s ON s.id = u.site_id LEFT JOIN blocks b ON b.id = u.block_id WHERE u.id = ?`,
      id,
    )
    if (!u) continue
    const p = unitPosition(db, id, asOf)
    const parts = [
      `${u.site} ${labelOf(u)}: güncel bakiye ${p.balance >= 0 ? `${formatTL(p.balance)} borç` : `${formatTL(-p.balance)} avans`}`,
      p.overdue > 0
        ? `vadesi geçmiş ${formatTL(p.overdue)} (en eski vade ${dateLabel(p.oldestOverdue!)})`
        : 'vadesi geçmiş borç yok',
      p.lateFeeAccrued > 0 ? `işleyen gecikme tazminatı ${formatTL(p.lateFeeAccrued)}` : null,
      p.nextDue ? `sonraki ödeme ${dateLabel(p.nextDue.date)} tarihinde ${formatTL(p.nextDue.amount)}` : null,
      u.iban ? `ödeme IBAN'ı ${u.iban} (açıklamaya blok ve daire no yazılmalı)` : null,
    ]
    lines.push(parts.filter(Boolean).join('; ') + '.')
  }
  return lines.join('\n')
}

export { allocate }
