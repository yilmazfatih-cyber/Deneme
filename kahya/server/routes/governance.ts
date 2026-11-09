// Personel: kat malikleri kurulu toplantıları, periyodik kontroller, belgeler ve personel asistanı.
import { Hono } from 'hono'
import { z } from 'zod'
import {
  COMPLIANCE_KINDS,
  MEETING_RULES,
  SENDABLE_CHANNELS,
  type Channel,
  type ComplianceKind,
  type MeetingRule,
} from '../../shared/labels.ts'
import { allowedSiteIds, assertSite, inList } from '../access.ts'
import { all, audit, get, insert, run, tx, update } from '../db/db.ts'
import { isoToLocal, localToIso, today } from '../domain/dates.ts'
import { complianceStatus, nextDue } from '../domain/schedule.ts'
import { body, fail, idParam, parseQuery, zDate, zIdQuery, type Deps, type Env } from '../http.ts'
import { ask, indexDocument } from '../services/assistant.ts'
import { logAi, notifyPerson } from '../services/common.ts'
import { invitationText, meetingDetail, minutesText, type MeetingRow } from '../services/meetings.ts'

const keysOf = <T extends Record<string, unknown>>(o: T) =>
  Object.keys(o) as [keyof T & string, ...(keyof T & string)[]]
const zLocal = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, 'Tarih-saat YYYY-AA-GGTSS:DD biçiminde olmalı')

export function governanceRoutes(deps: Deps) {
  const { db } = deps
  const r = new Hono<Env>()

  // --- Toplantılar ---
  r.get('/meetings', (c) => {
    const user = c.get('user')
    const { siteId } = parseQuery(c, z.object({ siteId: zIdQuery.optional() }))
    const sites = siteId ? [assertSite(db, user, siteId).id] : allowedSiteIds(db, user)
    return c.json(
      all(
        db,
        `SELECT m.*, s.name AS site_name, (SELECT COUNT(*) FROM agenda_items a WHERE a.meeting_id = m.id) AS agenda_count
         FROM meetings m JOIN sites s ON s.id = m.site_id WHERE m.site_id IN (${inList(sites)}) ORDER BY m.first_at DESC`,
      ),
    )
  })

  const AgendaSchema = z.object({
    title: z.string().trim().min(3).max(200),
    details: z.string().trim().max(1000).nullable().optional(),
    rule: z.enum(keysOf(MEETING_RULES)).default('cogunluk'),
  })

  r.post('/meetings', async (c) => {
    const user = c.get('user')
    const p = await body(
      c,
      z.object({
        siteId: z.number().int().positive(),
        kind: z.enum(['olagan', 'olaganustu']),
        title: z.string().trim().min(3).max(160),
        firstAt: zLocal,
        secondAt: zLocal.nullable().optional(),
        location: z.string().trim().min(3).max(200),
        agenda: z.array(AgendaSchema).default([]),
      }),
    )
    const site = assertSite(db, user, p.siteId)
    const id = tx(db, () => {
      const id = insert(db, 'meetings', {
        site_id: site.id,
        kind: p.kind,
        title: p.title,
        first_at: localToIso(p.firstAt),
        second_at: p.secondAt ? localToIso(p.secondAt) : null,
        location: p.location,
      })
      p.agenda.forEach((a, i) =>
        insert(db, 'agenda_items', {
          meeting_id: id,
          seq: i + 1,
          title: a.title,
          details: a.details ?? null,
          rule: a.rule,
        }),
      )
      return id
    })
    audit(db, { orgId: user.orgId, userId: user.id, action: 'toplanti_ekle', entity: 'meeting', entityId: id })
    return c.json({ id }, 201)
  })

  const loadMeeting = (user: Parameters<typeof assertSite>[1], id: number) => {
    const m = get<MeetingRow>(db, 'SELECT * FROM meetings WHERE id = ?', id)
    if (!m) fail(404, 'Toplantı bulunamadı')
    assertSite(db, user, m.site_id)
    return m
  }

  r.get('/meetings/:id', (c) => {
    const m = loadMeeting(c.get('user'), idParam(c))
    const d = meetingDetail(db, m.id, deps.now())!
    return c.json({
      ...d,
      local: { firstAt: isoToLocal(m.first_at), secondAt: m.second_at ? isoToLocal(m.second_at) : null },
      invitation: invitationText(d),
    })
  })

  r.patch('/meetings/:id', async (c) => {
    const user = c.get('user')
    const m = loadMeeting(user, idParam(c))
    const p = await body(
      c,
      z.object({
        title: z.string().trim().min(3).max(160).optional(),
        firstAt: zLocal.optional(),
        secondAt: zLocal.nullable().optional(),
        location: z.string().trim().min(3).max(200).optional(),
        status: z.enum(['planlandi', 'cagri', 'tamamlandi', 'iptal']).optional(),
        heldRound: z.enum(['ilk', 'ikinci']).optional(),
        minutes: z.string().max(50_000).optional(),
      }),
    )
    update(
      db,
      'meetings',
      m.id,
      {
        title: p.title,
        first_at: p.firstAt ? localToIso(p.firstAt) : undefined,
        second_at: p.secondAt === null ? null : p.secondAt ? localToIso(p.secondAt) : undefined,
        location: p.location,
        status: p.status,
        held_round: p.heldRound,
        minutes: p.minutes,
      },
      ['title', 'first_at', 'second_at', 'location', 'status', 'held_round', 'minutes'],
    )
    if (p.status === 'tamamlandi') {
      // Sonuçları gündem maddelerine yaz
      const d = meetingDetail(db, m.id, deps.now())!
      for (const a of d.agenda)
        run(db, 'UPDATE agenda_items SET result = ? WHERE id = ?', a.tally.passed ? 'kabul' : 'ret', a.id)
    }
    return c.json({ ok: true })
  })

  r.post('/meetings/:id/agenda', async (c) => {
    const m = loadMeeting(c.get('user'), idParam(c))
    const p = await body(c, AgendaSchema)
    const seq =
      (get<{ n: number }>(db, 'SELECT COALESCE(MAX(seq),0) AS n FROM agenda_items WHERE meeting_id = ?', m.id)?.n ??
        0) + 1
    return c.json(
      {
        id: insert(db, 'agenda_items', {
          meeting_id: m.id,
          seq,
          title: p.title,
          details: p.details ?? null,
          rule: p.rule as MeetingRule,
        }),
      },
      201,
    )
  })

  r.delete('/agenda/:id', (c) => {
    const item = get<{ id: number; meeting_id: number }>(
      db,
      'SELECT id, meeting_id FROM agenda_items WHERE id = ?',
      idParam(c),
    )
    if (!item) fail(404, 'Gündem maddesi bulunamadı')
    loadMeeting(c.get('user'), item.meeting_id)
    run(db, 'DELETE FROM agenda_items WHERE id = ?', item.id)
    return c.json({ ok: true })
  })

  r.put('/meetings/:id/attendance', async (c) => {
    const m = loadMeeting(c.get('user'), idParam(c))
    const p = await body(
      c,
      z.object({
        items: z.array(
          z.object({
            unitId: z.number().int(),
            present: z.boolean(),
            proxy: z.string().trim().max(120).nullable().optional(),
          }),
        ),
      }),
    )
    const valid = new Set(all<{ id: number }>(db, 'SELECT id FROM units WHERE site_id = ?', m.site_id).map((u) => u.id))
    tx(db, () => {
      for (const it of p.items) {
        if (!valid.has(it.unitId)) continue
        run(
          db,
          `INSERT INTO attendance (meeting_id, unit_id, present, proxy) VALUES (?, ?, ?, ?)
           ON CONFLICT (meeting_id, unit_id) DO UPDATE SET present = excluded.present, proxy = excluded.proxy`,
          m.id,
          it.unitId,
          it.present ? 1 : 0,
          it.proxy || null,
        )
      }
    })
    return c.json(meetingDetail(db, m.id, deps.now())!.quorum)
  })

  r.put('/agenda/:id/votes', async (c) => {
    const item = get<{ id: number; meeting_id: number }>(
      db,
      'SELECT id, meeting_id FROM agenda_items WHERE id = ?',
      idParam(c),
    )
    if (!item) fail(404, 'Gündem maddesi bulunamadı')
    const m = loadMeeting(c.get('user'), item.meeting_id)
    const p = await body(
      c,
      z.object({
        votes: z.array(z.object({ unitId: z.number().int(), vote: z.enum(['evet', 'hayir', 'cekimser']).nullable() })),
      }),
    )
    const valid = new Set(all<{ id: number }>(db, 'SELECT id FROM units WHERE site_id = ?', m.site_id).map((u) => u.id))
    tx(db, () => {
      for (const v of p.votes) {
        if (!valid.has(v.unitId)) continue
        if (v.vote === null) run(db, 'DELETE FROM votes WHERE item_id = ? AND unit_id = ?', item.id, v.unitId)
        else
          run(
            db,
            `INSERT INTO votes (item_id, unit_id, vote) VALUES (?, ?, ?) ON CONFLICT (item_id, unit_id) DO UPDATE SET vote = excluded.vote`,
            item.id,
            v.unitId,
            v.vote,
          )
      }
    })
    const d = meetingDetail(db, m.id, deps.now())!
    return c.json(d.agenda.find((a) => a.id === item.id)?.tally ?? null)
  })

  r.post('/meetings/:id/invite', async (c) => {
    const user = c.get('user')
    const m = loadMeeting(user, idParam(c))
    const p = await body(
      c,
      z.object({
        channels: z.array(z.enum(SENDABLE_CHANNELS as [Channel, ...Channel[]])).min(1),
        text: z.string().max(10_000).optional(),
      }),
    )
    const d = meetingDetail(db, m.id, deps.now())!
    if (d.agenda.length === 0) fail(400, 'Çağrıdan önce gündem maddesi ekleyin')
    const text = p.text?.trim() || invitationText(d)
    const owners = all<{ person_id: number; unit_id: number }>(
      db,
      `SELECT o.person_id, MIN(o.unit_id) AS unit_id FROM occupancies o JOIN units u ON u.id = o.unit_id
       WHERE u.site_id = ? AND o.role = 'malik' AND (o.end_date IS NULL OR o.end_date >= date('now')) GROUP BY o.person_id`,
      m.site_id,
    )
    let sent = 0
    const failed: string[] = []
    for (const o of owners) {
      const out = await notifyPerson(
        deps,
        { orgId: user.orgId, siteId: m.site_id, unitId: o.unit_id, personId: o.person_id },
        { body: text, subject: d.meeting.title, kind: 'toplanti_cagri', channels: p.channels, respectConsent: false },
      )
      if (out.status === 'gonderildi') sent++
      else failed.push(`#${o.person_id}: ${out.error ?? out.status}`)
    }
    run(
      db,
      `UPDATE meetings SET invited_at = ?, status = CASE WHEN status = 'planlandi' THEN 'cagri' ELSE status END WHERE id = ?`,
      deps.now().toISOString(),
      m.id,
    )
    audit(db, {
      orgId: user.orgId,
      userId: user.id,
      action: 'toplanti_cagri',
      entity: 'meeting',
      entityId: m.id,
      detail: { sent, failed: failed.length },
    })
    return c.json({
      sent,
      failed,
      note: 'KMK m.29: çağrı ayrıca imza karşılığı tebliğ ya da taahhütlü mektupla yapılmalıdır; elektronik bildirim bunu tamamlar, yerine geçmez.',
    })
  })

  r.post('/meetings/:id/minutes', (c) => {
    const user = c.get('user')
    const m = loadMeeting(user, idParam(c))
    const text = minutesText(meetingDetail(db, m.id, deps.now())!)
    run(db, 'UPDATE meetings SET minutes = ? WHERE id = ?', text, m.id)
    logAi(db, {
      orgId: user.orgId,
      siteId: m.site_id,
      kind: 'tutanak',
      status: 'bilgi',
      title: `Tutanak taslağı: ${m.title}`,
      engine: 'kural',
      refType: 'meeting',
      refId: m.id,
    })
    return c.json({ minutes: text })
  })

  // --- Periyodik kontroller ---
  r.get('/compliance', (c) => {
    const user = c.get('user')
    const { siteId } = parseQuery(c, z.object({ siteId: zIdQuery.optional() }))
    const sites = siteId ? [assertSite(db, user, siteId).id] : allowedSiteIds(db, user)
    const t = today(deps.now())
    return c.json(
      all<{ next_due: string | null }>(
        db,
        `SELECT ci.*, s.name AS site_name, v.name AS vendor_name FROM compliance_items ci JOIN sites s ON s.id = ci.site_id
         LEFT JOIN vendors v ON v.id = ci.vendor_id WHERE ci.site_id IN (${inList(sites)})
         ORDER BY ci.next_due IS NULL, ci.next_due`,
      ).map((x) => ({ ...x, state: complianceStatus(x.next_due, t) })),
    )
  })

  const ComplianceSchema = z.object({
    siteId: z.number().int().positive(),
    kind: z.enum(keysOf(COMPLIANCE_KINDS)),
    title: z.string().trim().min(3).max(160).optional(),
    intervalMonths: z.number().int().min(1).max(120).optional(),
    lastDone: zDate.nullable().optional(),
    nextDue: zDate.nullable().optional(),
    vendorId: z.number().int().positive().nullable().optional(),
    result: z.string().trim().max(60).nullable().optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
  })

  r.post('/compliance', async (c) => {
    const user = c.get('user')
    const p = await body(c, ComplianceSchema)
    const site = assertSite(db, user, p.siteId)
    const def = COMPLIANCE_KINDS[p.kind as ComplianceKind]
    const months = p.intervalMonths ?? def.months
    const id = insert(db, 'compliance_items', {
      site_id: site.id,
      kind: p.kind,
      title: p.title ?? def.label,
      interval_months: months,
      last_done: p.lastDone ?? null,
      next_due: p.nextDue ?? nextDue(p.lastDone ?? null, months),
      vendor_id: p.vendorId ?? null,
      result: p.result ?? null,
      notes: p.notes ?? null,
    })
    return c.json({ id }, 201)
  })

  const loadCompliance = (user: Parameters<typeof assertSite>[1], id: number) => {
    const item = get<{ id: number; site_id: number; interval_months: number }>(
      db,
      'SELECT * FROM compliance_items WHERE id = ?',
      id,
    )
    if (!item) fail(404, 'Kontrol kaydı bulunamadı')
    assertSite(db, user, item.site_id)
    return item
  }

  r.patch('/compliance/:id', async (c) => {
    const item = loadCompliance(c.get('user'), idParam(c))
    const p = await body(c, ComplianceSchema.partial().omit({ siteId: true, kind: true }))
    update(
      db,
      'compliance_items',
      item.id,
      {
        title: p.title,
        interval_months: p.intervalMonths,
        next_due: p.nextDue,
        vendor_id: p.vendorId,
        notes: p.notes,
        result: p.result,
      },
      ['title', 'interval_months', 'next_due', 'vendor_id', 'notes', 'result'],
    )
    return c.json({ ok: true })
  })

  r.post('/compliance/:id/done', async (c) => {
    const user = c.get('user')
    const item = loadCompliance(user, idParam(c))
    const p = await body(
      c,
      z.object({
        date: zDate,
        result: z.string().trim().max(60).nullable().optional(),
        notes: z.string().trim().max(1000).nullable().optional(),
      }),
    )
    run(
      db,
      'UPDATE compliance_items SET last_done = ?, next_due = ?, result = ?, notes = COALESCE(?, notes) WHERE id = ?',
      p.date,
      nextDue(p.date, item.interval_months),
      p.result ?? null,
      p.notes ?? null,
      item.id,
    )
    audit(db, {
      orgId: user.orgId,
      userId: user.id,
      action: 'kontrol_yapildi',
      entity: 'compliance',
      entityId: item.id,
      detail: p,
    })
    return c.json({ ok: true, nextDue: nextDue(p.date, item.interval_months) })
  })

  r.delete('/compliance/:id', (c) => {
    const item = loadCompliance(c.get('user'), idParam(c))
    run(db, 'DELETE FROM compliance_items WHERE id = ?', item.id)
    return c.json({ ok: true })
  })

  // --- Belgeler ---
  r.get('/documents', (c) => {
    const user = c.get('user')
    const { siteId } = parseQuery(c, z.object({ siteId: zIdQuery.optional() }))
    const sites = siteId ? [assertSite(db, user, siteId).id] : allowedSiteIds(db, user)
    return c.json(
      all(
        db,
        `SELECT d.id, d.site_id, d.title, d.kind, d.visibility, d.created_at, length(d.body) AS length, s.name AS site_name,
           (SELECT COUNT(*) FROM doc_chunks c WHERE c.document_id = d.id) AS chunks
         FROM documents d LEFT JOIN sites s ON s.id = d.site_id
         WHERE d.org_id = ? AND (d.site_id IS NULL OR d.site_id IN (${inList(sites)})) ORDER BY d.site_id IS NULL, s.name, d.title`,
        user.orgId,
      ),
    )
  })

  const DocSchema = z.object({
    siteId: z.number().int().positive().nullable(),
    title: z.string().trim().min(3).max(160),
    kind: z.enum(['yonetim_plani', 'ic_yonetmelik', 'karar', 'sozlesme', 'sss', 'diger']).default('diger'),
    body: z.string().trim().min(20).max(500_000),
    visibility: z.enum(['sakin', 'personel']).default('sakin'),
  })

  r.post('/documents', async (c) => {
    const user = c.get('user')
    const p = await body(c, DocSchema)
    if (p.siteId) assertSite(db, user, p.siteId)
    else if (user.role !== 'admin') fail(403, 'Tüm sitelere ait belgeyi yalnız şirket yöneticisi ekleyebilir')
    const id = insert(db, 'documents', {
      org_id: user.orgId,
      site_id: p.siteId,
      title: p.title,
      kind: p.kind,
      body: p.body,
      visibility: p.visibility,
    })
    indexDocument(db, id, p.body)
    return c.json({ id }, 201)
  })

  const loadDoc = (user: Parameters<typeof assertSite>[1], id: number) => {
    const d = get<{ id: number; site_id: number | null; org_id: number }>(
      db,
      'SELECT * FROM documents WHERE id = ? AND org_id = ?',
      id,
      user.orgId,
    )
    if (!d) fail(404, 'Belge bulunamadı')
    if (d.site_id) assertSite(db, user, d.site_id)
    return d
  }

  r.get('/documents/:id', (c) => c.json(loadDoc(c.get('user'), idParam(c))))

  r.put('/documents/:id', async (c) => {
    const user = c.get('user')
    const d = loadDoc(user, idParam(c))
    const p = await body(c, DocSchema.omit({ siteId: true }))
    run(
      db,
      'UPDATE documents SET title = ?, kind = ?, body = ?, visibility = ? WHERE id = ?',
      p.title,
      p.kind,
      p.body,
      p.visibility,
      d.id,
    )
    indexDocument(db, d.id, p.body)
    return c.json({ ok: true })
  })

  r.delete('/documents/:id', (c) => {
    const d = loadDoc(c.get('user'), idParam(c))
    run(db, 'DELETE FROM documents WHERE id = ?', d.id)
    return c.json({ ok: true })
  })

  r.post('/assistant/ask', async (c) => {
    const user = c.get('user')
    const p = await body(
      c,
      z.object({ siteId: z.number().int().positive().nullable(), question: z.string().trim().min(3).max(1000) }),
    )
    if (p.siteId) assertSite(db, user, p.siteId)
    return c.json(
      await ask(deps, {
        orgId: user.orgId,
        siteId: p.siteId,
        question: p.question,
        audience: 'personel',
        askerName: user.name,
      }),
    )
  })

  return r
}
