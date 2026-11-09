// Personel: portföy — siteler, bloklar, bağımsız bölümler, kişiler, tedarikçiler ve toplu içe aktarma
// (satın alınan yönetim firmalarının portföyünü hızla devralmak için CSV şablonları).
import { Hono } from 'hono'
import { z } from 'zod'
import { VENDOR_TRADES, type VendorTrade } from '../../shared/labels.ts'
import { allowedSiteIds, assertSite, assertUnit, inList } from '../access.ts'
import { assertRole } from '../auth/auth.ts'
import { all, audit, get, insert, run, tx, update, type DB } from '../db/db.ts'
import { parseCsv } from '../domain/bankcsv.ts'
import { today } from '../domain/dates.ts'
import { parseAmount } from '../domain/money.ts'
import { isValidIban } from '../domain/pii.ts'
import { fold, normalizePhone } from '../domain/text.ts'
import { body, fail, idParam, parseQuery, zDate, type Deps, type Env } from '../http.ts'
import { siteStandings, unitPosition, unitStatement } from '../services/finance.ts'

const SiteSchema = z.object({
  name: z.string().trim().min(2).max(120),
  kind: z.enum(['site', 'apartman']).default('site'),
  address: z.string().trim().max(300).nullable().optional(),
  district: z.string().trim().max(80).nullable().optional(),
  city: z.string().trim().max(80).nullable().optional(),
  bankName: z.string().trim().max(80).nullable().optional(),
  iban: z.string().trim().max(40).nullable().optional(),
  dueDay: z.number().int().min(1).max(28).optional(),
  lateFeeBps: z.number().int().min(0).max(500).optional(),
  landShareTotal: z.number().int().positive().nullable().optional(),
  managerPhone: z.string().nullable().optional(),
  blocks: z.array(z.string().trim().min(1).max(40)).optional(),
})

function siteRow(p: Partial<z.infer<typeof SiteSchema>>) {
  if (p.iban && !isValidIban(p.iban)) fail(400, 'IBAN geçersiz')
  const managerPhone = p.managerPhone ? normalizePhone(p.managerPhone) : p.managerPhone
  if (p.managerPhone && !managerPhone) fail(400, 'Yönetici telefonu geçersiz')
  return {
    name: p.name,
    kind: p.kind,
    address: p.address,
    district: p.district,
    city: p.city,
    bank_name: p.bankName,
    iban: p.iban
      ? p.iban
          .replace(/\s+/g, '')
          .toUpperCase()
          .replace(/(.{4})/g, '$1 ')
          .trim()
      : p.iban,
    due_day: p.dueDay,
    late_fee_bps: p.lateFeeBps,
    land_share_total: p.landShareTotal,
    manager_phone: managerPhone,
  }
}

const PersonSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(30).nullable().optional(),
  email: z.string().trim().email().max(120).nullable().optional().or(z.literal('')),
  notes: z.string().trim().max(1000).nullable().optional(),
})

function personFields(p: Partial<z.infer<typeof PersonSchema>>) {
  const phone = p.phone ? normalizePhone(p.phone) : p.phone === '' ? null : p.phone
  if (p.phone && !phone) fail(400, 'Telefon numarası geçersiz')
  return {
    full_name: p.fullName,
    phone,
    email: p.email ? p.email.toLowerCase() : p.email === '' ? null : p.email,
    notes: p.notes,
  }
}

/** Telefon (yoksa e-posta) ile mevcut kişiyi bulur ya da oluşturur. */
export function upsertPerson(
  db: DB,
  orgId: number,
  p: { fullName: string; phone?: string | null; email?: string | null },
) {
  const f = personFields(p)
  const existing = f.phone
    ? get<{ id: number }>(
        db,
        'SELECT id FROM people WHERE org_id = ? AND phone = ? AND anonymized_at IS NULL',
        orgId,
        f.phone,
      )
    : f.email
      ? get<{ id: number }>(
          db,
          'SELECT id FROM people WHERE org_id = ? AND email = ? AND anonymized_at IS NULL',
          orgId,
          f.email,
        )
      : undefined
  if (existing) return existing.id
  return insert(db, 'people', { org_id: orgId, ...f, kvkk_notice_at: null })
}

export function portfolioRoutes(deps: Deps) {
  const { db } = deps
  const r = new Hono<Env>()

  // --- Siteler ---
  r.get('/sites', (c) => {
    const user = c.get('user')
    const sites = all<Record<string, unknown> & { id: number }>(
      db,
      `SELECT s.*, (SELECT COUNT(*) FROM units u WHERE u.site_id = s.id) AS unit_count,
         (SELECT COUNT(*) FROM blocks b WHERE b.site_id = s.id) AS block_count,
         (SELECT COUNT(*) FROM tickets t WHERE t.site_id = s.id AND t.status IN ('acik','atandi','islemde','beklemede')) AS open_tickets
       FROM sites s WHERE s.id IN (${inList(allowedSiteIds(db, user))}) ORDER BY s.name`,
    )
    const asOf = today(deps.now())
    return c.json(
      sites.map((s) => {
        const st = siteStandings(db, s.id, asOf)
        return {
          ...s,
          receivables: st.reduce((a, u) => a + Math.max(0, u.position.balance), 0),
          overdue: st.reduce((a, u) => a + u.position.overdue, 0),
          debtors: st.filter((u) => u.position.overdue > 0).length,
        }
      }),
    )
  })

  r.post('/sites', async (c) => {
    const user = c.get('user')
    assertRole(user, ['admin'])
    const p = await body(c, SiteSchema)
    const id = tx(db, () => {
      const id = insert(db, 'sites', { org_id: user.orgId, ...siteRow(p) })
      for (const b of p.blocks ?? []) insert(db, 'blocks', { site_id: id, name: b })
      return id
    })
    audit(db, { orgId: user.orgId, userId: user.id, action: 'site_ekle', entity: 'site', entityId: id })
    return c.json({ id }, 201)
  })

  r.get('/sites/:id', (c) => {
    const site = assertSite(db, c.get('user'), idParam(c))
    const blocks = all(db, 'SELECT * FROM blocks WHERE site_id = ? ORDER BY name', site.id)
    const managers = all(
      db,
      `SELECT u.id, u.name, u.email FROM user_sites us JOIN users u ON u.id = us.user_id WHERE us.site_id = ?`,
      site.id,
    )
    return c.json({ ...site, blocks, managers })
  })

  r.patch('/sites/:id', async (c) => {
    const user = c.get('user')
    assertRole(user, ['admin', 'yonetici'])
    const site = assertSite(db, user, idParam(c))
    const p = await body(c, SiteSchema.partial())
    const allowed = [
      'name',
      'kind',
      'address',
      'district',
      'city',
      'bank_name',
      'iban',
      'due_day',
      'late_fee_bps',
      'land_share_total',
      'manager_phone',
    ]
    update(db, 'sites', site.id, siteRow(p), allowed)
    audit(db, {
      orgId: user.orgId,
      userId: user.id,
      action: 'site_guncelle',
      entity: 'site',
      entityId: site.id,
      detail: p,
    })
    return c.json({ ok: true })
  })

  r.post('/sites/:id/blocks', async (c) => {
    const site = assertSite(db, c.get('user'), idParam(c))
    const { name } = await body(c, z.object({ name: z.string().trim().min(1).max(40) }))
    if (get(db, 'SELECT id FROM blocks WHERE site_id = ? AND name = ?', site.id, name)) fail(409, 'Bu blok zaten var')
    return c.json({ id: insert(db, 'blocks', { site_id: site.id, name }) }, 201)
  })

  // --- Bağımsız bölümler ---
  r.get('/sites/:id/units', (c) => {
    const site = assertSite(db, c.get('user'), idParam(c))
    return c.json(siteStandings(db, site.id, today(deps.now())))
  })

  const UnitSchema = z.object({
    blockId: z.number().int().positive().nullable().optional(),
    no: z.string().trim().min(1).max(12),
    floor: z.number().int().min(-5).max(80).nullable().optional(),
    kind: z.enum(['daire', 'dukkan', 'ofis', 'depo', 'diger']).default('daire'),
    areaM2: z.number().positive().max(100_000).nullable().optional(),
    landShare: z.number().int().positive(),
  })

  r.post('/sites/:id/units', async (c) => {
    const site = assertSite(db, c.get('user'), idParam(c))
    const p = await body(c, UnitSchema)
    if (p.blockId && !get(db, 'SELECT id FROM blocks WHERE id = ? AND site_id = ?', p.blockId, site.id))
      fail(400, 'Blok bu siteye ait değil')
    try {
      const id = insert(db, 'units', {
        site_id: site.id,
        block_id: p.blockId ?? null,
        no: p.no,
        floor: p.floor ?? null,
        kind: p.kind,
        area_m2: p.areaM2 ?? null,
        land_share: p.landShare,
      })
      return c.json({ id }, 201)
    } catch {
      fail(409, 'Bu blokta aynı numaralı bağımsız bölüm var')
    }
  })

  r.patch('/units/:id', async (c) => {
    const unit = assertUnit(db, c.get('user'), idParam(c))
    const p = await body(c, UnitSchema.partial())
    update(
      db,
      'units',
      unit.id,
      { block_id: p.blockId, no: p.no, floor: p.floor, kind: p.kind, area_m2: p.areaM2, land_share: p.landShare },
      ['block_id', 'no', 'floor', 'kind', 'area_m2', 'land_share'],
    )
    return c.json({ ok: true })
  })

  r.get('/units/:id', (c) => {
    const unit = assertUnit(db, c.get('user'), idParam(c))
    const block = unit.block_id
      ? get<{ name: string }>(db, 'SELECT name FROM blocks WHERE id = ?', unit.block_id)
      : null
    const occupants = all(
      db,
      `SELECT o.id, o.role, o.is_payer, o.start_date, o.end_date, p.id AS person_id, p.full_name, p.phone, p.email
       FROM occupancies o JOIN people p ON p.id = o.person_id WHERE o.unit_id = ? ORDER BY o.end_date IS NOT NULL, o.role, o.id`,
      unit.id,
    )
    const asOf = today(deps.now())
    return c.json({
      unit: { ...unit, block: block?.name ?? null, site: undefined, site_name: unit.site.name },
      occupants,
      position: unitPosition(db, unit.id, asOf, unit.site.late_fee_bps),
      statement: unitStatement(db, unit.id),
      tickets: all(
        db,
        'SELECT id, title, status, priority, created_at FROM tickets WHERE unit_id = ? ORDER BY id DESC LIMIT 10',
        unit.id,
      ),
      reminders: all(
        db,
        'SELECT stage, amount, created_at FROM reminders WHERE unit_id = ? ORDER BY id DESC LIMIT 10',
        unit.id,
      ),
    })
  })

  r.post('/units/:id/occupants', async (c) => {
    const user = c.get('user')
    const unit = assertUnit(db, user, idParam(c))
    const p = await body(
      c,
      z.object({
        personId: z.number().int().positive().optional(),
        person: PersonSchema.optional(),
        role: z.enum(['malik', 'kiraci']),
        isPayer: z.boolean().default(false),
        startDate: zDate.nullable().optional(),
      }),
    )
    const id = tx(db, () => {
      let personId = p.personId
      if (personId) {
        if (!get(db, 'SELECT id FROM people WHERE id = ? AND org_id = ?', personId, user.orgId))
          fail(404, 'Kişi bulunamadı')
      } else if (p.person) personId = upsertPerson(db, user.orgId, p.person)
      else fail(400, 'Kişi seçin ya da bilgilerini girin')
      if (p.isPayer) run(db, 'UPDATE occupancies SET is_payer = 0 WHERE unit_id = ?', unit.id)
      return insert(db, 'occupancies', {
        unit_id: unit.id,
        person_id: personId,
        role: p.role,
        is_payer: p.isPayer,
        start_date: p.startDate ?? today(deps.now()),
      })
    })
    audit(db, { orgId: user.orgId, userId: user.id, action: 'oturan_ekle', entity: 'unit', entityId: unit.id })
    return c.json({ id }, 201)
  })

  r.post('/occupancies/:id/end', async (c) => {
    const user = c.get('user')
    const occ = get<{ id: number; unit_id: number }>(db, 'SELECT id, unit_id FROM occupancies WHERE id = ?', idParam(c))
    if (!occ) fail(404, 'Kayıt bulunamadı')
    assertUnit(db, user, occ.unit_id)
    const { endDate } = await body(c, z.object({ endDate: zDate }))
    run(db, 'UPDATE occupancies SET end_date = ?, is_payer = 0 WHERE id = ?', endDate, occ.id)
    audit(db, { orgId: user.orgId, userId: user.id, action: 'tasindi', entity: 'occupancy', entityId: occ.id })
    return c.json({ ok: true })
  })

  // --- Kişiler ---
  r.get('/people', (c) => {
    const user = c.get('user')
    const { q } = parseQuery(c, z.object({ q: z.string().optional() }))
    const sites = inList(allowedSiteIds(db, user))
    const rows = all<{
      id: number
      full_name: string
      phone: string | null
      email: string | null
      units: string | null
      consent_sms: number
      consent_whatsapp: number
      consent_email: number
    }>(
      db,
      `SELECT p.id, p.full_name, p.phone, p.email, p.consent_sms, p.consent_whatsapp, p.consent_email, p.kvkk_notice_at,
         (SELECT group_concat(s.name || ' / ' || COALESCE(b.name || ' ', '') || 'No ' || u.no || ' (' || o.role || ')', '; ')
            FROM occupancies o JOIN units u ON u.id = o.unit_id JOIN sites s ON s.id = u.site_id LEFT JOIN blocks b ON b.id = u.block_id
            WHERE o.person_id = p.id AND (o.end_date IS NULL OR o.end_date >= date('now'))) AS units
       FROM people p
       WHERE p.org_id = ? AND p.anonymized_at IS NULL
         AND (EXISTS (SELECT 1 FROM occupancies o JOIN units u ON u.id = o.unit_id WHERE o.person_id = p.id AND u.site_id IN (${sites}))
              OR NOT EXISTS (SELECT 1 FROM occupancies o WHERE o.person_id = p.id))
       ORDER BY p.full_name LIMIT 500`,
      user.orgId,
    )
    const needle = q ? fold(q) : null
    return c.json(
      needle
        ? rows.filter((p) => fold(`${p.full_name} ${p.phone ?? ''} ${p.email ?? ''} ${p.units ?? ''}`).includes(needle))
        : rows,
    )
  })

  r.post('/people', async (c) => {
    const user = c.get('user')
    const p = await body(c, PersonSchema)
    const id = insert(db, 'people', { org_id: user.orgId, ...personFields(p) })
    return c.json({ id }, 201)
  })

  r.patch('/people/:id', async (c) => {
    const user = c.get('user')
    const id = idParam(c)
    if (!get(db, 'SELECT id FROM people WHERE id = ? AND org_id = ?', id, user.orgId)) fail(404, 'Kişi bulunamadı')
    const p = await body(
      c,
      PersonSchema.partial().extend({
        consentSms: z.boolean().optional(),
        consentWhatsapp: z.boolean().optional(),
        consentEmail: z.boolean().optional(),
        kvkkNotice: z.boolean().optional(),
      }),
    )
    update(
      db,
      'people',
      id,
      {
        ...personFields(p),
        consent_sms: p.consentSms,
        consent_whatsapp: p.consentWhatsapp,
        consent_email: p.consentEmail,
        kvkk_notice_at: p.kvkkNotice ? deps.now().toISOString() : undefined,
      },
      ['full_name', 'phone', 'email', 'notes', 'consent_sms', 'consent_whatsapp', 'consent_email', 'kvkk_notice_at'],
    )
    audit(db, { orgId: user.orgId, userId: user.id, action: 'kisi_guncelle', entity: 'person', entityId: id })
    return c.json({ ok: true })
  })

  // KVKK m.11: ilgili kişinin verilerinin dökümü
  r.get('/people/:id/export', (c) => {
    const user = c.get('user')
    const id = idParam(c)
    const person = get(db, 'SELECT * FROM people WHERE id = ? AND org_id = ?', id, user.orgId)
    if (!person) fail(404, 'Kişi bulunamadı')
    audit(db, { orgId: user.orgId, userId: user.id, action: 'kvkk_doku', entity: 'person', entityId: id })
    return c.json(personExport(db, id))
  })

  // KVKK m.7: silme / anonimleştirme. Mali kayıtlar daireye bağlı olduğu için korunur (yasal saklama).
  r.post('/people/:id/anonymize', async (c) => {
    const user = c.get('user')
    assertRole(user, ['admin'])
    const id = idParam(c)
    if (!get(db, 'SELECT id FROM people WHERE id = ? AND org_id = ? AND anonymized_at IS NULL', id, user.orgId))
      fail(404, 'Kişi bulunamadı')
    tx(db, () => {
      run(
        db,
        `UPDATE people SET full_name = ?, phone = NULL, email = NULL, notes = NULL, consent_sms = 0, consent_whatsapp = 0, consent_email = 0, anonymized_at = ? WHERE id = ?`,
        `Silinmiş kişi #${id}`,
        deps.now().toISOString(),
        id,
      )
      run(
        db,
        `UPDATE occupancies SET end_date = COALESCE(end_date, ?), is_payer = 0 WHERE person_id = ?`,
        today(deps.now()),
        id,
      )
      run(db, `UPDATE users SET active = 0, phone = NULL, name = ? WHERE person_id = ?`, `Silinmiş kişi #${id}`, id)
      run(
        db,
        `UPDATE messages SET body = '[kişisel veri silindi]', address = NULL, subject = NULL, triage = NULL WHERE person_id = ?`,
        id,
      )
    })
    audit(db, { orgId: user.orgId, userId: user.id, action: 'kvkk_silme', entity: 'person', entityId: id })
    return c.json({ ok: true })
  })

  // --- Tedarikçiler ---
  const VendorSchema = z.object({
    name: z.string().trim().min(2).max(120),
    trade: z.enum(Object.keys(VENDOR_TRADES) as [VendorTrade, ...VendorTrade[]]),
    phone: z.string().nullable().optional(),
    email: z.string().email().nullable().optional().or(z.literal('')),
    taxNo: z.string().max(20).nullable().optional(),
    rating: z.number().int().min(1).max(5).nullable().optional(),
    notes: z.string().max(1000).nullable().optional(),
    active: z.boolean().optional(),
  })
  const vendorRow = (p: Partial<z.infer<typeof VendorSchema>>) => {
    const phone = p.phone ? normalizePhone(p.phone) : p.phone
    if (p.phone && !phone) fail(400, 'Telefon numarası geçersiz')
    return {
      name: p.name,
      trade: p.trade,
      phone,
      email: p.email || null,
      tax_no: p.taxNo,
      rating: p.rating,
      notes: p.notes,
      active: p.active,
    }
  }

  r.get('/vendors', (c) => {
    return c.json(
      all(
        db,
        `SELECT v.*, (SELECT COUNT(*) FROM tickets t WHERE t.vendor_id = v.id AND t.status IN ('atandi','islemde','beklemede')) AS open_jobs,
           (SELECT COUNT(*) FROM tickets t WHERE t.vendor_id = v.id AND t.status IN ('cozuldu','kapandi')) AS done_jobs
         FROM vendors v WHERE v.org_id = ? ORDER BY v.active DESC, v.trade, v.name`,
        c.get('user').orgId,
      ),
    )
  })

  r.post('/vendors', async (c) => {
    const user = c.get('user')
    const p = await body(c, VendorSchema)
    return c.json({ id: insert(db, 'vendors', { org_id: user.orgId, ...vendorRow(p) }) }, 201)
  })

  r.patch('/vendors/:id', async (c) => {
    const user = c.get('user')
    const id = idParam(c)
    if (!get(db, 'SELECT id FROM vendors WHERE id = ? AND org_id = ?', id, user.orgId))
      fail(404, 'Tedarikçi bulunamadı')
    const p = await body(c, VendorSchema.partial())
    update(db, 'vendors', id, vendorRow(p), ['name', 'trade', 'phone', 'email', 'tax_no', 'rating', 'notes', 'active'])
    return c.json({ ok: true })
  })

  // --- Toplu içe aktarma (portföy devri) ---
  r.post('/sites/:id/import/units', async (c) => {
    const user = c.get('user')
    const site = assertSite(db, user, idParam(c))
    const { csv, dryRun } = await body(
      c,
      z.object({ csv: z.string().min(10).max(2_000_000), dryRun: z.boolean().default(true) }),
    )
    const result = importUnits(db, user.orgId, site.id, csv, dryRun, today(deps.now()))
    if (!dryRun)
      audit(db, {
        orgId: user.orgId,
        userId: user.id,
        action: 'ice_aktar_daire',
        entity: 'site',
        entityId: site.id,
        detail: result.summary,
      })
    return c.json(result)
  })

  r.post('/sites/:id/import/balances', async (c) => {
    const user = c.get('user')
    const site = assertSite(db, user, idParam(c))
    const p = await body(
      c,
      z.object({
        csv: z.string().min(5).max(1_000_000),
        asOf: zDate,
        dryRun: z.boolean().default(true),
        lateFee: z.boolean().default(false),
      }),
    )
    const result = importBalances(db, site.id, p.csv, p.asOf, p.dryRun, p.lateFee, user.id)
    if (!p.dryRun)
      audit(db, {
        orgId: user.orgId,
        userId: user.id,
        action: 'ice_aktar_bakiye',
        entity: 'site',
        entityId: site.id,
        detail: result.summary,
      })
    return c.json(result)
  })

  return r
}

export function personExport(db: DB, id: number) {
  return {
    olusturulma: new Date().toISOString(),
    aciklama: 'KVKK m.11 kapsamında ilgili kişinin işlenen kişisel verileri',
    kisi: get(
      db,
      'SELECT id, full_name, phone, email, notes, kvkk_notice_at, consent_sms, consent_whatsapp, consent_email, created_at FROM people WHERE id = ?',
      id,
    ),
    bagimsiz_bolumler: all(
      db,
      `SELECT s.name AS site, b.name AS blok, u.no, o.role, o.start_date, o.end_date FROM occupancies o
       JOIN units u ON u.id = o.unit_id JOIN sites s ON s.id = u.site_id LEFT JOIN blocks b ON b.id = u.block_id WHERE o.person_id = ?`,
      id,
    ),
    mesajlar: all(
      db,
      'SELECT channel, direction, subject, body, created_at FROM messages WHERE person_id = ? ORDER BY id',
      id,
    ),
    talepler: all(
      db,
      'SELECT id, title, description, status, created_at FROM tickets WHERE person_id = ? ORDER BY id',
      id,
    ),
    online_odemeler: all(
      db,
      'SELECT amount, status, created_at FROM payment_intents WHERE person_id = ? ORDER BY id',
      id,
    ),
  }
}

const COLS = {
  blok: ['blok', 'block'],
  no: ['daire no', 'daire', 'no', 'kapi no', 'bagimsiz bolum'],
  kat: ['kat'],
  tip: ['tip', 'tur', 'cins'],
  m2: ['m2', 'metrekare', 'alan', 'brut m2'],
  arsa: ['arsa payi', 'arsa', 'pay'],
  malik: ['malik', 'malik ad', 'malik adi', 'malik ad soyad', 'kat maliki'],
  malikTel: ['malik tel', 'malik telefon', 'malik gsm'],
  malikEposta: ['malik eposta', 'malik e-posta', 'malik mail'],
  kiraci: ['kiraci', 'kiraci ad', 'kiraci adi', 'kiraci ad soyad'],
  kiraciTel: ['kiraci tel', 'kiraci telefon', 'kiraci gsm'],
  kiraciEposta: ['kiraci eposta', 'kiraci e-posta', 'kiraci mail'],
  odeyen: ['odeyen', 'aidat odeyen'],
  bakiye: ['bakiye', 'borc', 'devir', 'tutar'],
} as const

function columnIndex(header: string[]) {
  const h = header.map((x) => fold(x).replace(/[_./]/g, ' ').trim())
  const idx = {} as Record<keyof typeof COLS, number>
  for (const [key, names] of Object.entries(COLS) as [keyof typeof COLS, readonly string[]][]) {
    idx[key] = h.findIndex((x) => names.includes(x))
  }
  return idx
}

export function importUnits(db: DB, orgId: number, siteId: number, csv: string, dryRun: boolean, startDate: string) {
  const rows = parseCsv(csv)
  if (rows.length < 2) fail(400, 'CSV boş ya da başlık satırı yok')
  const idx = columnIndex(rows[0]!)
  if (idx.no < 0 || idx.arsa < 0)
    fail(400, 'CSV’de en az "daire_no" ve "arsa_payi" sütunları olmalı (şablonu kullanın)')
  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '')
  const errors: { row: number; error: string }[] = []
  const parsed = rows.slice(1).map((r, i) => {
    const row = i + 2
    const land = Number(cell(r, idx.arsa).replace(',', '.'))
    const m2 = cell(r, idx.m2) ? Number(cell(r, idx.m2).replace(',', '.')) : null
    const malikTel = cell(r, idx.malikTel)
    const kiraciTel = cell(r, idx.kiraciTel)
    const item = {
      row,
      block: cell(r, idx.blok) || null,
      no: cell(r, idx.no),
      floor: cell(r, idx.kat) ? Number(cell(r, idx.kat)) : null,
      kind: (fold(cell(r, idx.tip)) || 'daire') as string,
      area: m2,
      land: Math.round(land),
      owner: cell(r, idx.malik) || null,
      ownerPhone: malikTel ? normalizePhone(malikTel) : null,
      ownerEmail: cell(r, idx.malikEposta) || null,
      tenant: cell(r, idx.kiraci) || null,
      tenantPhone: kiraciTel ? normalizePhone(kiraciTel) : null,
      tenantEmail: cell(r, idx.kiraciEposta) || null,
      payer: fold(cell(r, idx.odeyen)).startsWith('kira') ? 'kiraci' : 'malik',
    }
    if (!item.no) errors.push({ row, error: 'Daire no boş' })
    if (!Number.isFinite(land) || land <= 0) errors.push({ row, error: 'Arsa payı pozitif sayı olmalı' })
    if (m2 !== null && !(m2 > 0)) errors.push({ row, error: 'm² geçersiz' })
    if (malikTel && !item.ownerPhone) errors.push({ row, error: `Malik telefonu geçersiz: ${malikTel}` })
    if (kiraciTel && !item.tenantPhone) errors.push({ row, error: `Kiracı telefonu geçersiz: ${kiraciTel}` })
    if (!['daire', 'dukkan', 'ofis', 'depo', 'diger'].includes(item.kind)) item.kind = 'diger'
    return item
  })
  const summary = {
    rows: parsed.length,
    blocks: new Set(parsed.map((p) => p.block).filter(Boolean)).size,
    people: 0,
    errors: errors.length,
  }
  if (dryRun || errors.length) return { dryRun: true, summary, errors, preview: parsed.slice(0, 50) }
  tx(db, () => {
    const blockIds = new Map<string, number>()
    for (const b of all<{ id: number; name: string }>(db, 'SELECT id, name FROM blocks WHERE site_id = ?', siteId))
      blockIds.set(b.name, b.id)
    for (const p of parsed) {
      let blockId: number | null = null
      if (p.block) {
        blockId = blockIds.get(p.block) ?? insert(db, 'blocks', { site_id: siteId, name: p.block })
        blockIds.set(p.block, blockId)
      }
      const existing = get<{ id: number }>(
        db,
        'SELECT id FROM units WHERE site_id = ? AND COALESCE(block_id,0) = ? AND no = ?',
        siteId,
        blockId ?? 0,
        p.no,
      )
      const unitId =
        existing?.id ??
        insert(db, 'units', {
          site_id: siteId,
          block_id: blockId,
          no: p.no,
          floor: p.floor,
          kind: p.kind,
          area_m2: p.area,
          land_share: p.land,
        })
      if (existing)
        run(db, 'UPDATE units SET land_share = ?, area_m2 = COALESCE(?, area_m2) WHERE id = ?', p.land, p.area, unitId)
      const link = (name: string | null, phone: string | null, email: string | null, role: 'malik' | 'kiraci') => {
        if (!name) return
        const personId = upsertPerson(db, orgId, { fullName: name, phone, email })
        summary.people++
        if (
          !get(
            db,
            'SELECT id FROM occupancies WHERE unit_id = ? AND person_id = ? AND role = ? AND end_date IS NULL',
            unitId,
            personId,
            role,
          )
        ) {
          insert(db, 'occupancies', {
            unit_id: unitId,
            person_id: personId,
            role,
            is_payer: p.payer === role,
            start_date: startDate,
          })
        }
      }
      link(p.owner, p.ownerPhone, p.ownerEmail, 'malik')
      link(p.tenant, p.tenantPhone, p.tenantEmail, 'kiraci')
    }
  })
  return { dryRun: false, summary, errors: [], preview: [] }
}

export function importBalances(
  db: DB,
  siteId: number,
  csv: string,
  asOf: string,
  dryRun: boolean,
  lateFee: boolean,
  userId: number,
) {
  const rows = parseCsv(csv)
  if (rows.length < 2) fail(400, 'CSV boş ya da başlık satırı yok')
  const idx = columnIndex(rows[0]!)
  if (idx.no < 0 || idx.bakiye < 0)
    fail(400, 'CSV’de "daire_no" ve "bakiye" sütunları olmalı (borç pozitif, avans negatif)')
  const units = all<{ id: number; no: string; block: string | null }>(
    db,
    'SELECT u.id, u.no, b.name AS block FROM units u LEFT JOIN blocks b ON b.id = u.block_id WHERE u.site_id = ?',
    siteId,
  )
  const errors: { row: number; error: string }[] = []
  const items = rows.slice(1).map((r, i) => {
    const row = i + 2
    const block = idx.blok >= 0 ? (r[idx.blok] ?? '').trim() || null : null
    const no = (r[idx.no] ?? '').trim()
    const amount = parseAmount(r[idx.bakiye] ?? '')
    const unit = units.find((u) => u.no === no && (u.block ?? null) === block)
    if (!unit) errors.push({ row, error: `Bağımsız bölüm bulunamadı: ${block ? `${block} ` : ''}${no}` })
    if (amount === null) errors.push({ row, error: 'Bakiye okunamadı' })
    return { row, unitId: unit?.id ?? null, label: `${block ? `${block} ` : ''}No ${no}`, amount: amount ?? 0 }
  })
  const summary = {
    rows: items.length,
    debt: items.filter((x) => x.amount > 0).reduce((s, x) => s + x.amount, 0),
    credit: items.filter((x) => x.amount < 0).reduce((s, x) => s - x.amount, 0),
    errors: errors.length,
  }
  if (dryRun || errors.length) return { dryRun: true, summary, errors, preview: items.slice(0, 50) }
  tx(db, () => {
    for (const x of items) {
      if (!x.unitId || x.amount === 0) continue
      if (x.amount > 0) {
        insert(db, 'charges', {
          site_id: siteId,
          unit_id: x.unitId,
          kind: 'devir',
          description: `Devir bakiyesi (${asOf})`,
          amount: x.amount,
          due_date: asOf,
          late_fee: lateFee,
          batch_key: `devir:${asOf}`,
          created_by: userId,
        })
      } else {
        insert(db, 'payments', {
          site_id: siteId,
          unit_id: x.unitId,
          amount: -x.amount,
          paid_on: asOf,
          method: 'havale',
          source: 'devir',
          note: `Devir avansı (${asOf})`,
          created_by: userId,
        })
      }
    }
  })
  return { dryRun: false, summary, errors: [], preview: [] }
}
