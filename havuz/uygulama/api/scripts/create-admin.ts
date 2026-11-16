/**
 * `npm run create-admin -w @uygulama/api -- --email yonetici@ornek.com [--password '…'] [--name 'Ad']`
 * Kullanıcı varsa yönetici yapar; yoksa yönetici olarak açar (şifre verilmezse rastgele üretip ekrana yazar).
 * Kalıcı yol ADMIN_EMAILS ayarıdır; bu betik "hemen şimdi" yetki vermek içindir.
 *
 * Genişletme: yöneticiliği geri almak için yönetim ucu (PATCH /api/admin/users/:id { role: 'user' }) kullanılır.
 */
import { randomBytes } from 'node:crypto'
import { parseArgs } from 'node:util'
import { emailSchema, newPasswordSchema } from '@uygulama/shared'
import { assertStrong, insertUserWithWorkspace } from '../src/modules/auth/service.ts'
import { findUserByEmail, updateUserAdminFields } from '../src/modules/auth/userRepo.ts'
import { openScriptContext, print, runScript, ScriptError } from './lib.ts'

runScript(async () => {
  const { values } = parseArgs({
    options: { email: { type: 'string' }, password: { type: 'string' }, name: { type: 'string' } },
  })
  if (!values.email) throw new ScriptError('Kullanım: npm run create-admin -w @uygulama/api -- --email kisi@ornek.com')
  const email = emailSchema.safeParse(values.email)
  if (!email.success) throw new ScriptError('--email geçerli bir e-posta olmalı.')
  const { ctx, db } = openScriptContext()
  try {
    const existing = findUserByEmail(db, email.data)
    if (existing) {
      db.transaction(() => {
        updateUserAdminFields(db, existing.id, { role: 'admin' }, ctx.clock.now().toISOString())
        ctx.audit.record({
          action: 'admin.user_updated',
          targetType: 'user',
          targetId: existing.id,
          details: { role: 'admin', via: 'create-admin' },
        })
      })
      print(`${email.data} artık yönetici.`)
      return
    }
    const name = values.name ?? 'Yönetici'
    const password = values.password ?? randomBytes(12).toString('base64url')
    const length = newPasswordSchema.safeParse(password)
    if (!length.success) throw new ScriptError(`--password: ${length.error.issues[0]?.message ?? 'geçersiz'}`)
    try {
      assertStrong(password, { email: email.data, name }, 'password')
    } catch (error) {
      throw new ScriptError(`--password: ${error instanceof Error ? error.message : String(error)}`)
    }
    const passwordHash = await ctx.hasher.hash(password)
    db.transaction(() => insertUserWithWorkspace(ctx, { email: email.data, name, passwordHash, role: 'admin' }))
    print('Yönetici hesabı açıldı.')
    print(`E-posta: ${email.data}`)
    print(`Şifre:   ${password}`)
  } finally {
    db.close()
  }
})
