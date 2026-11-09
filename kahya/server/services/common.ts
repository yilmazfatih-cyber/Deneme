// Ortak servisler: kuruluş ayarları, yapay zekâ işlem günlüğü, giden mesaj kutusu.
import { DEFAULT_SETTINGS, type AiKind, type Channel, type OrgSettings } from '../../shared/labels.ts'
import { get, insert, run, type DB } from '../db/db.ts'
import type { Deps } from '../http.ts'

export function orgSettings(db: DB, orgId: number): OrgSettings {
  const row = get<{ settings: string }>(db, 'SELECT settings FROM orgs WHERE id = ?', orgId)
  let stored: Partial<OrgSettings>
  try {
    stored = JSON.parse(row?.settings ?? '{}') as Partial<OrgSettings>
  } catch {
    stored = {}
  }
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    autonomy: { ...DEFAULT_SETTINGS.autonomy, ...(stored.autonomy ?? {}) },
    reminders: { ...DEFAULT_SETTINGS.reminders, ...(stored.reminders ?? {}) },
  }
}

export type AiLogInput = {
  orgId: number
  siteId?: number | null
  kind: AiKind
  status: 'oneri' | 'uygulandi' | 'reddedildi' | 'bilgi' | 'hata'
  title: string
  payload?: unknown
  engine: string
  model?: string | null
  inputTokens?: number
  outputTokens?: number
  masked?: number
  refType?: string
  refId?: number
  note?: string | null
}

export function logAi(db: DB, a: AiLogInput): number {
  return insert(db, 'ai_actions', {
    org_id: a.orgId,
    site_id: a.siteId ?? null,
    kind: a.kind,
    status: a.status,
    title: a.title,
    payload: JSON.stringify(a.payload ?? {}),
    engine: a.engine,
    model: a.model ?? null,
    input_tokens: a.inputTokens ?? 0,
    output_tokens: a.outputTokens ?? 0,
    masked_count: a.masked ?? 0,
    ref_type: a.refType ?? null,
    ref_id: a.refId ?? null,
    note: a.note ?? null,
  })
}

// --- Giden mesajlar ---

export type PersonRow = {
  id: number
  org_id: number
  full_name: string
  phone: string | null
  email: string | null
  consent_sms: number
  consent_whatsapp: number
  consent_email: number
  anonymized_at: string | null
}

export type SendTarget = {
  orgId: number
  siteId?: number | null
  unitId?: number | null
  personId?: number | null
  channel: Channel
  /** Kişi kaydı olmayan gönderene yanıt için doğrudan adres. */
  address?: string | null
}

export type SendOptions = {
  body: string
  subject?: string
  kind: string
  replyTo?: number | null
  ticketId?: number | null
  /** Sakinin kendi başlattığı yazışmaya yanıtta izin tercihi aranmaz. */
  respectConsent?: boolean
}

export type SendOutcome = {
  messageId: number | null
  status: 'gonderildi' | 'hata' | 'atlandi'
  channel: Channel
  error?: string
}

const consentField: Partial<Record<Channel, keyof PersonRow>> = {
  sms: 'consent_sms',
  whatsapp: 'consent_whatsapp',
  email: 'consent_email',
}

export async function sendMessage(deps: Deps, t: SendTarget, o: SendOptions): Promise<SendOutcome> {
  const { db } = deps
  const person = t.personId
    ? get<PersonRow>(db, 'SELECT * FROM people WHERE id = ? AND org_id = ?', t.personId, t.orgId)
    : undefined
  let address = t.address ?? null
  if (person) {
    if (person.anonymized_at)
      return { messageId: null, status: 'atlandi', channel: t.channel, error: 'Kişi verileri silinmiş' }
    const field = consentField[t.channel]
    if (o.respectConsent !== false && field && !person[field]) {
      return {
        messageId: null,
        status: 'atlandi',
        channel: t.channel,
        error: 'Kişi bu kanaldan bilgilendirme almak istemiyor',
      }
    }
    address ??= t.channel === 'email' ? person.email : t.channel === 'portal' ? `kisi:${person.id}` : person.phone
  }
  if (!address) return { messageId: null, status: 'atlandi', channel: t.channel, error: 'İletişim bilgisi yok' }

  const messageId = insert(db, 'messages', {
    org_id: t.orgId,
    site_id: t.siteId ?? null,
    unit_id: t.unitId ?? null,
    person_id: person?.id ?? null,
    channel: t.channel,
    direction: 'giden',
    address,
    subject: o.subject ?? null,
    body: o.body,
    status: 'kuyrukta',
    kind: o.kind,
    reply_to: o.replyTo ?? null,
    ticket_id: o.ticketId ?? null,
  })
  const provider = deps.messaging.provider(t.channel)
  if (!provider) {
    // Portal: mesaj sakin portalında görünür, dış gönderim yoktur.
    run(db, `UPDATE messages SET status = 'gonderildi', provider = 'portal' WHERE id = ?`, messageId)
    return { messageId, status: 'gonderildi', channel: t.channel }
  }
  let inSessionWindow = false
  if (t.channel === 'whatsapp') {
    const lastIn = get<{ created_at: string }>(
      db,
      `SELECT created_at FROM messages WHERE org_id = ? AND channel = 'whatsapp' AND direction = 'gelen' AND address = ?
       ORDER BY created_at DESC LIMIT 1`,
      t.orgId,
      address,
    )
    inSessionWindow = Boolean(lastIn && deps.now().getTime() - new Date(lastIn.created_at).getTime() < 24 * 3_600_000)
  }
  const r = await provider.send({ to: address, body: o.body, subject: o.subject, inSessionWindow })
  run(
    db,
    `UPDATE messages SET status = ?, provider = ?, provider_id = ?, error = ? WHERE id = ?`,
    r.ok ? 'gonderildi' : 'hata',
    r.provider,
    r.providerId ?? null,
    r.error ?? null,
    messageId,
  )
  return { messageId, status: r.ok ? 'gonderildi' : 'hata', channel: t.channel, error: r.error }
}

/** Kişiye tercih sırasına göre ilk uygun kanaldan bildirim gönderir. */
export async function notifyPerson(
  deps: Deps,
  t: Omit<SendTarget, 'channel' | 'address'> & { personId: number },
  o: SendOptions & { channels?: Channel[] },
): Promise<SendOutcome> {
  const order = o.channels ?? (['whatsapp', 'sms', 'email', 'portal'] as Channel[])
  let last: SendOutcome = {
    messageId: null,
    status: 'atlandi',
    channel: order[0] ?? 'portal',
    error: 'Uygun kanal yok',
  }
  for (const channel of order) {
    last = await sendMessage(deps, { ...t, channel }, o)
    if (last.status === 'gonderildi') return last
  }
  return last
}
