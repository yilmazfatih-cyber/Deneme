// Yönetim panosu: göstergeler, grafik serisi, acil işler ve kural tabanlı "akıllı uyarılar".
import { BUDGET_CATEGORIES, OPEN_TICKET_STATUSES, type BudgetCategory } from '../../shared/labels.ts'
import { allowedSiteIds, inList } from '../access.ts'
import { all, get, type DB } from '../db/db.ts'
import { addMonths, dateInMonth, monthOf, today as todayOf } from '../domain/dates.ts'
import { formatTL } from '../domain/money.ts'
import { complianceStatus } from '../domain/schedule.ts'
import type { AppUser } from '../http.ts'
import { monthlySeries, siteStandings } from './finance.ts'

export type Insight = { level: 'kritik' | 'uyari' | 'bilgi'; text: string; link?: string }

export function dashboard(db: DB, user: AppUser, now: Date, siteId?: number) {
  const all_ = allowedSiteIds(db, user)
  const siteIds = siteId ? all_.filter((s) => s === siteId) : all_
  const list = inList(siteIds)
  const today = todayOf(now)
  const month = monthOf(today)

  let receivables = 0
  let overdue = 0
  let lateFees = 0
  let units = 0
  let over90: string[] = []
  for (const sid of siteIds) {
    const standings = siteStandings(db, sid, today)
    units += standings.length
    for (const s of standings) {
      if (s.position.balance > 0) receivables += s.position.balance
      overdue += s.position.overdue
      lateFees += s.position.lateFeeAccrued
      if (s.position.maxOverdueDays > 90) over90.push(s.label)
    }
  }
  over90 = over90.slice(0, 5)

  const monthCharged =
    get<{ t: number }>(
      db,
      `SELECT COALESCE(SUM(amount),0) AS t FROM charges WHERE site_id IN (${list}) AND status='aktif' AND kind IN ('aidat','ek') AND period = ?`,
      month,
    )?.t ?? 0
  const monthCollected =
    get<{ t: number }>(
      db,
      `SELECT COALESCE(SUM(amount),0) AS t FROM payments WHERE site_id IN (${list}) AND status='aktif' AND substr(paid_on,1,7) = ?`,
      month,
    )?.t ?? 0

  const openList = OPEN_TICKET_STATUSES.map((s) => `'${s}'`).join(',')
  const tickets = all<{
    id: number
    title: string
    priority: string
    status: string
    due_at: string | null
    site: string
    created_at: string
  }>(
    db,
    `SELECT t.id, t.title, t.priority, t.status, t.due_at, s.name AS site, t.created_at FROM tickets t JOIN sites s ON s.id = t.site_id
     WHERE t.site_id IN (${list}) AND t.status IN (${openList})
     ORDER BY CASE t.priority WHEN 'acil' THEN 0 WHEN 'yuksek' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, t.created_at`,
  )
  const nowIso = now.toISOString()
  const breaches = tickets.filter((t) => t.due_at && t.due_at < nowIso)

  const compliance = all<{
    id: number
    title: string
    next_due: string | null
    site: string
    kind: string
    result: string | null
  }>(
    db,
    `SELECT c.id, c.title, c.next_due, s.name AS site, c.kind, c.result FROM compliance_items c JOIN sites s ON s.id = c.site_id
     WHERE c.site_id IN (${list}) ORDER BY c.next_due IS NULL, c.next_due`,
  ).map((c) => ({ ...c, state: complianceStatus(c.next_due, today) }))

  const inbox = all<{
    id: number
    channel: string
    body: string
    triage: string | null
    status: string
    created_at: string
    person: string | null
  }>(
    db,
    `SELECT m.id, m.channel, m.body, m.triage, m.status, m.created_at, p.full_name AS person FROM messages m
     LEFT JOIN people p ON p.id = m.person_id
     WHERE m.org_id = ? AND m.direction = 'gelen' AND (m.site_id IS NULL OR m.site_id IN (${list}))
     ORDER BY m.created_at DESC LIMIT 6`,
    user.orgId,
  ).map((m) => ({ ...m, triage: m.triage ? (JSON.parse(m.triage) as Record<string, unknown>) : null }))

  const ai = get<{ total: number; auto: number; pending: number; tokens: number }>(
    db,
    `SELECT COUNT(*) AS total,
       SUM(CASE WHEN status = 'uygulandi' AND decided_by IS NULL THEN 1 ELSE 0 END) AS auto,
       SUM(CASE WHEN status = 'oneri' THEN 1 ELSE 0 END) AS pending,
       COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens
     FROM ai_actions WHERE org_id = ? AND (site_id IS NULL OR site_id IN (${list})) AND created_at >= ?`,
    user.orgId,
    `${addMonths(month, -1)}-01`,
  )!
  const pendingApprovals =
    get<{ n: number }>(
      db,
      `SELECT COUNT(*) AS n FROM ai_actions WHERE org_id = ? AND status = 'oneri' AND (site_id IS NULL OR site_id IN (${list}))`,
      user.orgId,
    )?.n ?? 0

  // Akıllı uyarılar (kural tabanlı, açıklanabilir)
  const insights: Insight[] = []
  for (const t of tickets.filter((x) => x.priority === 'acil')) {
    insights.push({
      level: 'kritik',
      text: `Acil talep açık: #${t.id} ${t.title} (${t.site})`,
      link: `/talepler/${t.id}`,
    })
  }
  if (breaches.length)
    insights.push({ level: 'uyari', text: `${breaches.length} talep hizmet süresini aştı.`, link: '/talepler' })
  for (const c of compliance.filter((x) => x.state === 'gecikti').slice(0, 3)) {
    insights.push({ level: 'kritik', text: `${c.site}: “${c.title}” süresi geçti.`, link: '/kontroller' })
  }
  for (const c of compliance.filter((x) => x.kind === 'asansor_periyodik' && x.result === 'kirmizi')) {
    insights.push({
      level: 'kritik',
      text: `${c.site}: asansör kırmızı etiketli — kullanıma kapatılmalı.`,
      link: '/kontroller',
    })
  }
  if (over90.length)
    insights.push({ level: 'uyari', text: `90 günü aşan borç: ${over90.join(', ')}.`, link: '/finans' })
  // Gider artışı: site ve kategori bazında bu ay, önceki 3 ay ortalamasının %40'tan fazla üzerinde
  const from3 = dateInMonth(addMonths(month, -3), 1)
  const spend = all<{ site_id: number; site: string; category: string; m: string; t: number }>(
    db,
    `SELECT e.site_id, s.name AS site, e.category, substr(e.spent_on,1,7) AS m, SUM(e.amount) AS t FROM expenses e
     JOIN sites s ON s.id = e.site_id WHERE e.site_id IN (${list}) AND e.spent_on >= ? GROUP BY e.site_id, e.category, m`,
    from3,
  )
  const groups = new Map<string, typeof spend>()
  for (const row of spend) {
    const key = `${row.site_id}:${row.category}`
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  for (const rows of groups.values()) {
    const cur = rows.find((x) => x.m === month)?.t ?? 0
    const avg = rows.filter((x) => x.m !== month).reduce((a, b) => a + b.t, 0) / 3
    if (avg > 0 && cur > avg * 1.4 && cur - avg > 100_000) {
      const label = BUDGET_CATEGORIES[rows[0]!.category as BudgetCategory] ?? rows[0]!.category
      insights.push({
        level: 'bilgi',
        text: `${rows[0]!.site}: ${label} gideri bu ay ${formatTL(cur)}; son 3 ay ortalamasının (${formatTL(Math.round(avg))}) %${Math.round((cur / avg - 1) * 100)} üzerinde.`,
        link: '/finans',
      })
    }
  }
  if (monthCharged > 0 && monthCollected / monthCharged < 0.5 && Number(today.slice(8, 10)) > 20) {
    insights.push({
      level: 'uyari',
      text: `Bu ay tahsilat oranı %${Math.round((monthCollected / monthCharged) * 100)}; hatırlatmaları gözden geçirin.`,
      link: '/finans',
    })
  }

  return {
    siteIds,
    kpis: {
      sites: siteIds.length,
      units,
      receivables,
      overdue,
      lateFees,
      monthCharged,
      monthCollected,
      collectionRate: monthCharged > 0 ? Math.round((monthCollected / monthCharged) * 100) : null,
      openTickets: tickets.length,
      urgentTickets: tickets.filter((t) => t.priority === 'acil' || t.priority === 'yuksek').length,
      slaBreaches: breaches.length,
      complianceOverdue: compliance.filter((c) => c.state === 'gecikti').length,
      complianceSoon: compliance.filter((c) => c.state === 'yaklasiyor').length,
      pendingApprovals,
      inboxNew: inbox.filter((m) => m.status === 'yeni' || m.status === 'beklemede').length,
    },
    series: monthlySeries(db, siteIds, month, 6),
    tickets: tickets.slice(0, 6),
    compliance: compliance.filter((c) => c.state !== 'tamam').slice(0, 6),
    inbox,
    insights,
    ai: { actions: ai.total ?? 0, automatic: ai.auto ?? 0, pending: pendingApprovals, tokens: ai.tokens ?? 0 },
  }
}
