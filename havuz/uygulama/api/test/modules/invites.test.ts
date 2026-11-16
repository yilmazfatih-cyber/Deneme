import { API_PATHS, invitePreviewSchema, inviteResponseSchema, workspaceResponseSchema } from '@uygulama/shared'
import { afterEach, describe, expect, it } from 'vitest'
import { signUp, TestClient } from '../support/client.ts'
import { createTestServer, type TestServer } from '../support/harness.ts'
import { addMember, createShared, invite } from '../support/workspaces.ts'

let t: TestServer
afterEach(async () => {
  await t.close()
})

describe('davetler', () => {
  it('sahip davet oluşturur: belirteç bir kez döner, veritabanında yalnız özeti durur; süre 7 gün', async () => {
    t = createTestServer()
    const ayse = await signUp(t, { name: 'Ayşe' })
    const ws = await createShared(ayse, 'Ev')
    const reply = await ayse.client.post(API_PATHS.invites(ws), { role: 'viewer' })
    expect(reply.status).toBe(201)
    const { invite: created } = inviteResponseSchema.parse(reply.body)
    expect(created.role).toBe('viewer')
    expect(created.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const stored = t.db.all<{ token_hash: string; expires_at: string }>('SELECT token_hash, expires_at FROM invites')
    expect(stored).toHaveLength(1)
    expect(stored[0]?.token_hash).not.toContain(created.token)
    expect(stored[0]?.token_hash).toMatch(/^[0-9a-f]{64}$/)
    const days = (Date.parse(created.expiresAt) - t.clock.now().getTime()) / 86_400_000
    expect(days).toBeGreaterThan(6.99)
    expect(days).toBeLessThanOrEqual(7)
  })

  it('önizleme oturumsuz çalışır ve alan adını, rolü, davet edeni gösterir', async () => {
    t = createTestServer()
    const ayse = await signUp(t, { name: 'Ayşe' })
    const ws = await createShared(ayse, 'Ev işleri')
    const token = await invite(ayse, ws, 'editor')
    const reply = await new TestClient(t).get(API_PATHS.invitePreview(token))
    expect(reply.status).toBe(200)
    expect(invitePreviewSchema.parse(reply.body)).toMatchObject({
      workspaceName: 'Ev işleri',
      role: 'editor',
      invitedBy: 'Ayşe',
    })
  })

  it('kabul eden üye olur; davet tek kullanımlıktır', async () => {
    t = createTestServer()
    const ayse = await signUp(t)
    const burak = await signUp(t)
    const cem = await signUp(t)
    const ws = await createShared(ayse)
    const token = await invite(ayse, ws, 'viewer')
    const accepted = await burak.client.post(API_PATHS.acceptInvite, { token })
    expect(accepted.status).toBe(200)
    expect(workspaceResponseSchema.parse(accepted.body).workspace).toMatchObject({
      id: ws,
      role: 'viewer',
      memberCount: 2,
    })
    const second = await cem.client.post(API_PATHS.acceptInvite, { token })
    expect(second.status).toBe(400)
    expect(second.body.error.code).toBe('invalid_token')
    expect((await new TestClient(t).get(API_PATHS.invitePreview(token))).body.error.code).toBe('invalid_token')
  })

  it('zaten üye olan kabul ederse rolü değişmez ve davet harcanmaz', async () => {
    t = createTestServer()
    const ayse = await signUp(t)
    const burak = await signUp(t)
    const ws = await createShared(ayse)
    const token = await invite(ayse, ws, 'viewer')
    const own = await ayse.client.post(API_PATHS.acceptInvite, { token })
    expect(workspaceResponseSchema.parse(own.body).workspace.role).toBe('owner')
    expect((await burak.client.post(API_PATHS.acceptInvite, { token })).status).toBe(200)
  })

  it('süresi dolan, uydurma ya da bozuk belirteç invalid_token alır', async () => {
    t = createTestServer()
    const ayse = await signUp(t)
    const burak = await signUp(t)
    const ws = await createShared(ayse)
    const token = await invite(ayse, ws)
    t.clock.advanceDays(8)
    expect((await burak.client.post(API_PATHS.acceptInvite, { token })).body.error.code).toBe('invalid_token')
    expect((await new TestClient(t).get(API_PATHS.invitePreview('x'.repeat(43)))).body.error.code).toBe('invalid_token')
    expect((await new TestClient(t).get(API_PATHS.invitePreview('kisa'))).body.error.code).toBe('invalid_token')
  })

  it('daveti oluşturan artık sahip değilse davet geçersizdir (çıkarılan eski sahip geri dönemez, yetki büyütemez)', async () => {
    t = createTestServer()
    const ayse = await signUp(t)
    const burak = await signUp(t)
    const cem = await signUp(t)
    const ws = await createShared(ayse)
    await addMember(ayse, burak, ws, 'editor')
    expect((await ayse.client.patch(API_PATHS.member(ws, burak.user.id), { role: 'owner' })).status).toBe(200)
    const kept = await invite(burak, ws, 'editor') // Burak sahipken bir davet oluşturup saklar
    const kept2 = await invite(burak, ws, 'editor')
    const fromAyse = await invite(ayse, ws, 'viewer')

    // 1) Ayşe Burak'ı alandan çıkarır: Burak eski davetiyle geri dönememeli.
    expect((await ayse.client.delete(API_PATHS.member(ws, burak.user.id))).status).toBe(200)
    const back = await burak.client.post(API_PATHS.acceptInvite, { token: kept })
    expect(back.status).toBe(400)
    expect(back.body.error.code).toBe('invalid_token')
    expect((await new TestClient(t).get(API_PATHS.invitePreview(kept))).body.error.code).toBe('invalid_token')
    const members = await ayse.client.get(API_PATHS.members(ws))
    expect(members.body.members.map((member: { userId: string }) => member.userId)).toEqual([ayse.user.id])

    // 2) Hâlâ sahip olan Ayşe'nin daveti çalışmaya devam eder.
    expect((await cem.client.post(API_PATHS.acceptInvite, { token: fromAyse })).status).toBe(200)

    // 3) Sahiplikten düşürülüp izleyici yapılan biri ayrılıp eski "düzenleyen" davetiyle yetkisini büyütemez.
    await addMember(ayse, burak, ws, 'editor')
    expect((await ayse.client.patch(API_PATHS.member(ws, burak.user.id), { role: 'owner' })).status).toBe(200)
    const third = await invite(burak, ws, 'editor')
    expect((await ayse.client.patch(API_PATHS.member(ws, burak.user.id), { role: 'viewer' })).status).toBe(200)
    expect((await burak.client.delete(API_PATHS.member(ws, burak.user.id))).status).toBe(200) // ayrılır
    const escalate = await burak.client.post(API_PATHS.acceptInvite, { token: third })
    expect(escalate.body.error.code).toBe('invalid_token')
    expect((await burak.client.post(API_PATHS.acceptInvite, { token: kept2 })).body.error.code).toBe('invalid_token')
  })

  it('yetki: yalnız sahip davet eder; kişisel alana davet yok; davetle sahip verilmez; kabul oturum ister', async () => {
    t = createTestServer()
    const ayse = await signUp(t)
    const burak = await signUp(t)
    const deniz = await signUp(t)
    const ws = await createShared(ayse)
    await addMember(ayse, burak, ws, 'editor')
    expect((await burak.client.post(API_PATHS.invites(ws), { role: 'viewer' })).status).toBe(403)
    expect((await deniz.client.post(API_PATHS.invites(ws), { role: 'viewer' })).status).toBe(404)
    const personal = await ayse.client.post(API_PATHS.invites(ayse.personalWorkspaceId), { role: 'editor' })
    expect(personal.status).toBe(403)
    expect(personal.body.error.message).toBe('Kişisel alan paylaşılamaz. Paylaşmak için yeni bir ortak alan açın.')
    expect((await ayse.client.post(API_PATHS.invites(ws), { role: 'owner' })).status).toBe(400)
    const token = await invite(ayse, ws)
    expect((await new TestClient(t).post(API_PATHS.acceptInvite, { token })).status).toBe(401)
    const missing = await burak.client.post(API_PATHS.acceptInvite, {})
    expect(missing.status).toBe(400)
    expect(missing.body.error.code).toBe('validation')
    expect((await ayse.client.post(API_PATHS.invites(ws), {})).status).toBe(400)
  })
})
