import { API_PATHS } from '@uygulama/shared'
import { afterEach, describe, expect, it } from 'vitest'
import { AUDIT_ACTIONS } from '../../src/modules/audit/repo.ts'
import { GOOD_PASSWORD, signUp, TestClient } from '../support/client.ts'
import { createTestServer, type TestServer } from '../support/harness.ts'
import { addMember, createShared } from '../support/workspaces.ts'

let t: TestServer
afterEach(async () => {
  await t.close()
})

describe('denetim günlüğü', () => {
  it('giriş, başarısız giriş, şifre değişimi, üyelik ve yönetici işlemlerini IP ile kaydeder; kişisel veri yazmaz', async () => {
    t = createTestServer({ env: { ADMIN_EMAILS: 'yonetici@ornek.com', TRUST_PROXY: '1' } })
    const admin = await signUp(t, { email: 'yonetici@ornek.com' })
    const ayse = await signUp(t, { email: 'ayse.denetim@ornek.com', options: { ip: '203.0.113.5' } })
    await new TestClient(t, { ip: '203.0.113.5' }).post(API_PATHS.login, { email: ayse.email, password: GOOD_PASSWORD })
    await new TestClient(t, { ip: '198.51.100.1' }).post(API_PATHS.login, {
      email: ayse.email,
      password: 'yanlis-sifre-99',
    })
    await ayse.client.post(API_PATHS.changePassword, {
      currentPassword: GOOD_PASSWORD,
      newPassword: 'kayit-icin-yeni-sifre-8',
    })
    const ws = await createShared(admin)
    await addMember(admin, ayse, ws, 'viewer')
    await admin.client.patch(API_PATHS.member(ws, ayse.user.id), { role: 'editor' })
    await admin.client.patch(API_PATHS.adminUser(ayse.user.id), { disabled: true })

    const rows = t.ctx.audit.recent()
    const actions = rows.map((row) => row.action)
    for (const action of [
      'auth.register',
      'auth.login',
      'auth.login_failed',
      'auth.password_changed',
      'workspace.created',
      'invite.created',
      'member.added',
      'member.role_changed',
      'admin.user_updated',
    ]) {
      expect(actions, action).toContain(action)
    }
    for (const action of actions) expect(AUDIT_ACTIONS).toContain(action)
    const failed = rows.find((row) => row.action === 'auth.login_failed')
    expect(failed).toMatchObject({
      target_id: ayse.user.id,
      ip: '198.51.100.1',
      details: '{"reason":"wrong_password"}',
    })
    const roleChange = rows.find((row) => row.action === 'member.role_changed')
    expect(JSON.parse(roleChange?.details ?? '{}')).toEqual({ from: 'viewer', to: 'editor' })
    const dump = JSON.stringify(rows)
    for (const secret of [ayse.email, GOOD_PASSWORD, 'yanlis-sifre-99', 'kayit-icin-yeni-sifre-8'])
      expect(dump).not.toContain(secret)
  })
})
