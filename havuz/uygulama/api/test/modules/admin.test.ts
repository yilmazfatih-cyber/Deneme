import {
  API_PATHS,
  adminMetricsResponseSchema,
  adminUserResponseSchema,
  adminUsersResponseSchema,
} from '@uygulama/shared'
import { afterEach, describe, expect, it } from 'vitest'
import { GOOD_PASSWORD, signUp, TestClient } from '../support/client.ts'
import { createTestServer, type TestServer } from '../support/harness.ts'

let t: TestServer
afterEach(async () => {
  await t.close()
})

async function withAdmin() {
  t = createTestServer({ env: { ADMIN_EMAILS: 'yonetici@ornek.com' } })
  const admin = await signUp(t, { email: 'yonetici@ornek.com', name: 'Yönetici' })
  expect(admin.user.role).toBe('admin')
  return admin
}

describe('yönetim: kullanıcı listesi', () => {
  it('yeniden eskiye sıralı, imleçle sayfalanır; yinelenme ve atlama yok', async () => {
    const admin = await withAdmin()
    const ids = [admin.user.id]
    for (let index = 0; index < 4; index++) ids.push((await signUp(t, { name: `Kişi ${index}` })).user.id)
    const seen: string[] = []
    let cursor: string | null = null
    for (let round = 0; round < 5; round++) {
      const query: string = cursor ? `?limit=2&cursor=${cursor}` : '?limit=2'
      const page = adminUsersResponseSchema.parse((await admin.client.get(`${API_PATHS.adminUsers}${query}`)).body)
      seen.push(...page.users.map((user) => user.id))
      cursor = page.nextCursor
      if (!cursor) break
    }
    expect(seen).toEqual(ids.toReversed())
  })

  it('arama Türkçe harf ve büyük/küçük harf duyarsızdır; ad ve e-postada arar', async () => {
    const admin = await withAdmin()
    await signUp(t, { name: 'Işık Çağlar' })
    await signUp(t, { name: 'Şule Öztürk', email: 'sule@ornek.com' })
    const search = async (q: string) =>
      adminUsersResponseSchema
        .parse((await admin.client.get(`${API_PATHS.adminUsers}?q=${encodeURIComponent(q)}`)).body)
        .users.map((user) => user.name)
    expect(await search('IŞIK')).toEqual(['Işık Çağlar'])
    expect(await search('isik cag')).toEqual(['Işık Çağlar'])
    expect(await search('ÖZTÜRK')).toEqual(['Şule Öztürk'])
    expect(await search('SULE@')).toEqual(['Şule Öztürk'])
    expect(await search('%')).toEqual([])
    const tooLong = await admin.client.get(`${API_PATHS.adminUsers}?q=${'a'.repeat(101)}`)
    expect(tooLong.status).toBe(400)
  })

  it('yönetici olmayan 403, oturumsuz 401 alır', async () => {
    await withAdmin()
    const ayse = await signUp(t)
    expect((await ayse.client.get(API_PATHS.adminUsers)).status).toBe(403)
    expect((await new TestClient(t).get(API_PATHS.adminUsers)).status).toBe(401)
    expect((await ayse.client.patch(API_PATHS.adminUser(ayse.user.id), { role: 'admin' })).status).toBe(403)
  })
})

describe('yönetim: kullanıcı güncelle', () => {
  it('hesabı kapatınca oturumları düşer, girişte account_disabled alır; açınca girebilir', async () => {
    const admin = await withAdmin()
    const ayse = await signUp(t)
    const reply = await admin.client.patch(API_PATHS.adminUser(ayse.user.id), { disabled: true })
    expect(reply.status).toBe(200)
    expect(adminUserResponseSchema.parse(reply.body).user).toMatchObject({ disabled: true, role: 'user' })
    expect((await ayse.client.get(API_PATHS.me)).status).toBe(401)
    const login = await new TestClient(t).post(API_PATHS.login, { email: ayse.email, password: GOOD_PASSWORD })
    expect(login.status).toBe(403)
    expect(login.body.error.code).toBe('account_disabled')
    const wrong = await new TestClient(t).post(API_PATHS.login, { email: ayse.email, password: 'yanlis-sifre-77' })
    expect(wrong.body.error.code).toBe('invalid_credentials')
    await admin.client.patch(API_PATHS.adminUser(ayse.user.id), { disabled: false })
    expect((await new TestClient(t).post(API_PATHS.login, { email: ayse.email, password: GOOD_PASSWORD })).status).toBe(
      200,
    )
    expect(t.ctx.audit.recent().filter((row) => row.action === 'admin.user_updated')).toHaveLength(2)
  })

  it('rol verir ve alır; yeni yönetici yönetim uçlarını kullanabilir', async () => {
    const admin = await withAdmin()
    const ayse = await signUp(t)
    await admin.client.patch(API_PATHS.adminUser(ayse.user.id), { role: 'admin' })
    expect((await ayse.client.get(API_PATHS.adminUsers)).status).toBe(200)
    await admin.client.patch(API_PATHS.adminUser(ayse.user.id), { role: 'user' })
    expect((await ayse.client.get(API_PATHS.adminUsers)).status).toBe(403)
  })

  it('kendini kilitleyemez: kendi rolünü değiştiremez, kendini kapatamaz', async () => {
    const admin = await withAdmin()
    for (const body of [{ role: 'user' }, { disabled: true }]) {
      const reply = await admin.client.patch(API_PATHS.adminUser(admin.user.id), body)
      expect(reply.status).toBe(403)
      expect(reply.body.error.message).toBe('Kendi hesabınızın rolünü değiştiremez ya da onu kapatamazsınız.')
    }
  })

  it('boş gövde 400, bilinmeyen kullanıcı 404', async () => {
    const admin = await withAdmin()
    const empty = await admin.client.patch(API_PATHS.adminUser('baska-biri'), {})
    expect(empty.status).toBe(400)
    expect(empty.body.error.message).toBe('En az bir alan verin.')
    expect((await admin.client.patch(API_PATHS.adminUser('olmayan-kisi'), { disabled: true })).status).toBe(404)
  })
})

describe('yönetim: ölçümler', () => {
  it('sayımları, çalışma süresini ve açık bağlantıları verir; yalnız yönetici', async () => {
    const admin = await withAdmin()
    const ayse = await signUp(t)
    await admin.client.patch(API_PATHS.adminUser(ayse.user.id), { disabled: true })
    t.clock.advance(90_000)
    const reply = await admin.client.get(API_PATHS.adminMetrics)
    expect(reply.status).toBe(200)
    const body = adminMetricsResponseSchema.parse(reply.body)
    expect(body).toMatchObject({
      users: 2,
      disabledUsers: 1,
      workspaces: 2,
      records: 0,
      activeSessions: 1,
      liveConnections: 0,
    })
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(90)
    expect(body.databaseBytes).toBeGreaterThan(0)
    expect((await new TestClient(t).get(API_PATHS.adminMetrics)).status).toBe(401)
    const other = await signUp(t)
    expect((await other.client.get(API_PATHS.adminMetrics)).status).toBe(403)
  })
})
