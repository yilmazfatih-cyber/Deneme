// Yapay zekâ önerilerini (onay kuyruğu) uygular: yanıt gönder, talep oluştur, usta ata, hatırlatma gönder.
// Otomatik moddaki işler de aynı fonksiyonlardan geçer; böylece her işlem tek yerden ve aynı kurallarla yürür.
import type { Channel, OrgSettings, Priority, ReminderStage, TicketCategory } from '../../shared/labels.ts'
import { get, insert, run, type DB } from '../db/db.ts'
import { nowIso } from '../domain/dates.ts'
import { fail, type Deps } from '../http.ts'
import { logAi, notifyPerson, sendMessage } from './common.ts'
import { assignVendor, createTicket, suggestVendors } from './tickets.ts'

export type ReplyPayload = {
  messageId: number
  channel: Channel
  to: string | null
  personId: number | null
  siteId: number | null
  unitId: number | null
  body: string
}
export type TicketPayload = {
  siteId: number | null
  unitId: number | null
  personId: number | null
  title: string
  description: string
  category: TicketCategory
  priority: Priority
  location: string | null
  messageId: number | null
  source: string
}
export type AssignPayload = { ticketId: number; vendorId: number; vendorName: string; reason: string }
export type ReminderPayload = {
  siteId: number
  unitId: number
  personId: number | null
  stage: ReminderStage
  amount: number
  body: string
  channels: Channel[]
}

export type ActionRow = {
  id: number
  org_id: number
  site_id: number | null
  kind: string
  status: string
  title: string
  payload: string
  engine: string
  model: string | null
}

type Outcome = { note: string; refType?: string; refId?: number }

export async function sendReply(deps: Deps, orgId: number, p: ReplyPayload): Promise<Outcome> {
  const r = await sendMessage(
    deps,
    {
      orgId,
      siteId: p.siteId,
      unitId: p.unitId,
      personId: p.personId,
      channel: p.channel,
      address: p.channel === 'portal' ? null : p.to,
    },
    { body: p.body, kind: 'yanit', replyTo: p.messageId, respectConsent: false },
  )
  if (r.status !== 'gonderildi') fail(502, `Yanıt gönderilemedi: ${r.error ?? r.status}`)
  run(deps.db, `UPDATE messages SET status = 'islendi' WHERE id = ? AND status <> 'arsiv'`, p.messageId)
  return { note: `Yanıt ${p.channel} ile gönderildi`, refType: 'message', refId: r.messageId ?? undefined }
}

export async function notifyVendor(deps: Deps, orgId: number, ticketId: number) {
  const t = get<{
    title: string
    site: string
    unit_no: string | null
    block: string | null
    manager_phone: string | null
    phone: string | null
  }>(
    deps.db,
    `SELECT t.title, s.name AS site, u.no AS unit_no, b.name AS block, s.manager_phone, v.phone
     FROM tickets t JOIN sites s ON s.id = t.site_id JOIN vendors v ON v.id = t.vendor_id
     LEFT JOIN units u ON u.id = t.unit_id LEFT JOIN blocks b ON b.id = u.block_id WHERE t.id = ?`,
    ticketId,
  )
  if (!t?.phone) return
  const where = t.unit_no ? `${t.block ? `${t.block} ` : ''}No ${t.unit_no}` : 'ortak alan'
  await sendMessage(
    deps,
    { orgId, channel: 'sms', address: t.phone },
    {
      body: `İş emri #${ticketId}: ${t.site}, ${where} — ${t.title}.${t.manager_phone ? ` Site yöneticisi: ${t.manager_phone}.` : ''} Kâhya`,
      kind: 'is_emri',
      ticketId,
      respectConsent: false,
    },
  )
}

export async function afterTicketCreated(deps: Deps, orgId: number, ticketId: number, settings: OrgSettings) {
  const level = settings.autonomy.assign_vendor
  if (level === 'kapali') return
  const ticket = get<{ category: TicketCategory; site_id: number; vendor_id: number | null; title: string }>(
    deps.db,
    'SELECT category, site_id, vendor_id, title FROM tickets WHERE id = ?',
    ticketId,
  )
  if (!ticket || ticket.vendor_id || ticket.category === 'aidat' || ticket.category === 'gurultu') return
  const best = suggestVendors(deps.db, orgId, ticket.category)[0]
  if (!best) return
  const payload: AssignPayload = { ticketId, vendorId: best.id, vendorName: best.name, reason: best.reason }
  if (level === 'otomatik') {
    assignVendor(deps.db, ticketId, best.id, 'Yapay zekâ')
    await notifyVendor(deps, orgId, ticketId)
    logAi(deps.db, {
      orgId,
      siteId: ticket.site_id,
      kind: 'atama',
      status: 'uygulandi',
      title: `#${ticketId} → ${best.name}`,
      payload,
      engine: 'kural',
      refType: 'ticket',
      refId: ticketId,
    })
  } else {
    logAi(deps.db, {
      orgId,
      siteId: ticket.site_id,
      kind: 'atama',
      status: 'oneri',
      title: `#${ticketId} ${ticket.title} → ${best.name}`,
      payload,
      engine: 'kural',
      refType: 'ticket',
      refId: ticketId,
    })
  }
}

export async function sendReminder(deps: Deps, orgId: number, p: ReminderPayload): Promise<Outcome> {
  if (!p.personId) fail(400, 'Hatırlatma için kayıtlı kişi yok')
  const r = await notifyPerson(
    deps,
    { orgId, siteId: p.siteId, unitId: p.unitId, personId: p.personId },
    { body: p.body, kind: 'hatirlatma', channels: p.channels.length ? p.channels : undefined },
  )
  if (r.status !== 'gonderildi') fail(502, `Hatırlatma gönderilemedi: ${r.error ?? r.status}`)
  insert(deps.db, 'reminders', { unit_id: p.unitId, stage: p.stage, amount: p.amount, message_id: r.messageId })
  return { note: `Hatırlatma ${r.channel} ile gönderildi`, refType: 'message', refId: r.messageId ?? undefined }
}

/** Onay kuyruğundaki öneriyi (isteğe bağlı düzeltmelerle) uygular. */
export async function approveAction(
  deps: Deps,
  p: { orgId: number; userId: number; actionId: number; edits?: Record<string, unknown>; settings: OrgSettings },
) {
  const { db } = deps
  const action = get<ActionRow>(db, 'SELECT * FROM ai_actions WHERE id = ? AND org_id = ?', p.actionId, p.orgId)
  if (!action) fail(404, 'Öneri bulunamadı')
  if (action.status !== 'oneri') fail(409, 'Bu öneri zaten sonuçlandırılmış')
  const payload = { ...(JSON.parse(action.payload) as Record<string, unknown>), ...(p.edits ?? {}) }
  let outcome: Outcome
  switch (action.kind) {
    case 'yanit':
      outcome = await sendReply(deps, p.orgId, payload as ReplyPayload)
      break
    case 'talep': {
      const t = payload as TicketPayload
      if (!t.siteId) fail(400, 'Talebi oluşturmak için site seçin')
      const id = createTicket(db, {
        orgId: p.orgId,
        siteId: t.siteId,
        unitId: t.unitId,
        personId: t.personId,
        title: t.title,
        description: t.description,
        category: t.category,
        priority: t.priority,
        location: t.location,
        source: t.source,
        messageId: t.messageId,
        actor: 'Personel (yapay zekâ önerisi)',
        now: deps.now(),
      })
      await afterTicketCreated(deps, p.orgId, id, p.settings)
      outcome = { note: `Talep #${id} oluşturuldu`, refType: 'ticket', refId: id }
      break
    }
    case 'atama': {
      const a = payload as AssignPayload
      const v = assignVendor(db, a.ticketId, a.vendorId, 'Personel (yapay zekâ önerisi)')
      await notifyVendor(deps, p.orgId, a.ticketId)
      outcome = { note: `${v.name} görevlendirildi`, refType: 'ticket', refId: a.ticketId }
      break
    }
    case 'hatirlatma':
      outcome = await sendReminder(deps, p.orgId, payload as ReminderPayload)
      break
    default:
      fail(400, 'Bu öneri türü uygulanamaz')
  }
  run(
    db,
    `UPDATE ai_actions SET status = 'uygulandi', payload = ?, decided_by = ?, decided_at = ?, note = ?, ref_type = COALESCE(?, ref_type), ref_id = COALESCE(?, ref_id) WHERE id = ?`,
    JSON.stringify(payload),
    p.userId,
    nowIso(deps.now()),
    outcome.note,
    outcome.refType ?? null,
    outcome.refId ?? null,
    action.id,
  )
  return outcome
}

export function rejectAction(
  db: DB,
  p: { orgId: number; userId: number; actionId: number; reason?: string; now: Date },
) {
  const action = get<ActionRow>(db, 'SELECT * FROM ai_actions WHERE id = ? AND org_id = ?', p.actionId, p.orgId)
  if (!action) fail(404, 'Öneri bulunamadı')
  if (action.status !== 'oneri') fail(409, 'Bu öneri zaten sonuçlandırılmış')
  run(
    db,
    `UPDATE ai_actions SET status = 'reddedildi', decided_by = ?, decided_at = ?, note = ? WHERE id = ?`,
    p.userId,
    nowIso(p.now),
    p.reason ?? null,
    action.id,
  )
}
