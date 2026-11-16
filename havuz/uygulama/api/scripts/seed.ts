/**
 * `npm run seed -w @uygulama/api -- [--email e@ornek.com] [--password '…'] [--name 'Ad']`
 * Deneme kullanıcısı + kişisel alanına örnek bir liste ve görevler ekler; e-postayı ve şifreyi ekrana yazar.
 *  - Şifre verilmezse rastgele üretilir (ekrana basılır).
 *  - Kullanıcı zaten varsa: şifre verildiyse şifresi güncellenir (uçtan uca testler için), örnek veri yeniden eklenmez.
 * Örnek kayıtlar gerçek eşitleme koduyla yazılır (rev'ler ve zamanlar doğru olsun diye).
 *
 * Genişletme: yeni bir varlığın örnek verisini `sampleMutations` içine ekleyin.
 */
import { randomBytes } from 'node:crypto'
import { parseArgs } from 'node:util'
import { emailSchema, newPasswordSchema, PROTOCOL_VERSION, uuidv7, type Mutation } from '@uygulama/shared'
import { assertStrong, insertUserWithWorkspace } from '../src/modules/auth/service.ts'
import { findUserByEmail, updatePasswordHash } from '../src/modules/auth/userRepo.ts'
import { runSync } from '../src/modules/sync/service.ts'
import { listUserWorkspaces } from '../src/modules/workspaces/repo.ts'
import { openScriptContext, print, runScript, ScriptError } from './lib.ts'

function sampleMutations(workspaceId: string, today: Date): Mutation[] {
  const at = today.toISOString()
  const listId = uuidv7()
  const inTwoDays = new Date(today.getTime() + 2 * 24 * 60 * 60_000).toISOString().slice(0, 10)
  const base = { workspaceId, at } as const
  return [
    { ...base, mid: 1, collection: 'lists', recordId: listId, op: 'put', data: { name: 'Ev', color: 'green' } },
    { ...base, mid: 2, collection: 'tasks', recordId: uuidv7(), op: 'put', data: { title: 'Süt ve ekmek al', listId } },
    {
      ...base,
      mid: 3,
      collection: 'tasks',
      recordId: uuidv7(),
      op: 'put',
      data: { title: 'Elektrik faturasını öde', listId, dueDate: inTwoDays, priority: 'high' },
    },
    {
      ...base,
      mid: 4,
      collection: 'tasks',
      recordId: uuidv7(),
      op: 'put',
      data: { title: 'Kitabı bitir', done: true },
    },
  ]
}

runScript(async () => {
  const { values } = parseArgs({
    options: { email: { type: 'string' }, password: { type: 'string' }, name: { type: 'string' } },
  })
  const email = emailSchema.safeParse(values.email ?? 'deneme@ornek.com')
  if (!email.success) throw new ScriptError('--email geçerli bir e-posta olmalı.')
  const name = values.name ?? 'Deneme Kullanıcı'
  const password = values.password ?? randomBytes(12).toString('base64url')
  const length = newPasswordSchema.safeParse(password)
  if (!length.success) throw new ScriptError(`--password: ${length.error.issues[0]?.message ?? 'geçersiz'}`)
  try {
    assertStrong(password, { email: email.data, name }, 'password')
  } catch (error) {
    throw new ScriptError(`--password: ${error instanceof Error ? error.message : String(error)}`)
  }

  const { ctx, db, config } = openScriptContext()
  try {
    const passwordHash = await ctx.hasher.hash(password)
    const existing = findUserByEmail(db, email.data)
    if (existing) {
      if (values.password) updatePasswordHash(db, existing.id, passwordHash, ctx.clock.now().toISOString())
      print(`Kullanıcı zaten var: ${email.data}${values.password ? ' (şifresi güncellendi)' : ''}`)
      if (values.password) print(`Şifre:   ${password}`)
      return
    }
    const userId = db.transaction(() => insertUserWithWorkspace(ctx, { email: email.data, name, passwordHash }))
    const personal = listUserWorkspaces(db, userId).find((workspace) => workspace.kind === 'personal')
    if (!personal) throw new ScriptError('Kişisel alan açılamadı.')
    const outcome = runSync({ db, clock: ctx.clock, registry: ctx.registry, pageSize: config.syncPageSize }, userId, {
      protocolVersion: PROTOCOL_VERSION,
      clientId: `tohum-${uuidv7()}`,
      cursors: {},
      mutations: sampleMutations(personal.id, ctx.clock.now()),
    })
    if (outcome.response.rejected.length > 0) {
      throw new ScriptError(
        `Örnek veri reddedildi: ${outcome.response.rejected.map((item) => item.message).join('; ')}`,
      )
    }
    print('Deneme kullanıcısı hazır.')
    print(`Veritabanı: ${config.databasePath}`)
    print(`E-posta: ${email.data}`)
    print(`Şifre:   ${password}`)
    print(`Örnek kayıt: ${outcome.response.touched.length} (1 liste, 3 görev)`)
  } finally {
    db.close()
  }
})
