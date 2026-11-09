// Personel: finans — işletme projesi, tahakkuk, tahsilat, banka hareketi eşleştirme, gecikme tazminatı,
// hatırlatmalar, giderler ve raporlar.
import { Hono } from 'hono'
import { z } from 'zod'
import {
  BUDGET_CATEGORIES,
  CHARGE_KINDS,
  DISTRIBUTION_METHODS,
  PAYMENT_METHODS,
  type BudgetCategory,
  type ChargeKind,
  type DistributionMethod,
  type PaymentMethod,
} from '../../shared/labels.ts'
import { allowedSiteIds, assertSite, assertUnit } from '../access.ts'
import { assertRole } from '../auth/auth.ts'
import { all, audit, get, insert, run, tx } from '../db/db.ts'
import { splitExtra } from '../domain/budget.ts'
import { addMonths, isMonth, monthOf, today } from '../domain/dates.ts'
import { lateFeePostings } from '../domain/ledger.ts'
import { body, fail, idParam, parseQuery, zDate, zKurus, zMonth, type Deps, type Env } from '../http.ts'
import { createBankImport } from '../services/bank.ts'
import { orgSettings } from '../services/common.ts'
import {
  budgetPreview,
  financialReport,
  generateAccruals,
  postLateFees,
  recordPayment,
  siteStandings,
  siteUnits,
  unitCharges,
  unitPayments,
  unitStatement,
  type BudgetRow,
} from '../services/finance.ts'
import { reminderCandidates, runReminders } from '../services/reminders.ts'

const keysOf = <T extends Record<string, unknown>>(o: T) =>
  Object.keys(o) as [keyof T & string, ...(keyof T & string)[]]

const BudgetSchema = z.object({
  name: z.string().trim().min(2).max(120),
  startMonth: zMonth,
  months: z.number().int().min(1).max(24).default(12),
  roundTo: z.union([z.literal(1), z.literal(100), z.literal(1000)]).default(100),
  lines: z
    .array(
      z.object({
        category: z.enum(keysOf(BUDGET_CATEGORIES)),
        name: z.string().trim().min(1).max(120),
        annualAmount: z.number().int().min(0),
        method: z.enum(keysOf(DISTRIBUTION_METHODS)),
      }),
    )
    .min(1, 'En az bir gider kalemi girin'),
})

export function financeRoutes(deps: Deps) {
  const { db } = deps
  const r = new Hono<Env>()
  const writer = (role: string) => {
    if (role === 'muhasebe' || role === 'admin' || role === 'yonetici') return
    fail(403, 'Bu işlem için yetkiniz yok')
  }

  r.get('/sites/:id/finance', (c) => {
    const site = assertSite(db, c.get('user'), idParam(c))
    const { asOf } = parseQuery(c, z.object({ asOf: zDate.optional() }))
    const date = asOf ?? today(deps.now())
    const units = siteStandings(db, site.id, date)
    const sum = (f: (u: (typeof units)[number]) => number) => units.reduce((a, u) => a + f(u), 0)
    return c.json({
      site,
      asOf: date,
      totals: {
        receivables: sum((u) => Math.max(0, u.position.balance)),
        credits: sum((u) => Math.max(0, -u.position.balance)),
        overdue: sum((u) => u.position.overdue),
        lateFees: sum((u) => u.position.lateFeeAccrued),
        debtors: units.filter((u) => u.position.overdue > 0).length,
        aging: {
          d0_30: sum((u) => u.position.aging.d0_30),
          d31_60: sum((u) => u.position.aging.d31_60),
          d61_90: sum((u) => u.position.aging.d61_90),
          d90p: sum((u) => u.position.aging.d90p),
        },
      },
      units,
    })
  })

  // --- İşletme projesi ---
  r.get('/sites/:id/budgets', (c) => {
    const site = assertSite(db, c.get('user'), idParam(c))
    return c.json(
      all(
        db,
        `SELECT b.*, (SELECT COALESCE(SUM(annual_amount),0) FROM budget_lines l WHERE l.budget_id = b.id) AS total
         FROM budgets b WHERE b.site_id = ? ORDER BY b.start_month DESC, b.id DESC`,
        site.id,
      ),
    )
  })

  const saveLines = (budgetId: number, lines: z.infer<typeof BudgetSchema>['lines']) => {
    run(db, 'DELETE FROM budget_lines WHERE budget_id = ?', budgetId)
    for (const l of lines) {
      insert(db, 'budget_lines', {
        budget_id: budgetId,
        category: l.category,
        name: l.name,
        annual_amount: l.annualAmount,
        method: l.method,
      })
    }
  }

  r.post('/sites/:id/budgets', async (c) => {
    const user = c.get('user')
    writer(user.role)
    const site = assertSite(db, user, idParam(c))
    const p = await body(c, BudgetSchema)
    const id = tx(db, () => {
      const id = insert(db, 'budgets', {
        site_id: site.id,
        name: p.name,
        start_month: p.startMonth,
        months: p.months,
        round_to: p.roundTo,
      })
      saveLines(id, p.lines)
      return id
    })
    audit(db, { orgId: user.orgId, userId: user.id, action: 'butce_ekle', entity: 'budget', entityId: id })
    return c.json({ id }, 201)
  })

  const loadBudget = (user: Parameters<typeof assertSite>[1], id: number) => {
    const b = get<BudgetRow>(db, 'SELECT * FROM budgets WHERE id = ?', id)
    if (!b) fail(404, 'İşletme projesi bulunamadı')
    assertSite(db, user, b.site_id)
    return b
  }

  r.get('/budgets/:id', (c) => {
    const b = loadBudget(c.get('user'), idParam(c))
    return c.json(budgetPreview(db, b.id))
  })

  r.put('/budgets/:id', async (c) => {
    const user = c.get('user')
    writer(user.role)
    const b = loadBudget(user, idParam(c))
    if (b.status === 'onaylandi') fail(409, 'Kurulca onaylanmış proje değiştirilemez; yeni bir proje oluşturun')
    const p = await body(c, BudgetSchema)
    tx(db, () => {
      run(
        db,
        'UPDATE budgets SET name = ?, start_month = ?, months = ?, round_to = ? WHERE id = ?',
        p.name,
        p.startMonth,
        p.months,
        p.roundTo,
        b.id,
      )
      saveLines(b.id, p.lines)
    })
    return c.json({ ok: true })
  })

  r.post('/budgets/:id/status', async (c) => {
    const user = c.get('user')
    assertRole(user, ['admin', 'yonetici'])
    const b = loadBudget(user, idParam(c))
    const p = await body(
      c,
      z.object({ status: z.enum(['taslak', 'onaylandi', 'gecici']), note: z.string().max(500).nullable().optional() }),
    )
    if (b.status === 'onaylandi' && p.status !== 'onaylandi') fail(409, 'Onaylı proje geri alınamaz')
    run(
      db,
      'UPDATE budgets SET status = ?, approved_at = ?, approved_note = ? WHERE id = ?',
      p.status,
      p.status === 'taslak' ? null : deps.now().toISOString(),
      p.note ?? null,
      b.id,
    )
    audit(db, {
      orgId: user.orgId,
      userId: user.id,
      action: `butce_${p.status}`,
      entity: 'budget',
      entityId: b.id,
      detail: p.note,
    })
    return c.json({ ok: true })
  })

  r.delete('/budgets/:id', (c) => {
    const user = c.get('user')
    writer(user.role)
    const b = loadBudget(user, idParam(c))
    if (b.status !== 'taslak') fail(409, 'Yalnız taslak proje silinebilir')
    run(db, 'DELETE FROM budgets WHERE id = ?', b.id)
    return c.json({ ok: true })
  })

  // --- Tahakkuk ---
  r.post('/sites/:id/accruals', async (c) => {
    const user = c.get('user')
    writer(user.role)
    const site = assertSite(db, user, idParam(c))
    const { month } = await body(c, z.object({ month: zMonth }))
    return c.json(generateAccruals(db, { siteId: site.id, month, userId: user.id, orgId: user.orgId }))
  })

  r.post('/sites/:id/extra-charges', async (c) => {
    const user = c.get('user')
    writer(user.role)
    const site = assertSite(db, user, idParam(c))
    const p = await body(
      c,
      z.object({
        description: z.string().trim().min(3).max(200),
        total: zKurus,
        method: z.enum(keysOf(DISTRIBUTION_METHODS)),
        dueDate: zDate,
        lateFee: z.boolean().default(true),
      }),
    )
    const units = siteUnits(db, site.id)
    let parts
    try {
      parts = splitExtra(p.total, p.method as DistributionMethod, units)
    } catch (e) {
      fail(400, (e as Error).message)
    }
    const batch = `ek:${deps.now().getTime()}`
    tx(db, () => {
      for (const part of parts) {
        if (part.amount <= 0) continue
        insert(db, 'charges', {
          site_id: site.id,
          unit_id: part.unitId,
          kind: 'ek',
          period: monthOf(p.dueDate),
          description: p.description,
          amount: part.amount,
          due_date: p.dueDate,
          late_fee: p.lateFee,
          batch_key: batch,
          created_by: user.id,
        })
      }
    })
    audit(db, {
      orgId: user.orgId,
      userId: user.id,
      action: 'ek_toplama',
      entity: 'site',
      entityId: site.id,
      detail: p,
    })
    return c.json({ units: parts.length, total: p.total }, 201)
  })

  r.post('/units/:id/charges', async (c) => {
    const user = c.get('user')
    writer(user.role)
    const unit = assertUnit(db, user, idParam(c))
    const p = await body(
      c,
      z.object({
        kind: z.enum(keysOf(CHARGE_KINDS)),
        description: z.string().trim().min(2).max(200),
        amount: zKurus,
        dueDate: zDate,
        lateFee: z.boolean().default(true),
      }),
    )
    const id = insert(db, 'charges', {
      site_id: unit.site_id,
      unit_id: unit.id,
      kind: p.kind as ChargeKind,
      period: monthOf(p.dueDate),
      description: p.description,
      amount: p.amount,
      due_date: p.dueDate,
      late_fee: p.kind === 'gecikme' ? false : p.lateFee,
      created_by: user.id,
    })
    audit(db, { orgId: user.orgId, userId: user.id, action: 'borc_ekle', entity: 'charge', entityId: id })
    return c.json({ id }, 201)
  })

  r.delete('/charges/:id', (c) => {
    const user = c.get('user')
    writer(user.role)
    const ch = get<{ id: number; unit_id: number; status: string }>(
      db,
      'SELECT id, unit_id, status FROM charges WHERE id = ?',
      idParam(c),
    )
    if (!ch) fail(404, 'Borç kaydı bulunamadı')
    assertUnit(db, user, ch.unit_id)
    run(db, `UPDATE charges SET status = 'iptal' WHERE id = ?`, ch.id)
    audit(db, { orgId: user.orgId, userId: user.id, action: 'borc_iptal', entity: 'charge', entityId: ch.id })
    return c.json({ ok: true })
  })

  r.get('/sites/:id/charges', (c) => {
    const site = assertSite(db, c.get('user'), idParam(c))
    const { month } = parseQuery(c, z.object({ month: zMonth.optional() }))
    const m = month ?? monthOf(today(deps.now()))
    return c.json(
      all(
        db,
        `SELECT c.*, u.no, b.name AS block FROM charges c JOIN units u ON u.id = c.unit_id LEFT JOIN blocks b ON b.id = u.block_id
         WHERE c.site_id = ? AND (c.period = ? OR substr(c.due_date,1,7) = ?) ORDER BY b.name, CAST(u.no AS INTEGER), c.id`,
        site.id,
        m,
        m,
      ),
    )
  })

  // --- Tahsilat ---
  r.post('/payments', async (c) => {
    const user = c.get('user')
    writer(user.role)
    const p = await body(
      c,
      z.object({
        unitId: z.number().int().positive(),
        amount: zKurus,
        paidOn: zDate,
        method: z.enum(keysOf(PAYMENT_METHODS)),
        reference: z.string().trim().max(80).nullable().optional(),
        note: z.string().trim().max(300).nullable().optional(),
      }),
    )
    const unit = assertUnit(db, user, p.unitId)
    const id = recordPayment(db, {
      orgId: user.orgId,
      siteId: unit.site_id,
      unitId: unit.id,
      amount: p.amount,
      paidOn: p.paidOn,
      method: p.method as PaymentMethod,
      reference: p.reference || null,
      note: p.note || null,
      userId: user.id,
    })
    return c.json({ id }, 201)
  })

  r.delete('/payments/:id', (c) => {
    const user = c.get('user')
    writer(user.role)
    const pay = get<{ id: number; unit_id: number }>(db, 'SELECT id, unit_id FROM payments WHERE id = ?', idParam(c))
    if (!pay) fail(404, 'Tahsilat bulunamadı')
    assertUnit(db, user, pay.unit_id)
    run(db, `UPDATE payments SET status = 'iptal' WHERE id = ?`, pay.id)
    run(db, `UPDATE bank_rows SET status = 'bekliyor', payment_id = NULL WHERE payment_id = ?`, pay.id)
    audit(db, { orgId: user.orgId, userId: user.id, action: 'tahsilat_iptal', entity: 'payment', entityId: pay.id })
    return c.json({ ok: true })
  })

  r.get('/sites/:id/payments', (c) => {
    const site = assertSite(db, c.get('user'), idParam(c))
    const t = today(deps.now())
    const { from, to } = parseQuery(c, z.object({ from: zDate.optional(), to: zDate.optional() }))
    return c.json(
      all(
        db,
        `SELECT p.*, u.no, b.name AS block FROM payments p JOIN units u ON u.id = p.unit_id LEFT JOIN blocks b ON b.id = u.block_id
         WHERE p.site_id = ? AND p.paid_on BETWEEN ? AND ? ORDER BY p.paid_on DESC, p.id DESC LIMIT 500`,
        site.id,
        from ?? `${addMonths(monthOf(t), -2)}-01`,
        to ?? t,
      ),
    )
  })

  r.get('/units/:id/statement', (c) => {
    const unit = assertUnit(db, c.get('user'), idParam(c))
    return c.json(unitStatement(db, unit.id))
  })

  // --- Gecikme tazminatı ---
  r.get('/sites/:id/late-fees', (c) => {
    const site = assertSite(db, c.get('user'), idParam(c))
    const { asOf } = parseQuery(c, z.object({ asOf: zDate.optional() }))
    const date = asOf ?? today(deps.now())
    const units = siteUnits(db, site.id)
    const rows = units
      .map((u) => ({
        unitId: u.id,
        label: u.block ? `${u.block} No ${u.no}` : `Daire ${u.no}`,
        payer: u.payer_name,
        amount: lateFeePostings(unitCharges(db, u.id), unitPayments(db, u.id), date, site.late_fee_bps).reduce(
          (s, x) => s + x.amount,
          0,
        ),
      }))
      .filter((x) => x.amount > 0)
    return c.json({ asOf: date, bps: site.late_fee_bps, rows, total: rows.reduce((s, x) => s + x.amount, 0) })
  })

  r.post('/sites/:id/late-fees', async (c) => {
    const user = c.get('user')
    writer(user.role)
    const site = assertSite(db, user, idParam(c))
    const { asOf } = await body(c, z.object({ asOf: zDate }))
    if (asOf > today(deps.now())) fail(400, 'Gelecek tarih için tazminat tahakkuk ettirilemez')
    return c.json(postLateFees(db, { orgId: user.orgId, siteId: site.id, asOf, userId: user.id }))
  })

  // --- Hatırlatmalar ---
  r.get('/sites/:id/reminders', (c) => {
    const user = c.get('user')
    const site = assertSite(db, user, idParam(c))
    return c.json(reminderCandidates(db, [site.id], today(deps.now()), orgSettings(db, user.orgId)))
  })

  r.post('/sites/:id/reminders', async (c) => {
    const user = c.get('user')
    const site = assertSite(db, user, idParam(c))
    const p = await body(
      c,
      z.object({ unitIds: z.array(z.number().int()).optional(), mode: z.enum(['oneri', 'otomatik']).default('oneri') }),
    )
    const r2 = await runReminders(deps, {
      orgId: user.orgId,
      siteIds: [site.id],
      asOf: today(deps.now()),
      mode: p.mode,
      settings: orgSettings(db, user.orgId),
      unitIds: p.unitIds,
    })
    audit(db, {
      orgId: user.orgId,
      userId: user.id,
      action: 'hatirlatma',
      entity: 'site',
      entityId: site.id,
      detail: r2,
    })
    return c.json(r2)
  })

  // --- Giderler ---
  r.get('/sites/:id/expenses', (c) => {
    const site = assertSite(db, c.get('user'), idParam(c))
    const t = today(deps.now())
    const { from, to } = parseQuery(c, z.object({ from: zDate.optional(), to: zDate.optional() }))
    return c.json(
      all(
        db,
        `SELECT e.*, v.name AS vendor_name FROM expenses e LEFT JOIN vendors v ON v.id = e.vendor_id
         WHERE e.site_id = ? AND e.spent_on BETWEEN ? AND ? ORDER BY e.spent_on DESC, e.id DESC`,
        site.id,
        from ?? `${addMonths(monthOf(t), -5)}-01`,
        to ?? t,
      ),
    )
  })

  r.post('/sites/:id/expenses', async (c) => {
    const user = c.get('user')
    writer(user.role)
    const site = assertSite(db, user, idParam(c))
    const p = await body(
      c,
      z.object({
        spentOn: zDate,
        category: z.enum(keysOf(BUDGET_CATEGORIES)),
        description: z.string().trim().min(2).max(200),
        amount: zKurus,
        vendorId: z.number().int().positive().nullable().optional(),
        invoiceNo: z.string().trim().max(40).nullable().optional(),
        ticketId: z.number().int().positive().nullable().optional(),
      }),
    )
    if (p.vendorId && !get(db, 'SELECT id FROM vendors WHERE id = ? AND org_id = ?', p.vendorId, user.orgId))
      fail(400, 'Tedarikçi bulunamadı')
    if (p.ticketId && !get(db, 'SELECT id FROM tickets WHERE id = ? AND site_id = ?', p.ticketId, site.id))
      fail(400, 'Talep bulunamadı')
    const id = insert(db, 'expenses', {
      site_id: site.id,
      spent_on: p.spentOn,
      category: p.category as BudgetCategory,
      description: p.description,
      amount: p.amount,
      vendor_id: p.vendorId ?? null,
      invoice_no: p.invoiceNo ?? null,
      ticket_id: p.ticketId ?? null,
      created_by: user.id,
    })
    if (p.ticketId) run(db, 'UPDATE tickets SET cost = COALESCE(cost, 0) + ? WHERE id = ?', p.amount, p.ticketId)
    audit(db, {
      orgId: user.orgId,
      userId: user.id,
      action: 'gider',
      entity: 'expense',
      entityId: id,
      detail: { amount: p.amount },
    })
    return c.json({ id }, 201)
  })

  r.delete('/expenses/:id', (c) => {
    const user = c.get('user')
    writer(user.role)
    const e = get<{ id: number; site_id: number }>(db, 'SELECT id, site_id FROM expenses WHERE id = ?', idParam(c))
    if (!e) fail(404, 'Gider bulunamadı')
    assertSite(db, user, e.site_id)
    run(db, 'DELETE FROM expenses WHERE id = ?', e.id)
    audit(db, { orgId: user.orgId, userId: user.id, action: 'gider_sil', entity: 'expense', entityId: e.id })
    return c.json({ ok: true })
  })

  r.get('/sites/:id/report', (c) => {
    const site = assertSite(db, c.get('user'), idParam(c))
    const t = today(deps.now())
    const { from, to } = parseQuery(c, z.object({ from: zDate.optional(), to: zDate.optional() }))
    return c.json(financialReport(db, site.id, from ?? `${monthOf(t).slice(0, 4)}-01-01`, to ?? t))
  })

  // --- Banka hareketi içe aktarma ---
  r.post('/sites/:id/bank-imports', async (c) => {
    const user = c.get('user')
    writer(user.role)
    const site = assertSite(db, user, idParam(c))
    const p = await body(
      c,
      z.object({ csv: z.string().min(10).max(5_000_000), filename: z.string().max(200).nullable().optional() }),
    )
    const {
      id: importId,
      rows,
      skipped,
    } = createBankImport(db, {
      siteId: site.id,
      csv: p.csv,
      filename: p.filename,
      userId: user.id,
      asOf: today(deps.now()),
    })
    audit(db, {
      orgId: user.orgId,
      userId: user.id,
      action: 'banka_ice_aktar',
      entity: 'bank_import',
      entityId: importId,
    })
    return c.json({ id: importId, rows, skipped }, 201)
  })

  r.get('/sites/:id/bank-imports', (c) => {
    const site = assertSite(db, c.get('user'), idParam(c))
    return c.json(
      all(
        db,
        `SELECT i.*, (SELECT COUNT(*) FROM bank_rows r WHERE r.import_id = i.id AND r.status = 'eslesti') AS matched,
           (SELECT COUNT(*) FROM bank_rows r WHERE r.import_id = i.id AND r.status = 'bekliyor') AS pending
         FROM bank_imports i WHERE i.site_id = ? ORDER BY i.id DESC LIMIT 30`,
        site.id,
      ),
    )
  })

  const loadImport = (user: Parameters<typeof assertSite>[1], id: number) => {
    const imp = get<{ id: number; site_id: number }>(db, 'SELECT * FROM bank_imports WHERE id = ?', id)
    if (!imp) fail(404, 'İçe aktarma bulunamadı')
    assertSite(db, user, imp.site_id)
    return imp
  }

  r.get('/bank-imports/:id', (c) => {
    const imp = loadImport(c.get('user'), idParam(c))
    const units = siteUnits(db, imp.site_id).map((u) => ({
      id: u.id,
      label: u.block ? `${u.block} No ${u.no}` : `Daire ${u.no}`,
      payer: u.payer_name,
    }))
    const rows = all(db, 'SELECT * FROM bank_rows WHERE import_id = ? ORDER BY row_no', imp.id)
    return c.json({ import: imp, rows, units })
  })

  r.post('/bank-imports/:id/confirm', async (c) => {
    const user = c.get('user')
    writer(user.role)
    const imp = loadImport(user, idParam(c))
    const p = await body(
      c,
      z.object({
        rows: z.array(
          z.object({
            rowId: z.number().int(),
            action: z.enum(['eslestir', 'yoksay']),
            unitId: z.number().int().positive().nullable().optional(),
          }),
        ),
      }),
    )
    const validUnits = new Set(siteUnits(db, imp.site_id).map((u) => u.id))
    let matched = 0
    let ignored = 0
    tx(db, () => {
      for (const x of p.rows) {
        const row = get<{
          id: number
          status: string
          amount: number
          txn_date: string
          reference: string | null
          description: string
        }>(db, 'SELECT * FROM bank_rows WHERE id = ? AND import_id = ?', x.rowId, imp.id)
        if (!row || row.status !== 'bekliyor') continue
        if (x.action === 'yoksay') {
          run(db, `UPDATE bank_rows SET status = 'yoksay' WHERE id = ?`, row.id)
          ignored++
          continue
        }
        if (!x.unitId || !validUnits.has(x.unitId)) fail(400, `Satır ${x.rowId}: geçerli bir bağımsız bölüm seçin`)
        const paymentId = recordPayment(db, {
          orgId: user.orgId,
          siteId: imp.site_id,
          unitId: x.unitId,
          amount: row.amount,
          paidOn: row.txn_date,
          method: 'havale',
          source: 'banka',
          reference: row.reference ?? `banka:${imp.id}:${row.id}`,
          note: row.description.slice(0, 200),
          userId: user.id,
        })
        run(
          db,
          `UPDATE bank_rows SET status = 'eslesti', payment_id = ?, suggested_unit_id = ? WHERE id = ?`,
          paymentId,
          x.unitId,
          row.id,
        )
        matched++
      }
    })
    audit(db, {
      orgId: user.orgId,
      userId: user.id,
      action: 'banka_eslestir',
      entity: 'bank_import',
      entityId: imp.id,
      detail: { matched, ignored },
    })
    return c.json({ matched, ignored })
  })

  // Portföy geneli: bu ay tahsilat özeti (şirket yöneticisi için)
  r.get('/finance/overview', (c) => {
    const user = c.get('user')
    const asOf = today(deps.now())
    const { month } = parseQuery(c, z.object({ month: z.string().optional() }))
    const m = month && isMonth(month) ? month : monthOf(asOf)
    const sites = allowedSiteIds(db, user).map((id) => {
      const s = get<{ id: number; name: string }>(db, 'SELECT id, name FROM sites WHERE id = ?', id)!
      const charged =
        get<{ t: number }>(
          db,
          `SELECT COALESCE(SUM(amount),0) AS t FROM charges WHERE site_id = ? AND status='aktif' AND period = ? AND kind IN ('aidat','ek')`,
          id,
          m,
        )?.t ?? 0
      const collected =
        get<{ t: number }>(
          db,
          `SELECT COALESCE(SUM(amount),0) AS t FROM payments WHERE site_id = ? AND status='aktif' AND substr(paid_on,1,7) = ?`,
          id,
          m,
        )?.t ?? 0
      return { ...s, charged, collected, rate: charged ? Math.round((collected / charged) * 100) : null }
    })
    return c.json({ month: m, sites })
  })

  return r
}
