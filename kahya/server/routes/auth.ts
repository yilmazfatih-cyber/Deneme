// Giriş/çıkış. Personel: e-posta + parola. Sakin: telefon + SMS ile tek kullanımlık kod.
import { Hono } from 'hono'
import { z } from 'zod'
import { residentUnits } from '../access.ts'
import {
  checkOtp,
  clearSession,
  createSession,
  issueOtp,
  rateLimit,
  requireAuth,
  setSessionCookie,
  verifyPassword,
} from '../auth/auth.ts'
import { audit, get, insert, type DB } from '../db/db.ts'
import { normalizePhone } from '../domain/text.ts'
import { body, clientIp, fail, type Deps, type Env } from '../http.ts'
import { allowedSiteIds, inList } from '../access.ts'
import { all } from '../db/db.ts'

function residentPerson(db: DB, phone: string) {
  return get<{ id: number; org_id: number; full_name: string }>(
    db,
    `SELECT p.id, p.org_id, p.full_name FROM people p
     WHERE p.phone = ? AND p.anonymized_at IS NULL
       AND EXISTS (SELECT 1 FROM occupancies o WHERE o.person_id = p.id AND (o.end_date IS NULL OR o.end_date >= date('now')))
     ORDER BY p.id DESC`,
    phone,
  )
}

export function authRoutes(deps: Deps) {
  const { db } = deps
  const r = new Hono<Env>()

  r.post('/login', async (c) => {
    rateLimit(`giris:${clientIp(c)}`, 20, 15 * 60_000)
    const { email, password } = await body(
      c,
      z.object({ email: z.string().trim().email(), password: z.string().min(1) }),
    )
    const user = get<{ id: number; org_id: number; password_hash: string | null; active: number; role: string }>(
      db,
      `SELECT * FROM users WHERE lower(email) = lower(?) AND role <> 'sakin'`,
      email,
    )
    const ok = await verifyPassword(password, user?.password_hash ?? null)
    if (!user || !ok || !user.active) fail(401, 'E-posta veya parola hatalı')
    const { token, maxAge } = createSession(deps, user.id)
    setSessionCookie(c, deps, token, maxAge)
    audit(db, { orgId: user.org_id, userId: user.id, action: 'giris', detail: { ip: clientIp(c) } })
    return c.json({ ok: true, role: user.role })
  })

  r.post('/otp', async (c) => {
    const { phone } = await body(c, z.object({ phone: z.string().min(7).max(30) }))
    const norm = normalizePhone(phone)
    if (!norm) fail(400, 'Geçerli bir telefon numarası girin')
    rateLimit(`otp:${norm}`, 5, 60 * 60_000)
    rateLimit(`otp-ip:${clientIp(c)}`, 30, 60 * 60_000)
    const person = residentPerson(db, norm)
    // Numaranın kayıtlı olup olmadığı dışarıya sızdırılmaz; yalnız demo modunda bilgi verilir.
    if (!person) return c.json({ ok: true, ...(deps.config.demo ? { registered: false } : {}) })
    const code = issueOtp(db, norm, deps.now())
    await deps.messaging.sms.send({ to: norm, body: `Kâhya giriş kodunuz: ${code}. Bu kodu kimseyle paylaşmayın.` })
    return c.json({ ok: true, ...(deps.config.demo ? { registered: true, demoCode: code } : {}) })
  })

  r.post('/otp/verify', async (c) => {
    const { phone, code } = await body(
      c,
      z.object({ phone: z.string(), code: z.string().regex(/^\d{6}$/, '6 haneli kod girin') }),
    )
    const norm = normalizePhone(phone)
    if (!norm) fail(400, 'Geçerli bir telefon numarası girin')
    rateLimit(`otp-dogrula:${norm}`, 10, 15 * 60_000)
    if (!checkOtp(db, norm, code, deps.now())) fail(401, 'Kod hatalı ya da süresi dolmuş')
    const person = residentPerson(db, norm)
    if (!person) fail(401, 'Bu numaraya kayıtlı bir sakin bulunamadı')
    let user = get<{ id: number; active: number }>(
      db,
      `SELECT id, active FROM users WHERE org_id = ? AND person_id = ? AND role = 'sakin'`,
      person.org_id,
      person.id,
    )
    if (!user) {
      const id = insert(db, 'users', {
        org_id: person.org_id,
        name: person.full_name,
        phone: norm,
        role: 'sakin',
        person_id: person.id,
      })
      user = { id, active: 1 }
    }
    if (!user.active) fail(403, 'Hesabınız devre dışı')
    const { token, maxAge } = createSession(deps, user.id)
    setSessionCookie(c, deps, token, maxAge)
    audit(db, { orgId: person.org_id, userId: user.id, action: 'sakin_giris' })
    return c.json({ ok: true, role: 'sakin' })
  })

  r.post('/logout', (c) => {
    clearSession(c, db)
    return c.json({ ok: true })
  })

  r.get('/me', requireAuth(deps), (c) => {
    const user = c.get('user')
    const org = get<{ id: number; name: string }>(db, 'SELECT id, name FROM orgs WHERE id = ?', user.orgId)
    const isResident = user.role === 'sakin'
    const sites = isResident
      ? []
      : all<{ id: number; name: string; kind: string; district: string | null; city: string | null }>(
          db,
          `SELECT id, name, kind, district, city FROM sites WHERE id IN (${inList(allowedSiteIds(db, user))}) ORDER BY id`,
        )
    return c.json({
      user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role },
      org,
      sites,
      units: isResident ? residentUnits(db, user) : [],
      ai: deps.ai.describe(),
      demo: deps.config.demo,
      payments: { enabled: deps.payments.enabled, provider: deps.payments.provider.name },
    })
  })

  return r
}
