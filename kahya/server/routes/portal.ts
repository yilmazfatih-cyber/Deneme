// Sakin portalı: hesap durumu ve ekstre, online ödeme, talep açma ve izleme, asistana soru, duyurular,
// toplantılar, gizlilik tercihleri ve KVKK veri dökümü.
import { Hono } from 'hono'
import { z } from 'zod'
import { allowedSiteIds, assertResidentUnit, inList, residentUnits } from '../access.ts'
import { all, audit, get, run } from '../db/db.ts'
import { today } from '../domain/dates.ts'
import { body, clientIp, fail, idParam, zKurus, type Deps, type Env } from '../http.ts'
import { afterTicketCreated } from '../services/actions.ts'
import { ask } from '../services/assistant.ts'
import { logAi, orgSettings } from '../services/common.ts'
import { labelOf, unitPosition, unitStatement } from '../services/finance.ts'
import { completeIntent, createIntent, type IntentRow } from '../services/online.ts'
import { createTicket } from '../services/tickets.ts'
import { personExport } from './portfolio.ts'

export function portalRoutes(deps: Deps) {
  const { db } = deps
  const r = new Hono<Env>()

  r.get('/home', (c) => {
    const user = c.get('user')
    const asOf = today(deps.now())
    const units = residentUnits(db, user).map((u) => ({
      id: u.id,
      label: labelOf(u),
      site: u.site_name,
      siteId: u.site_id,
      role: u.role,
      position: unitPosition(db, u.id, asOf),
    }))
    const sites = inList(allowedSiteIds(db, user))
    const unitList = inList(units.map((u) => u.id))
    return c.json({
      person: get(db, 'SELECT id, full_name, phone, email FROM people WHERE id = ?', user.personId ?? -1),
      units,
      announcements: all(
        db,
        `SELECT a.id, a.title, a.body, a.created_at, s.name AS site_name FROM announcements a JOIN sites s ON s.id = a.site_id
         WHERE a.site_id IN (${sites}) AND (a.block_id IS NULL OR a.block_id IN (SELECT block_id FROM units WHERE id IN (${unitList})))
         ORDER BY a.id DESC LIMIT 5`,
      ),
      tickets: all(
        db,
        `SELECT id, title, status, priority, created_at, updated_at FROM tickets WHERE person_id = ? OR unit_id IN (${unitList})
         ORDER BY id DESC LIMIT 5`,
        user.personId ?? -1,
      ),
      meetings: all(
        db,
        `SELECT m.id, m.title, m.first_at, m.location, m.status FROM meetings m WHERE m.site_id IN (${sites})
         AND m.status IN ('planlandi','cagri') ORDER BY m.first_at LIMIT 3`,
      ),
      messages: all(
        db,
        `SELECT id, channel, body, created_at, kind FROM messages WHERE person_id = ? AND direction = 'giden' ORDER BY id DESC LIMIT 5`,
        user.personId ?? -1,
      ),
      payments: { enabled: deps.payments.enabled, provider: deps.payments.provider.name },
    })
  })

  r.get('/units/:id/statement', (c) => {
    const unit = assertResidentUnit(db, c.get('user'), idParam(c))
    return c.json({
      unit: { id: unit.id, label: labelOf(unit), site: unit.site_name },
      lines: unitStatement(db, unit.id),
      position: unitPosition(db, unit.id, today(deps.now())),
    })
  })

  // Talep: sakin serbest metin yazar, yapay zekâ başlık / kategori / öncelik önerir
  r.post('/tickets', async (c) => {
    const user = c.get('user')
    const p = await body(
      c,
      z.object({
        unitId: z.number().int().positive(),
        description: z.string().trim().min(5).max(2000),
        commonArea: z.boolean().default(false),
      }),
    )
    const unit = assertResidentUnit(db, user, p.unitId)
    const person = get<{ full_name: string }>(db, 'SELECT full_name FROM people WHERE id = ?', user.personId ?? -1)
    const ai = await deps.ai.triage({
      text: p.description,
      channel: 'portal',
      siteName: unit.site_name,
      senderName: person?.full_name,
      senderUnit: labelOf(unit),
    })
    const t = ai.result
    const category = t.category === 'aidat' ? 'diger' : t.category
    const id = createTicket(db, {
      orgId: user.orgId,
      siteId: unit.site_id,
      unitId: unit.id,
      personId: user.personId,
      title: t.ticket_title || p.description.slice(0, 80),
      description: p.description,
      category,
      priority: t.priority,
      location: p.commonArea ? 'Ortak alan' : t.location === 'ortak_alan' ? 'Ortak alan' : 'Daire içi',
      source: 'portal',
      actor: person?.full_name ?? 'Sakin',
      now: deps.now(),
    })
    logAi(db, {
      orgId: user.orgId,
      siteId: unit.site_id,
      kind: 'talep',
      status: 'uygulandi',
      title: `#${id} ${t.ticket_title}`,
      payload: { category, priority: t.priority },
      engine: ai.engine,
      model: ai.model,
      inputTokens: ai.inputTokens,
      outputTokens: ai.outputTokens,
      masked: ai.masked,
      refType: 'ticket',
      refId: id,
    })
    await afterTicketCreated(deps, user.orgId, id, orgSettings(db, user.orgId))
    return c.json({ id, category, priority: t.priority, title: t.ticket_title, safetyAdvice: t.safety_advice }, 201)
  })

  r.get('/tickets', (c) => {
    const user = c.get('user')
    const unitList = inList(residentUnits(db, user).map((u) => u.id))
    return c.json(
      all(
        db,
        `SELECT t.id, t.title, t.status, t.priority, t.category, t.created_at, t.updated_at, t.resolved_at FROM tickets t
         WHERE t.person_id = ? OR t.unit_id IN (${unitList}) ORDER BY t.id DESC LIMIT 100`,
        user.personId ?? -1,
      ),
    )
  })

  r.get('/tickets/:id', (c) => {
    const user = c.get('user')
    const unitIds = residentUnits(db, user).map((u) => u.id)
    const t = get<{ id: number; person_id: number | null; unit_id: number | null }>(
      db,
      'SELECT id, title, description, status, priority, category, created_at, resolved_at, person_id, unit_id FROM tickets WHERE id = ?',
      idParam(c),
    )
    if (!t || (t.person_id !== user.personId && !(t.unit_id && unitIds.includes(t.unit_id))))
      fail(404, 'Talep bulunamadı')
    return c.json({
      ticket: t,
      events: all(
        db,
        'SELECT kind, body, created_at FROM ticket_events WHERE ticket_id = ? AND public = 1 ORDER BY id',
        t.id,
      ),
    })
  })

  r.post('/ask', async (c) => {
    const user = c.get('user')
    const p = await body(c, z.object({ question: z.string().trim().min(3).max(1000) }))
    const units = residentUnits(db, user)
    const person = get<{ full_name: string; phone: string | null }>(
      db,
      'SELECT full_name, phone FROM people WHERE id = ?',
      user.personId ?? -1,
    )
    return c.json(
      await ask(deps, {
        orgId: user.orgId,
        siteId: units[0]?.site_id ?? null,
        question: p.question,
        audience: 'sakin',
        personId: user.personId,
        unitIds: units.map((u) => u.id),
        askerName: person?.full_name,
        phone: person?.phone,
      }),
    )
  })

  // --- Online ödeme ---
  r.post('/pay', async (c) => {
    const user = c.get('user')
    if (!deps.payments.enabled) fail(503, 'Online ödeme bu sitede henüz açık değil')
    const p = await body(c, z.object({ unitId: z.number().int().positive(), amount: zKurus }))
    const unit = assertResidentUnit(db, user, p.unitId)
    if (p.amount < 100) fail(400, 'En az 1 TL ödenebilir')
    if (p.amount > 100_000_000) fail(400, 'Tutar çok yüksek')
    const person = get<{ full_name: string; phone: string | null; email: string | null }>(
      db,
      'SELECT full_name, phone, email FROM people WHERE id = ?',
      user.personId ?? -1,
    )
    const intent = createIntent(db, {
      orgId: user.orgId,
      siteId: unit.site_id,
      unitId: unit.id,
      personId: user.personId,
      amount: p.amount,
      provider: deps.payments.provider.name,
    })
    const base = deps.config.publicUrl
    try {
      const checkout = await deps.payments.provider.checkout({
        oid: intent.oid,
        amount: p.amount,
        email: person?.email || `sakin${user.personId}@kahya.local`,
        name: person?.full_name ?? 'Sakin',
        phone: person?.phone ?? '',
        address: unit.site_name,
        userIp: clientIp(c),
        description: `${unit.site_name} ${labelOf(unit)} aidat`,
        okUrl: `${base}/odeme/sonuc/${intent.oid}`,
        failUrl: `${base}/odeme/sonuc/${intent.oid}`,
      })
      audit(db, {
        orgId: user.orgId,
        userId: user.id,
        action: 'online_odeme_baslat',
        entity: 'payment_intent',
        entityId: intent.id,
        detail: { amount: p.amount },
      })
      return c.json({ oid: intent.oid, ...checkout })
    } catch (e) {
      completeIntent(db, intent.oid, false, deps.now(), (e as Error).message)
      fail(502, (e as Error).message)
    }
  })

  const loadIntent = (user: Parameters<typeof residentUnits>[1], oid: string) => {
    const intent = get<IntentRow>(db, 'SELECT * FROM payment_intents WHERE oid = ? AND org_id = ?', oid, user.orgId)
    if (!intent || intent.person_id !== user.personId) fail(404, 'Ödeme bulunamadı')
    return intent
  }

  r.get('/payments/:oid', (c) => {
    const user = c.get('user')
    const intent = loadIntent(user, c.req.param('oid'))
    const unit = assertResidentUnit(db, user, intent.unit_id)
    return c.json({
      oid: intent.oid,
      amount: intent.amount,
      status: intent.status,
      failure: intent.failure,
      unit: labelOf(unit),
      site: unit.site_name,
      provider: intent.provider,
      testMode: deps.payments.mockEnabled,
    })
  })

  // Test ödeme sayfası (yalnız demo, PayTR yapılandırılmamışken)
  r.post('/payments/:oid/test', async (c) => {
    const user = c.get('user')
    if (!deps.payments.mockEnabled) fail(404, 'Test ödeme kapalı')
    const intent = loadIntent(user, c.req.param('oid'))
    const p = await body(c, z.object({ success: z.boolean() }))
    const out = completeIntent(db, intent.oid, p.success, deps.now(), p.success ? undefined : 'Test: kart reddedildi')
    return c.json({ status: out.found ? out.intent?.status : 'bulunamadi' })
  })

  // --- Duyurular ve toplantılar ---
  r.get('/announcements', (c) => {
    const user = c.get('user')
    return c.json(
      all(
        db,
        `SELECT a.id, a.title, a.body, a.created_at, s.name AS site_name FROM announcements a JOIN sites s ON s.id = a.site_id
         WHERE a.site_id IN (${inList(allowedSiteIds(db, user))}) ORDER BY a.id DESC LIMIT 50`,
      ),
    )
  })

  r.get('/meetings', (c) => {
    const user = c.get('user')
    const meetings = all<{ id: number }>(
      db,
      `SELECT m.id, m.title, m.kind, m.first_at, m.second_at, m.location, m.status, s.name AS site_name FROM meetings m
       JOIN sites s ON s.id = m.site_id WHERE m.site_id IN (${inList(allowedSiteIds(db, user))}) AND m.status <> 'iptal'
       ORDER BY m.first_at DESC LIMIT 20`,
    )
    return c.json(
      meetings.map((m) => ({
        ...m,
        agenda: all(db, 'SELECT seq, title, details, result FROM agenda_items WHERE meeting_id = ? ORDER BY seq', m.id),
      })),
    )
  })

  // --- Gizlilik (KVKK) ---
  r.get('/privacy', (c) => {
    const user = c.get('user')
    return c.json(
      get(
        db,
        'SELECT full_name, phone, email, consent_sms, consent_whatsapp, consent_email, kvkk_notice_at FROM people WHERE id = ?',
        user.personId ?? -1,
      ),
    )
  })

  r.put('/privacy', async (c) => {
    const user = c.get('user')
    const p = await body(
      c,
      z.object({
        consentSms: z.boolean(),
        consentWhatsapp: z.boolean(),
        consentEmail: z.boolean(),
        acknowledge: z.boolean().optional(),
      }),
    )
    run(
      db,
      `UPDATE people SET consent_sms = ?, consent_whatsapp = ?, consent_email = ?, kvkk_notice_at = CASE WHEN ? THEN COALESCE(kvkk_notice_at, ?) ELSE kvkk_notice_at END WHERE id = ?`,
      p.consentSms ? 1 : 0,
      p.consentWhatsapp ? 1 : 0,
      p.consentEmail ? 1 : 0,
      p.acknowledge ? 1 : 0,
      deps.now().toISOString(),
      user.personId ?? -1,
    )
    audit(db, { orgId: user.orgId, userId: user.id, action: 'iletisim_tercihi', detail: p })
    return c.json({ ok: true })
  })

  r.get('/privacy/export', (c) => {
    const user = c.get('user')
    if (!user.personId) fail(404, 'Kişi kaydı yok')
    audit(db, { orgId: user.orgId, userId: user.id, action: 'kvkk_doku_sakin' })
    c.header('Content-Disposition', 'attachment; filename="kisisel-verilerim.json"')
    return c.json(personExport(db, user.personId))
  })

  return r
}
