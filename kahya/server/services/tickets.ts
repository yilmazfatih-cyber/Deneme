// Arıza ve talepler: oluşturma, hizmet seviyesi, usta/firma önerisi ve atama, zaman çizelgesi.
import {
  CATEGORY_TRADE,
  PRIORITIES,
  TICKET_STATUSES,
  type Priority,
  type TicketCategory,
  type TicketStatus,
} from '../../shared/labels.ts'
import { all, get, insert, run, tx, type DB } from '../db/db.ts'
import { nowIso } from '../domain/dates.ts'
import { slaDueAt } from '../domain/schedule.ts'

export type TicketRow = {
  id: number
  org_id: number
  site_id: number
  unit_id: number | null
  person_id: number | null
  title: string
  description: string
  category: TicketCategory
  priority: Priority
  status: TicketStatus
  location: string | null
  vendor_id: number | null
  source: string
  due_at: string | null
  cost: number | null
  message_id: number | null
  created_at: string
  updated_at: string
  resolved_at: string | null
}

export function addTicketEvent(db: DB, ticketId: number, actor: string, kind: string, body: string, isPublic = false) {
  insert(db, 'ticket_events', { ticket_id: ticketId, actor, kind, body, public: isPublic })
  run(db, `UPDATE tickets SET updated_at = ? WHERE id = ?`, nowIso(), ticketId)
}

export function createTicket(
  db: DB,
  p: {
    orgId: number
    siteId: number
    unitId?: number | null
    personId?: number | null
    title: string
    description: string
    category: TicketCategory
    priority: Priority
    location?: string | null
    source: string
    messageId?: number | null
    actor: string
    now?: Date
  },
): number {
  return tx(db, () => {
    const id = insert(db, 'tickets', {
      org_id: p.orgId,
      site_id: p.siteId,
      unit_id: p.unitId ?? null,
      person_id: p.personId ?? null,
      title: p.title.slice(0, 160),
      description: p.description,
      category: p.category,
      priority: p.priority,
      location: p.location ?? null,
      source: p.source,
      message_id: p.messageId ?? null,
      due_at: slaDueAt(p.priority, p.now ?? new Date()),
    })
    addTicketEvent(db, id, p.actor, 'olusturuldu', `Talep oluşturuldu — öncelik: ${PRIORITIES[p.priority]}`, true)
    if (p.messageId) run(db, 'UPDATE messages SET ticket_id = ? WHERE id = ?', id, p.messageId)
    return id
  })
}

export type VendorSuggestion = {
  id: number
  name: string
  trade: string
  phone: string | null
  rating: number | null
  open_jobs: number
  score: number
  reason: string
}

/** Kategoriye uygun ustalar: puan yüksek ve elindeki açık iş az olan önce. */
export function suggestVendors(db: DB, orgId: number, category: TicketCategory): VendorSuggestion[] {
  const trade = CATEGORY_TRADE[category] ?? 'genel'
  const rows = all<Omit<VendorSuggestion, 'score' | 'reason'>>(
    db,
    `SELECT v.id, v.name, v.trade, v.phone, v.rating,
       (SELECT COUNT(*) FROM tickets t WHERE t.vendor_id = v.id AND t.status IN ('atandi','islemde','beklemede')) AS open_jobs
     FROM vendors v WHERE v.org_id = ? AND v.active = 1 AND (v.trade = ? OR v.trade = 'genel')`,
    orgId,
    trade,
  )
  return rows
    .map((v) => {
      const score = (v.rating ?? 3) * 2 - v.open_jobs + (v.trade === trade ? 2 : 0)
      const reason = `${v.trade === trade ? 'Uzmanlık eşleşiyor' : 'Genel tamir'}; puan ${v.rating ?? '—'}/5; açık iş ${v.open_jobs}`
      return { ...v, score, reason }
    })
    .sort((a, b) => b.score - a.score)
}

export function assignVendor(db: DB, ticketId: number, vendorId: number, actor: string) {
  const vendor = get<{ name: string; phone: string | null }>(
    db,
    'SELECT name, phone FROM vendors WHERE id = ?',
    vendorId,
  )
  if (!vendor) throw new Error('Usta / firma bulunamadı')
  tx(db, () => {
    run(
      db,
      `UPDATE tickets SET vendor_id = ?, status = CASE WHEN status = 'acik' THEN 'atandi' ELSE status END, updated_at = ? WHERE id = ?`,
      vendorId,
      nowIso(),
      ticketId,
    )
    addTicketEvent(db, ticketId, actor, 'atama', `${vendor.name} görevlendirildi`, true)
  })
  return vendor
}

export function setTicketStatus(db: DB, ticketId: number, status: TicketStatus, actor: string, note?: string) {
  tx(db, () => {
    run(
      db,
      `UPDATE tickets SET status = ?, updated_at = ?,
         resolved_at = CASE WHEN ? IN ('cozuldu','kapandi') THEN COALESCE(resolved_at, ?) ELSE NULL END
       WHERE id = ?`,
      status,
      nowIso(),
      status,
      nowIso(),
      ticketId,
    )
    addTicketEvent(db, ticketId, actor, 'durum', `Durum: ${TICKET_STATUSES[status]}${note ? ` — ${note}` : ''}`, true)
  })
}
