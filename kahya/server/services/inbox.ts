// Gelen kutusu: WhatsApp / SMS / e-posta / portal mesajını kaydeder, gönderen kişiyi ve daireyi bulur,
// yapay zekâyla sınıflandırır ve kuruluşun özerklik ayarına göre talep açar, yanıtlar ya da onaya sunar.
import { TICKET_CATEGORIES, type Channel } from '../../shared/labels.ts'
import { all, get, insert, run, type DB } from '../db/db.ts'
import { blockKey, findUnitByHint } from '../domain/matcher.ts'
import { normalizePhone } from '../domain/text.ts'
import type { Deps } from '../http.ts'
import type { Triage } from '../ai/schemas.ts'
import { afterTicketCreated, sendReply, type ReplyPayload, type TicketPayload } from './actions.ts'
import { logAi, orgSettings, sendMessage, type PersonRow } from './common.ts'
import { createTicket } from './tickets.ts'

export type InboundInput = {
  channel: Channel
  from: string
  body: string
  subject?: string | null
  provider?: string | null
  providerId?: string | null
  orgId?: number | null
  personId?: number | null
}

export type StoredTriage = Triage & {
  engine: string
  model: string | null
  masked: number
  fallbackReason?: string
  siteId: number | null
  unitId: number | null
}

type PersonUnit = { id: number; site_id: number; no: string; block: string | null }

function personUnits(db: DB, personId: number): PersonUnit[] {
  return all<PersonUnit>(
    db,
    `SELECT u.id, u.site_id, u.no, b.name AS block FROM occupancies o JOIN units u ON u.id = o.unit_id
     LEFT JOIN blocks b ON b.id = u.block_id
     WHERE o.person_id = ? AND (o.end_date IS NULL OR o.end_date >= date('now')) ORDER BY o.is_payer DESC, o.id`,
    personId,
  )
}

export function resolveSender(db: DB, input: InboundInput): { orgId: number; person: PersonRow | null } {
  let person: PersonRow | undefined
  if (input.personId) person = get<PersonRow>(db, 'SELECT * FROM people WHERE id = ?', input.personId)
  else if (input.channel === 'email') {
    const email = input.from.trim().toLowerCase()
    person = get<PersonRow>(
      db,
      `SELECT * FROM people WHERE lower(email) = ? AND anonymized_at IS NULL ${input.orgId ? 'AND org_id = ?' : ''} ORDER BY id DESC`,
      ...(input.orgId ? [email, input.orgId] : [email]),
    )
  } else {
    const phone = normalizePhone(input.from)
    if (phone) {
      person = get<PersonRow>(
        db,
        `SELECT * FROM people WHERE phone = ? AND anonymized_at IS NULL ${input.orgId ? 'AND org_id = ?' : ''} ORDER BY id DESC`,
        ...(input.orgId ? [phone, input.orgId] : [phone]),
      )
    }
  }
  const orgId =
    person?.org_id ?? input.orgId ?? get<{ id: number }>(db, 'SELECT id FROM orgs ORDER BY id LIMIT 1')?.id ?? 0
  return { orgId, person: person ?? null }
}

export async function receiveInbound(deps: Deps, input: InboundInput) {
  const { db } = deps
  if (input.provider && input.providerId) {
    const dup = get<{ id: number }>(
      db,
      `SELECT id FROM messages WHERE provider = ? AND provider_id = ? AND direction = 'gelen'`,
      input.provider,
      input.providerId,
    )
    if (dup) return { messageId: dup.id, duplicate: true as const }
  }
  const { orgId, person } = resolveSender(db, input)
  if (!orgId) throw new Error('Kuruluş bulunamadı')
  const units = person ? personUnits(db, person.id) : []
  const siteIds = [...new Set(units.map((u) => u.site_id))]
  const address =
    input.channel === 'email' ? input.from.trim().toLowerCase() : (normalizePhone(input.from) ?? input.from.trim())
  const messageId = insert(db, 'messages', {
    org_id: orgId,
    site_id: siteIds.length === 1 ? siteIds[0] : null,
    unit_id: units.length === 1 ? units[0]!.id : null,
    person_id: person?.id ?? null,
    channel: input.channel,
    direction: 'gelen',
    address,
    subject: input.subject ?? null,
    body: input.body,
    status: 'yeni',
    provider: input.provider ?? null,
    provider_id: input.providerId ?? null,
  })
  const result = await processMessage(deps, messageId)
  return { messageId, duplicate: false as const, result }
}

export type ProcessResult = { triage: StoredTriage; ticketId: number | null; proposals: number; replied: boolean }

export async function processMessage(deps: Deps, messageId: number): Promise<ProcessResult> {
  const { db } = deps
  const msg = get<{
    id: number
    org_id: number
    site_id: number | null
    unit_id: number | null
    person_id: number | null
    channel: Channel
    address: string | null
    body: string
  }>(db, 'SELECT * FROM messages WHERE id = ?', messageId)
  if (!msg) throw new Error('Mesaj bulunamadı')
  const person = msg.person_id ? get<PersonRow>(db, 'SELECT * FROM people WHERE id = ?', msg.person_id) : undefined
  const units = person ? personUnits(db, person.id) : []
  let siteId = msg.site_id
  if (!siteId) {
    const orgSites = all<{ id: number }>(db, 'SELECT id FROM sites WHERE org_id = ?', msg.org_id)
    if (orgSites.length === 1) siteId = orgSites[0]!.id
  }
  const site = siteId
    ? get<{ id: number; name: string; manager_phone: string | null }>(db, 'SELECT * FROM sites WHERE id = ?', siteId)
    : undefined
  const blocks = siteId
    ? all<{ name: string }>(db, 'SELECT name FROM blocks WHERE site_id = ? ORDER BY name', siteId)
    : []
  const senderUnit = units.find((u) => u.id === msg.unit_id) ?? (units.length === 1 ? units[0] : undefined)

  const ai = await deps.ai.triage({
    text: msg.body,
    channel: msg.channel,
    siteName: site?.name,
    blockNames: blocks.map((b) => b.name),
    blockKeys: blocks.map((b) => blockKey(b.name)),
    senderName: person?.full_name,
    senderUnit: senderUnit
      ? senderUnit.block
        ? `${senderUnit.block} No ${senderUnit.no}`
        : `Daire ${senderUnit.no}`
      : null,
  })
  const tri = ai.result

  // Birim: tek dairesi varsa o; değilse mesajdaki blok/daire ipucu
  let unitId = senderUnit?.id ?? null
  if (tri.unit_hint) {
    const hint = {
      block: tri.block_hint ? blockKey(tri.block_hint) : null,
      unit: tri.unit_hint.replace(/\D/g, '') || null,
    }
    const pool = units.length
      ? units
      : siteId
        ? all<PersonUnit>(
            db,
            `SELECT u.id, u.site_id, u.no, b.name AS block FROM units u LEFT JOIN blocks b ON b.id = u.block_id WHERE u.site_id = ?`,
            siteId,
          )
        : []
    const found = findUnitByHint(hint, pool)
    if (found) {
      unitId = found.id
      siteId = pool.find((u) => u.id === found.id)?.site_id ?? siteId
    }
  }

  const stored: StoredTriage = {
    ...tri,
    engine: ai.engine,
    model: ai.model,
    masked: ai.masked,
    fallbackReason: ai.fallbackReason,
    siteId,
    unitId,
  }
  run(
    db,
    'UPDATE messages SET triage = ?, site_id = ?, unit_id = ? WHERE id = ?',
    JSON.stringify(stored),
    siteId,
    unitId,
    msg.id,
  )
  logAi(db, {
    orgId: msg.org_id,
    siteId,
    kind: 'triage',
    status: 'bilgi',
    title: tri.summary,
    payload: { intent: tri.intent, category: tri.category, priority: tri.priority },
    engine: ai.engine,
    model: ai.model,
    inputTokens: ai.inputTokens,
    outputTokens: ai.outputTokens,
    masked: ai.masked,
    refType: 'message',
    refId: msg.id,
    note: ai.fallbackReason ? `Kural motoruna düşüldü: ${ai.fallbackReason}` : null,
  })

  const settings = orgSettings(db, msg.org_id)
  let ticketId: number | null = null
  let proposals = 0
  let replied = false
  const emergency = tri.priority === 'acil'

  if (tri.needs_ticket) {
    const payload: TicketPayload = {
      siteId,
      unitId,
      personId: person?.id ?? null,
      title: tri.ticket_title,
      description: msg.body,
      category: tri.category,
      priority: tri.priority,
      location: tri.location === 'bilinmiyor' ? null : tri.location === 'daire_ici' ? 'Daire içi' : 'Ortak alan',
      messageId: msg.id,
      source: msg.channel,
    }
    const level = settings.autonomy.create_ticket
    if ((level === 'otomatik' || emergency) && siteId) {
      ticketId = createTicket(db, {
        orgId: msg.org_id,
        siteId,
        unitId,
        personId: person?.id ?? null,
        title: payload.title,
        description: payload.description,
        category: payload.category,
        priority: payload.priority,
        location: payload.location,
        source: msg.channel,
        messageId: msg.id,
        actor: 'Yapay zekâ',
        now: deps.now(),
      })
      logAi(db, {
        orgId: msg.org_id,
        siteId,
        kind: 'talep',
        status: 'uygulandi',
        title: `#${ticketId} ${payload.title}`,
        payload,
        engine: ai.engine,
        model: ai.model,
        refType: 'ticket',
        refId: ticketId,
      })
      await afterTicketCreated(deps, msg.org_id, ticketId, settings)
    } else if (level !== 'kapali') {
      logAi(db, {
        orgId: msg.org_id,
        siteId,
        kind: 'talep',
        status: 'oneri',
        title: `${TICKET_CATEGORIES[payload.category]}: ${payload.title}`,
        payload,
        engine: ai.engine,
        model: ai.model,
        refType: 'message',
        refId: msg.id,
      })
      proposals++
    }
  }

  const replyLevel = settings.autonomy.reply
  if (replyLevel !== 'kapali' && tri.reply.trim()) {
    const body = ticketId ? `${tri.reply.trim()} (Talep no: #${ticketId})` : tri.reply.trim()
    const payload: ReplyPayload = {
      messageId: msg.id,
      channel: msg.channel === 'telefon' ? 'sms' : msg.channel,
      to: msg.channel === 'portal' ? null : msg.address,
      personId: person?.id ?? null,
      siteId,
      unitId,
      body,
    }
    if (replyLevel === 'otomatik' || emergency) {
      try {
        const out = await sendReply(deps, msg.org_id, payload)
        replied = true
        logAi(db, {
          orgId: msg.org_id,
          siteId,
          kind: 'yanit',
          status: 'uygulandi',
          title: body,
          payload,
          engine: ai.engine,
          model: ai.model,
          refType: out.refType,
          refId: out.refId,
          note:
            emergency && replyLevel !== 'otomatik' ? 'Acil durum: güvenlik yanıtı onay beklemeden gönderildi' : null,
        })
      } catch (e) {
        logAi(db, {
          orgId: msg.org_id,
          siteId,
          kind: 'yanit',
          status: 'oneri',
          title: body,
          payload,
          engine: ai.engine,
          note: (e as Error).message,
        })
        proposals++
      }
    } else {
      logAi(db, {
        orgId: msg.org_id,
        siteId,
        kind: 'yanit',
        status: 'oneri',
        title: body,
        payload,
        engine: ai.engine,
        model: ai.model,
        refType: 'message',
        refId: msg.id,
      })
      proposals++
    }
  }

  if (emergency) {
    const phone = settings.emergencyPhone ?? site?.manager_phone
    if (phone) {
      await sendMessage(
        deps,
        { orgId: msg.org_id, siteId, channel: 'sms', address: phone },
        {
          body: `ACİL (${site?.name ?? 'site belirsiz'}): ${tri.summary}${ticketId ? ` — talep #${ticketId}` : ''}`,
          kind: 'acil_bildirim',
          respectConsent: false,
        },
      )
    }
  }

  run(
    db,
    `UPDATE messages SET status = ? WHERE id = ? AND status <> 'arsiv'`,
    proposals > 0 ? 'beklemede' : 'islendi',
    msg.id,
  )
  return { triage: stored, ticketId, proposals, replied }
}
