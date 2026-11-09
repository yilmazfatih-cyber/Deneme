// Personel: pano, ayarlar, entegrasyon durumu, otopilot, kullanıcılar, denetim günlüğü.
import { Hono } from 'hono'
import { z } from 'zod'
import { AUTONOMY_ACTIONS, AUTONOMY_LEVELS, SENDABLE_CHANNELS, type Channel } from '../../shared/labels.ts'
import { allowedSiteIds } from '../access.ts'
import { assertRole, hashPassword } from '../auth/auth.ts'
import { all, audit, get, insert, run, tx } from '../db/db.ts'
import { normalizePhone } from '../domain/text.ts'
import { body, fail, idParam, parseQuery, zIdQuery, type Deps, type Env } from '../http.ts'
import { runAutopilot } from '../services/autopilot.ts'
import { orgSettings } from '../services/common.ts'
import { dashboard } from '../services/dashboard.ts'

const zLevel = z.enum(Object.keys(AUTONOMY_LEVELS) as [keyof typeof AUTONOMY_LEVELS])

const SettingsSchema = z.object({
  autonomy: z.object(
    Object.fromEntries(Object.keys(AUTONOMY_ACTIONS).map((k) => [k, zLevel])) as Record<
      keyof typeof AUTONOMY_ACTIONS,
      typeof zLevel
    >,
  ),
  reminders: z
    .object({
      firstAfterDays: z.number().int().min(1).max(365),
      secondAfterDays: z.number().int().min(1).max(365),
      finalAfterDays: z.number().int().min(1).max(730),
      channels: z.array(z.enum(SENDABLE_CHANNELS as [Channel, ...Channel[]])).min(1),
    })
    .refine((r) => r.firstAfterDays < r.secondAfterDays && r.secondAfterDays < r.finalAfterDays, {
      message: 'Hatırlatma günleri artan sırada olmalı',
    }),
  autoAccrual: z.boolean(),
  autoLateFee: z.boolean(),
  emergencyPhone: z.string().nullable(),
})

export function adminRoutes(deps: Deps) {
  const { db } = deps
  const r = new Hono<Env>()

  r.get('/dashboard', (c) => {
    const { siteId } = parseQuery(c, z.object({ siteId: zIdQuery.optional() }))
    return c.json(dashboard(db, c.get('user'), deps.now(), siteId))
  })

  r.get('/settings', (c) => {
    const user = c.get('user')
    const org = get(db, 'SELECT id, name, phone, email, address, tax_no FROM orgs WHERE id = ?', user.orgId)
    return c.json({ org, settings: orgSettings(db, user.orgId) })
  })

  r.put('/settings', async (c) => {
    const user = c.get('user')
    assertRole(user, ['admin'])
    const s = await body(c, SettingsSchema)
    if (s.emergencyPhone) {
      const p = normalizePhone(s.emergencyPhone)
      if (!p) fail(400, 'Acil durum telefonu geçersiz')
      s.emergencyPhone = p
    }
    run(db, 'UPDATE orgs SET settings = ? WHERE id = ?', JSON.stringify(s), user.orgId)
    audit(db, { orgId: user.orgId, userId: user.id, action: 'ayarlar', detail: s })
    return c.json({ settings: orgSettings(db, user.orgId) })
  })

  r.get('/integrations', (c) => {
    const base = deps.config.publicUrl
    return c.json({
      ai: deps.ai.describe(),
      messaging: deps.messaging.status(),
      payments: {
        provider: deps.payments.provider.name,
        live: deps.payments.provider.live,
        enabled: deps.payments.enabled,
      },
      webhooks: {
        whatsapp: `${base}/api/webhooks/whatsapp`,
        sms: `${base}/api/webhooks/sms`,
        email: `${base}/api/webhooks/email`,
        paytr: `${base}/api/webhooks/paytr`,
      },
      demo: deps.config.demo,
    })
  })

  r.post('/autopilot/run', async (c) => {
    const user = c.get('user')
    assertRole(user, ['admin', 'yonetici'])
    const summary = await runAutopilot(deps, { orgId: user.orgId })
    audit(db, { orgId: user.orgId, userId: user.id, action: 'otopilot', detail: summary })
    return c.json(summary)
  })

  r.get('/audit', (c) => {
    const user = c.get('user')
    assertRole(user, ['admin', 'muhasebe'])
    return c.json(
      all(
        db,
        `SELECT a.*, u.name AS user_name FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
         WHERE a.org_id = ? ORDER BY a.id DESC LIMIT 200`,
        user.orgId,
      ),
    )
  })

  r.get('/users', (c) => {
    const user = c.get('user')
    const users = all<{
      id: number
      name: string
      email: string
      role: string
      active: number
      last_login_at: string | null
    }>(
      db,
      `SELECT id, name, email, role, active, last_login_at FROM users WHERE org_id = ? AND role <> 'sakin' ORDER BY name`,
      user.orgId,
    )
    const links = all<{ user_id: number; site_id: number }>(
      db,
      `SELECT us.* FROM user_sites us JOIN users u ON u.id = us.user_id WHERE u.org_id = ?`,
      user.orgId,
    )
    return c.json(users.map((u) => ({ ...u, siteIds: links.filter((l) => l.user_id === u.id).map((l) => l.site_id) })))
  })

  r.post('/users', async (c) => {
    const user = c.get('user')
    assertRole(user, ['admin'])
    const p = await body(
      c,
      z.object({
        name: z.string().trim().min(2),
        email: z.string().trim().email(),
        password: z.string().min(10, 'Parola en az 10 karakter olmalı'),
        role: z.enum(['admin', 'yonetici', 'muhasebe']),
        siteIds: z.array(z.number().int()).default([]),
      }),
    )
    if (get(db, 'SELECT id FROM users WHERE lower(email) = lower(?)', p.email)) fail(409, 'Bu e-posta zaten kayıtlı')
    const allowed = allowedSiteIds(db, user)
    const hash = await hashPassword(p.password)
    const id = tx(db, () => {
      const id = insert(db, 'users', {
        org_id: user.orgId,
        name: p.name,
        email: p.email.toLowerCase(),
        password_hash: hash,
        role: p.role,
      })
      for (const s of p.siteIds.filter((s) => allowed.includes(s)))
        insert(db, 'user_sites', { user_id: id, site_id: s })
      return id
    })
    audit(db, { orgId: user.orgId, userId: user.id, action: 'kullanici_ekle', entity: 'user', entityId: id })
    return c.json({ id }, 201)
  })

  r.patch('/users/:id', async (c) => {
    const user = c.get('user')
    assertRole(user, ['admin'])
    const id = idParam(c)
    const target = get<{ id: number }>(
      db,
      `SELECT id FROM users WHERE id = ? AND org_id = ? AND role <> 'sakin'`,
      id,
      user.orgId,
    )
    if (!target) fail(404, 'Kullanıcı bulunamadı')
    const p = await body(
      c,
      z.object({
        active: z.boolean().optional(),
        role: z.enum(['admin', 'yonetici', 'muhasebe']).optional(),
        siteIds: z.array(z.number().int()).optional(),
      }),
    )
    if (id === user.id && (p.active === false || (p.role && p.role !== 'admin')))
      fail(400, 'Kendi yetkinizi kaldıramazsınız')
    tx(db, () => {
      if (p.active !== undefined) run(db, 'UPDATE users SET active = ? WHERE id = ?', p.active ? 1 : 0, id)
      if (p.active === false) run(db, 'DELETE FROM sessions WHERE user_id = ?', id)
      if (p.role) run(db, 'UPDATE users SET role = ? WHERE id = ?', p.role, id)
      if (p.siteIds) {
        const allowed = allowedSiteIds(db, user)
        run(db, 'DELETE FROM user_sites WHERE user_id = ?', id)
        for (const s of p.siteIds.filter((s) => allowed.includes(s)))
          insert(db, 'user_sites', { user_id: id, site_id: s })
      }
    })
    audit(db, {
      orgId: user.orgId,
      userId: user.id,
      action: 'kullanici_guncelle',
      entity: 'user',
      entityId: id,
      detail: p,
    })
    return c.json({ ok: true })
  })

  return r
}
