// Personel: talepler, gelen kutusu (yapay zekâ sınıflandırması), onay kuyruğu, duyurular, giden kutusu.
import { Hono } from 'hono'
import { z } from 'zod'
import {
  CHANNELS,
  PRIORITIES,
  SENDABLE_CHANNELS,
  TICKET_CATEGORIES,
  TICKET_STATUSES,
  type Channel,
  type Priority,
  type TicketCategory,
  type TicketStatus,
} from '../../shared/labels.ts'
import { allowedSiteIds, assertOrgRow, assertSite, assertUnit, inList } from '../access.ts'
import { all, audit, get, run } from '../db/db.ts'
import { normalizePhone } from '../domain/text.ts'
import { body, fail, idParam, json, parseQuery, zIdQuery, type Deps, type Env } from '../http.ts'
import { approveAction, notifyVendor, rejectAction } from '../services/actions.ts'
import { logAi, notifyPerson, orgSettings, sendMessage } from '../services/common.ts'
import { processMessage, receiveInbound } from '../services/inbox.ts'
import {
  addTicketEvent,
  assignVendor,
  createTicket,
  setTicketStatus,
  suggestVendors,
  type TicketRow,
} from '../services/tickets.ts'

const keysOf = <T extends Record<string, unknown>>(o: T) =>
  Object.keys(o) as [keyof T & string, ...(keyof T & string)[]]

export function opsRoutes(deps: Deps) {
  const { db } = deps
  const r = new Hono<Env>()

  // --- Talepler ---
  r.get('/tickets', (c) => {
    const user = c.get('user')
    const q = parseQuery(
      c,
      z.object({
        siteId: zIdQuery.optional(),
        status: z.string().optional(),
        priority: z.string().optional(),
        vendorId: zIdQuery.optional(),
      }),
    )
    const sites = q.siteId ? [assertSite(db, user, q.siteId).id] : allowedSiteIds(db, user)
    const statuses =
      q.status === 'acik'
        ? ['acik', 'atandi', 'islemde', 'beklemede']
        : q.status && Object.hasOwn(TICKET_STATUSES, q.status)
          ? [q.status]
          : Object.keys(TICKET_STATUSES)
    const rows = all(
      db,
      `SELECT t.*, s.name AS site_name, u.no AS unit_no, b.name AS block, v.name AS vendor_name, p.full_name AS person_name
       FROM tickets t JOIN sites s ON s.id = t.site_id LEFT JOIN units u ON u.id = t.unit_id LEFT JOIN blocks b ON b.id = u.block_id
       LEFT JOIN vendors v ON v.id = t.vendor_id LEFT JOIN people p ON p.id = t.person_id
       WHERE t.site_id IN (${inList(sites)}) AND t.status IN (${statuses.map((s) => `'${s}'`).join(',')})
         ${q.priority && Object.hasOwn(PRIORITIES, q.priority) ? `AND t.priority = '${q.priority}'` : ''}
         ${q.vendorId ? `AND t.vendor_id = ${Number(q.vendorId)}` : ''}
       ORDER BY CASE WHEN t.status IN ('cozuldu','kapandi') THEN 1 ELSE 0 END,
         CASE t.priority WHEN 'acil' THEN 0 WHEN 'yuksek' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, t.created_at DESC
       LIMIT 300`,
    )
    return c.json(rows)
  })

  const TicketSchema = z.object({
    siteId: z.number().int().positive(),
    unitId: z.number().int().positive().nullable().optional(),
    personId: z.number().int().positive().nullable().optional(),
    title: z.string().trim().min(3).max(160),
    description: z.string().trim().max(4000).default(''),
    category: z.enum(keysOf(TICKET_CATEGORIES)),
    priority: z.enum(keysOf(PRIORITIES)),
    location: z.string().trim().max(80).nullable().optional(),
  })

  r.post('/tickets', async (c) => {
    const user = c.get('user')
    const p = await body(c, TicketSchema)
    const site = assertSite(db, user, p.siteId)
    if (p.unitId && assertUnit(db, user, p.unitId).site_id !== site.id) fail(400, 'Bağımsız bölüm bu siteye ait değil')
    const id = createTicket(db, {
      orgId: user.orgId,
      siteId: site.id,
      unitId: p.unitId ?? null,
      personId: p.personId ?? null,
      title: p.title,
      description: p.description,
      category: p.category as TicketCategory,
      priority: p.priority as Priority,
      location: p.location ?? null,
      source: 'personel',
      actor: user.name,
      now: deps.now(),
    })
    return c.json({ id }, 201)
  })

  const loadTicket = (user: Parameters<typeof assertSite>[1], id: number) =>
    assertOrgRow<TicketRow>(db, user, 'tickets', id, 'Talep')

  r.get('/tickets/:id', (c) => {
    const user = c.get('user')
    const t = loadTicket(user, idParam(c))
    const extra = get(
      db,
      `SELECT s.name AS site_name, u.no AS unit_no, b.name AS block, v.name AS vendor_name, v.phone AS vendor_phone,
         p.full_name AS person_name, p.phone AS person_phone
       FROM tickets t JOIN sites s ON s.id = t.site_id LEFT JOIN units u ON u.id = t.unit_id LEFT JOIN blocks b ON b.id = u.block_id
       LEFT JOIN vendors v ON v.id = t.vendor_id LEFT JOIN people p ON p.id = t.person_id WHERE t.id = ?`,
      t.id,
    )
    const message = t.message_id
      ? get(db, 'SELECT id, channel, body, created_at, triage FROM messages WHERE id = ?', t.message_id)
      : null
    return c.json({
      ticket: { ...t, ...(extra as object) },
      events: all(db, 'SELECT * FROM ticket_events WHERE ticket_id = ? ORDER BY id', t.id),
      message: message
        ? { ...(message as object), triage: json((message as { triage: string | null }).triage, null) }
        : null,
      suggestions: suggestVendors(db, user.orgId, t.category).slice(0, 4),
      expenses: all(db, 'SELECT id, spent_on, description, amount FROM expenses WHERE ticket_id = ?', t.id),
    })
  })

  r.patch('/tickets/:id', async (c) => {
    const user = c.get('user')
    const t = loadTicket(user, idParam(c))
    const p = await body(
      c,
      z.object({
        status: z.enum(keysOf(TICKET_STATUSES)).optional(),
        priority: z.enum(keysOf(PRIORITIES)).optional(),
        category: z.enum(keysOf(TICKET_CATEGORIES)).optional(),
        vendorId: z.number().int().positive().optional(),
        title: z.string().trim().min(3).max(160).optional(),
        note: z.string().trim().max(1000).optional(),
      }),
    )
    if (p.vendorId) {
      if (!get(db, 'SELECT id FROM vendors WHERE id = ? AND org_id = ?', p.vendorId, user.orgId))
        fail(400, 'Tedarikçi bulunamadı')
      assignVendor(db, t.id, p.vendorId, user.name)
      await notifyVendor(deps, user.orgId, t.id)
    }
    if (p.priority && p.priority !== t.priority) {
      run(db, 'UPDATE tickets SET priority = ? WHERE id = ?', p.priority, t.id)
      addTicketEvent(db, t.id, user.name, 'oncelik', `Öncelik: ${PRIORITIES[p.priority as Priority]}`)
    }
    if (p.category && p.category !== t.category) {
      run(db, 'UPDATE tickets SET category = ? WHERE id = ?', p.category, t.id)
      addTicketEvent(db, t.id, user.name, 'kategori', `Kategori: ${TICKET_CATEGORIES[p.category as TicketCategory]}`)
    }
    if (p.title) run(db, 'UPDATE tickets SET title = ? WHERE id = ?', p.title, t.id)
    if (p.status && p.status !== t.status) {
      setTicketStatus(db, t.id, p.status as TicketStatus, user.name, p.note)
      if ((p.status === 'cozuldu' || p.status === 'kapandi') && t.person_id) {
        await notifyPerson(
          deps,
          { orgId: user.orgId, siteId: t.site_id, unitId: t.unit_id, personId: t.person_id },
          {
            body: `#${t.id} numaralı talebiniz (${t.title}) çözüldü olarak işaretlendi.${p.note ? ` Not: ${p.note}` : ''} Sorun devam ederse bu mesaja yanıt verebilirsiniz.`,
            kind: 'talep_guncelleme',
            ticketId: t.id,
          },
        )
      }
    }
    return c.json({ ok: true })
  })

  r.post('/tickets/:id/events', async (c) => {
    const user = c.get('user')
    const t = loadTicket(user, idParam(c))
    const p = await body(
      c,
      z.object({
        body: z.string().trim().min(1).max(2000),
        public: z.boolean().default(false),
        notify: z.boolean().default(false),
      }),
    )
    addTicketEvent(db, t.id, user.name, 'yorum', p.body, p.public)
    let notified = null
    if (p.public && p.notify && t.person_id) {
      notified = await notifyPerson(
        deps,
        { orgId: user.orgId, siteId: t.site_id, unitId: t.unit_id, personId: t.person_id },
        { body: `#${t.id} numaralı talebiniz hakkında: ${p.body}`, kind: 'talep_guncelleme', ticketId: t.id },
      )
    }
    return c.json({ ok: true, notified }, 201)
  })

  // --- Gelen kutusu ---
  r.get('/inbox', (c) => {
    const user = c.get('user')
    const q = parseQuery(c, z.object({ status: z.string().optional(), siteId: zIdQuery.optional() }))
    const sites = q.siteId ? [assertSite(db, user, q.siteId).id] : allowedSiteIds(db, user)
    const statusSql =
      q.status === 'arsiv'
        ? `m.status = 'arsiv'`
        : q.status === 'tumu'
          ? '1=1'
          : q.status === 'islendi'
            ? `m.status = 'islendi'`
            : `m.status IN ('yeni','beklemede')`
    const rows = all<{ triage: string | null }>(
      db,
      `SELECT m.id, m.channel, m.address, m.subject, m.body, m.status, m.triage, m.ticket_id, m.created_at, m.site_id, m.unit_id,
         p.full_name AS person_name, s.name AS site_name, u.no AS unit_no, b.name AS block,
         (SELECT COUNT(*) FROM ai_actions a WHERE a.status = 'oneri' AND ((a.ref_type = 'message' AND a.ref_id = m.id)
            OR json_extract(a.payload, '$.messageId') = m.id)) AS pending_actions
       FROM messages m LEFT JOIN people p ON p.id = m.person_id LEFT JOIN sites s ON s.id = m.site_id
       LEFT JOIN units u ON u.id = m.unit_id LEFT JOIN blocks b ON b.id = u.block_id
       WHERE m.org_id = ? AND m.direction = 'gelen' AND (m.site_id IS NULL OR m.site_id IN (${inList(sites)})) AND ${statusSql}
       ORDER BY m.created_at DESC, m.id DESC LIMIT 200`,
      user.orgId,
    )
    return c.json(rows.map((m) => ({ ...m, triage: json(m.triage, null) })))
  })

  const loadMessage = (user: Parameters<typeof assertSite>[1], id: number) => {
    const m = get<{
      id: number
      org_id: number
      site_id: number | null
      person_id: number | null
      address: string | null
      channel: Channel
      triage: string | null
      status: string
      body: string
      unit_id: number | null
    }>(db, 'SELECT * FROM messages WHERE id = ? AND org_id = ?', id, user.orgId)
    if (!m) fail(404, 'Mesaj bulunamadı')
    if (m.site_id && !allowedSiteIds(db, user).includes(m.site_id)) fail(403, 'Bu siteye erişim yetkiniz yok')
    return m
  }

  r.get('/messages/:id', (c) => {
    const user = c.get('user')
    const m = loadMessage(user, idParam(c))
    const thread = all(
      db,
      `SELECT id, direction, channel, body, status, created_at, kind, error FROM messages
       WHERE org_id = ? AND (id = ? OR reply_to = ? OR (address = ? AND address IS NOT NULL)) ORDER BY created_at, id LIMIT 50`,
      user.orgId,
      m.id,
      m.id,
      m.address,
    )
    const actions = all<{ payload: string }>(
      db,
      `SELECT * FROM ai_actions WHERE org_id = ? AND ((ref_type = 'message' AND ref_id = ?) OR json_extract(payload, '$.messageId') = ?)
       ORDER BY id`,
      user.orgId,
      m.id,
      m.id,
    ).map((a) => ({ ...a, payload: json(a.payload, {}) }))
    const person = m.person_id
      ? get(db, 'SELECT id, full_name, phone, email FROM people WHERE id = ?', m.person_id)
      : null
    const units = m.person_id
      ? all(
          db,
          `SELECT u.id, u.no, b.name AS block, s.name AS site FROM occupancies o JOIN units u ON u.id = o.unit_id JOIN sites s ON s.id = u.site_id
           LEFT JOIN blocks b ON b.id = u.block_id WHERE o.person_id = ? AND (o.end_date IS NULL OR o.end_date >= date('now'))`,
          m.person_id,
        )
      : []
    return c.json({ message: { ...m, triage: json(m.triage, null) }, thread, actions, person, units })
  })

  r.post('/messages/:id/reprocess', async (c) => {
    const user = c.get('user')
    const m = loadMessage(user, idParam(c))
    run(
      db,
      `UPDATE ai_actions SET status = 'reddedildi', note = 'Yeniden sınıflandırıldı' WHERE status = 'oneri' AND ((ref_type = 'message' AND ref_id = ?) OR json_extract(payload, '$.messageId') = ?)`,
      m.id,
      m.id,
    )
    const result = await processMessage(deps, m.id)
    return c.json(result)
  })

  r.post('/messages/:id/archive', (c) => {
    const user = c.get('user')
    const m = loadMessage(user, idParam(c))
    run(db, `UPDATE messages SET status = 'arsiv' WHERE id = ?`, m.id)
    run(
      db,
      `UPDATE ai_actions SET status = 'reddedildi', note = 'Mesaj arşivlendi' WHERE status = 'oneri' AND ((ref_type = 'message' AND ref_id = ?) OR json_extract(payload, '$.messageId') = ?)`,
      m.id,
      m.id,
    )
    return c.json({ ok: true })
  })

  r.post('/messages/:id/reply', async (c) => {
    const user = c.get('user')
    const m = loadMessage(user, idParam(c))
    const p = await body(
      c,
      z.object({ body: z.string().trim().min(1).max(4000), channel: z.enum(keysOf(CHANNELS)).optional() }),
    )
    const channel = (p.channel ?? (m.channel === 'telefon' ? 'sms' : m.channel)) as Channel
    const out = await sendMessage(
      deps,
      {
        orgId: user.orgId,
        siteId: m.site_id,
        unitId: m.unit_id,
        personId: m.person_id,
        channel,
        address: channel === 'portal' ? null : channel === m.channel ? m.address : null,
      },
      { body: p.body, kind: 'yanit', replyTo: m.id, respectConsent: false },
    )
    if (out.status !== 'gonderildi') fail(502, `Gönderilemedi: ${out.error ?? out.status}`)
    run(db, `UPDATE messages SET status = 'islendi' WHERE id = ?`, m.id)
    run(
      db,
      `UPDATE ai_actions SET status = 'reddedildi', note = 'Personel elle yanıtladı' WHERE status = 'oneri' AND kind = 'yanit' AND json_extract(payload, '$.messageId') = ?`,
      m.id,
    )
    return c.json(out)
  })

  // Demo ve test: dışarıdan mesaj gelmiş gibi kutuya bırak
  r.post('/inbox/simulate', async (c) => {
    const user = c.get('user')
    if (!deps.config.demo && user.role !== 'admin')
      fail(403, 'Mesaj benzetimi yalnız demo modunda ya da şirket yöneticisine açık')
    const p = await body(
      c,
      z.object({
        channel: z.enum(['whatsapp', 'sms', 'email', 'telefon']),
        from: z.string().trim().min(3).max(120),
        body: z.string().trim().min(2).max(4000),
        subject: z.string().max(200).nullable().optional(),
      }),
    )
    if (p.channel !== 'email' && !normalizePhone(p.from)) fail(400, 'Telefon numarası geçersiz')
    const out = await receiveInbound(deps, {
      channel: p.channel,
      from: p.from,
      body: p.body,
      subject: p.subject,
      orgId: user.orgId,
      provider: 'benzetim',
    })
    return c.json(out, 201)
  })

  // --- Onay kuyruğu (yapay zekâ önerileri) ---
  r.get('/actions', (c) => {
    const user = c.get('user')
    const q = parseQuery(c, z.object({ status: z.string().optional(), kind: z.string().optional() }))
    const sites = inList(allowedSiteIds(db, user))
    const rows = all<{ payload: string }>(
      db,
      `SELECT a.*, s.name AS site_name, u.name AS decided_by_name FROM ai_actions a
       LEFT JOIN sites s ON s.id = a.site_id LEFT JOIN users u ON u.id = a.decided_by
       WHERE a.org_id = ? AND (a.site_id IS NULL OR a.site_id IN (${sites}))
         ${q.status === 'tumu' ? '' : q.status ? `AND a.status = '${q.status.replace(/[^a-z]/g, '')}'` : `AND a.status = 'oneri'`}
         ${q.kind ? `AND a.kind = '${q.kind.replace(/[^a-z]/g, '')}'` : ''}
       ORDER BY a.id DESC LIMIT 300`,
      user.orgId,
    )
    return c.json(rows.map((a) => ({ ...a, payload: json(a.payload, {}) })))
  })

  r.post('/actions/:id/approve', async (c) => {
    const user = c.get('user')
    const p = await body(c, z.object({ edits: z.record(z.string(), z.unknown()).optional() }))
    const action = get<{ site_id: number | null }>(
      db,
      'SELECT site_id FROM ai_actions WHERE id = ? AND org_id = ?',
      idParam(c),
      user.orgId,
    )
    if (action?.site_id) assertSite(db, user, action.site_id)
    const edits = p.edits ?? {}
    // Düzeltmelerde yalnız güvenli alanlar değiştirilebilir
    const allowed = ['body', 'title', 'description', 'category', 'priority', 'siteId', 'unitId', 'vendorId']
    for (const k of Object.keys(edits)) if (!allowed.includes(k)) delete edits[k]
    if (typeof edits.siteId === 'number') assertSite(db, user, edits.siteId)
    const out = await approveAction(deps, {
      orgId: user.orgId,
      userId: user.id,
      actionId: idParam(c),
      edits,
      settings: orgSettings(db, user.orgId),
    })
    audit(db, {
      orgId: user.orgId,
      userId: user.id,
      action: 'oneri_onay',
      entity: 'ai_action',
      entityId: idParam(c),
      detail: out.note,
    })
    return c.json(out)
  })

  r.post('/actions/:id/reject', async (c) => {
    const user = c.get('user')
    const p = await body(c, z.object({ reason: z.string().max(500).optional() }))
    const action = get<{ site_id: number | null }>(
      db,
      'SELECT site_id FROM ai_actions WHERE id = ? AND org_id = ?',
      idParam(c),
      user.orgId,
    )
    if (action?.site_id) assertSite(db, user, action.site_id)
    rejectAction(db, { orgId: user.orgId, userId: user.id, actionId: idParam(c), reason: p.reason, now: deps.now() })
    return c.json({ ok: true })
  })

  // --- Duyurular ---
  r.get('/announcements', (c) => {
    const user = c.get('user')
    const { siteId } = parseQuery(c, z.object({ siteId: zIdQuery.optional() }))
    const sites = siteId ? [assertSite(db, user, siteId).id] : allowedSiteIds(db, user)
    return c.json(
      all<{ channels: string }>(
        db,
        `SELECT a.*, s.name AS site_name, b.name AS block_name, u.name AS author FROM announcements a JOIN sites s ON s.id = a.site_id
         LEFT JOIN blocks b ON b.id = a.block_id LEFT JOIN users u ON u.id = a.created_by
         WHERE a.site_id IN (${inList(sites)}) ORDER BY a.id DESC LIMIT 100`,
      ).map((a) => ({ ...a, channels: json(a.channels, []) })),
    )
  })

  r.post('/announcements/draft', async (c) => {
    const user = c.get('user')
    const p = await body(
      c,
      z.object({ siteId: z.number().int().positive(), brief: z.string().trim().min(5).max(2000) }),
    )
    const site = assertSite(db, user, p.siteId)
    const out = await deps.ai.announcement(p.brief, site.name)
    logAi(db, {
      orgId: user.orgId,
      siteId: site.id,
      kind: 'duyuru',
      status: 'bilgi',
      title: out.result.title,
      payload: { brief: p.brief },
      engine: out.engine,
      model: out.model,
      inputTokens: out.inputTokens,
      outputTokens: out.outputTokens,
      masked: out.masked,
      note: out.fallbackReason ?? null,
    })
    return c.json({ ...out.result, engine: out.engine, model: out.model })
  })

  r.post('/announcements', async (c) => {
    const user = c.get('user')
    const p = await body(
      c,
      z.object({
        siteId: z.number().int().positive(),
        blockId: z.number().int().positive().nullable().optional(),
        title: z.string().trim().min(3).max(120),
        body: z.string().trim().min(5).max(4000),
        channels: z.array(z.enum(SENDABLE_CHANNELS as [Channel, ...Channel[]])).default([]),
        ai: z.boolean().default(false),
      }),
    )
    const site = assertSite(db, user, p.siteId)
    if (p.blockId && !get(db, 'SELECT id FROM blocks WHERE id = ? AND site_id = ?', p.blockId, site.id))
      fail(400, 'Blok bu siteye ait değil')
    const id = Number(
      db
        .prepare(
          `INSERT INTO announcements (org_id, site_id, block_id, title, body, channels, ai, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(user.orgId, site.id, p.blockId ?? null, p.title, p.body, JSON.stringify(p.channels), p.ai ? 1 : 0, user.id)
        .lastInsertRowid,
    )
    let sent = 0
    if (p.channels.length) {
      const people = all<{ person_id: number; unit_id: number }>(
        db,
        `SELECT DISTINCT o.person_id, MIN(o.unit_id) AS unit_id FROM occupancies o JOIN units u ON u.id = o.unit_id
         WHERE u.site_id = ? ${p.blockId ? 'AND u.block_id = ?' : ''} AND (o.end_date IS NULL OR o.end_date >= date('now'))
         GROUP BY o.person_id`,
        ...(p.blockId ? [site.id, p.blockId] : [site.id]),
      )
      for (const person of people) {
        const out = await notifyPerson(
          deps,
          { orgId: user.orgId, siteId: site.id, unitId: person.unit_id, personId: person.person_id },
          { body: `${p.title}\n\n${p.body}`, subject: p.title, kind: 'duyuru', channels: p.channels },
        )
        if (out.status === 'gonderildi') sent++
      }
      run(db, 'UPDATE announcements SET sent_count = ? WHERE id = ?', sent, id)
    }
    audit(db, {
      orgId: user.orgId,
      userId: user.id,
      action: 'duyuru',
      entity: 'announcement',
      entityId: id,
      detail: { sent },
    })
    return c.json({ id, sent }, 201)
  })

  r.get('/outbox', (c) => {
    const user = c.get('user')
    return c.json(
      all(
        db,
        `SELECT m.id, m.channel, m.address, m.body, m.status, m.kind, m.provider, m.error, m.created_at, p.full_name AS person_name
         FROM messages m LEFT JOIN people p ON p.id = m.person_id
         WHERE m.org_id = ? AND m.direction = 'giden' AND (m.site_id IS NULL OR m.site_id IN (${inList(allowedSiteIds(db, user))}))
         ORDER BY m.id DESC LIMIT 150`,
        user.orgId,
      ),
    )
  })

  return r
}
