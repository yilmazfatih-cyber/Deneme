/**
 * ÖRNEK MODÜLÜN testi: yeni modül yazarken bu dosyayı kopyalayın. Her uç için üç tür test:
 * mutlu yol, yetki (oturumsuz / başkası), doğrulama hatası.
 */
import { API_PATHS, meResponseSchema, PROTOCOL_VERSION, type Mutation } from '@uygulama/shared'
import { afterEach, describe, expect, it } from 'vitest'
import { accountExportSchema } from '../../src/modules/account/service.ts'
import { GOOD_PASSWORD, signUp, TestClient, type SignedUpUser } from '../support/client.ts'
import { createTestServer, type TestServer } from '../support/harness.ts'
import { addMember, createShared } from '../support/workspaces.ts'

let t: TestServer
afterEach(async () => {
  await t.close()
})

const AT = '2026-11-16T10:00:00.000Z'

async function putTask(user: SignedUpUser, workspaceId: string, recordId: string, title: string): Promise<void> {
  const mutation: Mutation = { mid: 1, workspaceId, collection: 'tasks', recordId, at: AT, op: 'put', data: { title } }
  const reply = await user.client.post(API_PATHS.sync, {
    protocolVersion: PROTOCOL_VERSION,
    clientId: `c-${recordId}`,
    cursors: {},
    mutations: [mutation],
  })
  expect(reply.body.rejected).toEqual([])
}

const count = (sql: string, ...params: string[]) => t.db.get<{ total: number }>(sql, ...params)?.total

describe('hesap: adı güncelle', () => {
  it('adı günceller (boşlukları kırpar) ve kullanıcıyı döndürür', async () => {
    t = createTestServer()
    const ayse = await signUp(t, { name: 'Ayşe' })
    const reply = await ayse.client.patch(API_PATHS.account, { name: '  Ayşe Yılmaz ' })
    expect(reply.status).toBe(200)
    expect(meResponseSchema.parse(reply.body).user.name).toBe('Ayşe Yılmaz')
    expect(meResponseSchema.parse((await ayse.client.get(API_PATHS.me)).body).user.name).toBe('Ayşe Yılmaz')
  })

  it('oturumsuz 401, boş ad 400, JSON olmayan gövde 400', async () => {
    t = createTestServer()
    const ayse = await signUp(t)
    expect((await new TestClient(t).patch(API_PATHS.account, { name: 'X' })).status).toBe(401)
    const empty = await ayse.client.patch(API_PATHS.account, { name: '' })
    expect(empty.status).toBe(400)
    expect(empty.body.error.details).toEqual([{ path: 'name', message: 'Adınızı yazın.' }])
    const text = await ayse.client.send('PATCH', API_PATHS.account, 'name=X', { 'Content-Type': 'text/plain' })
    expect(text.status).toBe(400)
    expect(text.body.error.message).toBe('İstek gövdesi JSON olmalı (Content-Type: application/json).')
    const broken = await ayse.client.send('PATCH', API_PATHS.account, '{bozuk', { 'Content-Type': 'application/json' })
    expect(broken.body.error.message).toBe('İstek gövdesi okunamadı: geçerli bir JSON gönderin.')
  })
})

describe('hesap: verilerimi dışa aktar', () => {
  it('kullanıcıyı, üye olunan alanları ve kayıtlarını indirilebilir JSON olarak verir', async () => {
    t = createTestServer()
    const ayse = await signUp(t)
    const burak = await signUp(t)
    const ws = await createShared(burak, 'Ortak')
    await addMember(burak, ayse, ws, 'editor')
    await putTask(ayse, ayse.personalWorkspaceId, 'r1', 'Kişisel görev')
    await putTask(burak, ws, 'r2', 'Ortak görev')
    await putTask(burak, burak.personalWorkspaceId, 'r3', 'Burak’ın özel görevi')
    const reply = await ayse.client.get(API_PATHS.accountExport)
    expect(reply.status).toBe(200)
    expect(reply.headers.get('content-disposition')).toMatch(
      /^attachment; filename="hesap-verileri-\d{4}-\d{2}-\d{2}\.json"$/,
    )
    const data = accountExportSchema.parse(reply.body)
    expect(data.user.id).toBe(ayse.user.id)
    expect(data.workspaces.map((workspace) => workspace.id).toSorted()).toEqual(
      [ayse.personalWorkspaceId, ws].toSorted(),
    )
    expect(data.records.map((record) => record.id).toSorted()).toEqual(['r1', 'r2'])
    expect(JSON.stringify(data)).not.toContain(burak.email)
  })

  it('oturumsuz 401', async () => {
    t = createTestServer()
    expect((await new TestClient(t).get(API_PATHS.accountExport)).status).toBe(401)
  })
})

describe('hesap: sil', () => {
  it('yanlış şifreyle silinmez (invalid_credentials, alan ayrıntılı)', async () => {
    t = createTestServer()
    const ayse = await signUp(t)
    const reply = await ayse.client.delete(API_PATHS.account, { password: 'yanlis-sifre-1' })
    expect(reply.status).toBe(401)
    expect(reply.body.error).toMatchObject({ code: 'invalid_credentials', details: [{ path: 'password' }] })
    expect(count('SELECT count(*) AS total FROM users WHERE id = ?', ayse.user.id)).toBe(1)
  })

  it('kişisel alan ve kayıtları silinir; tek sahibi olunan alan EN ESKİ üyeye geçer; tek başına alan silinir', async () => {
    t = createTestServer()
    const ayse = await signUp(t)
    const burak = await signUp(t)
    const cem = await signUp(t)
    const team = await createShared(ayse, 'Ekip')
    await addMember(ayse, burak, team, 'viewer')
    t.clock.advance(1000)
    await addMember(ayse, cem, team, 'editor')
    const alone = await createShared(ayse, 'Yalnız')
    const joined = await createShared(cem, 'Cem’in alanı')
    await addMember(cem, ayse, joined, 'editor')
    await putTask(ayse, ayse.personalWorkspaceId, 'p1', 'Özel')
    await putTask(ayse, team, 't1', 'Ekip görevi')

    const reply = await ayse.client.delete(API_PATHS.account, { password: GOOD_PASSWORD })
    expect(reply.status).toBe(200)
    expect(reply.headers.getSetCookie()[0]).toMatch(/^sid=; Max-Age=0/)

    expect(count('SELECT count(*) AS total FROM users WHERE id = ?', ayse.user.id)).toBe(0)
    expect(count('SELECT count(*) AS total FROM workspaces WHERE id IN (?, ?)', ayse.personalWorkspaceId, alone)).toBe(
      0,
    )
    expect(count('SELECT count(*) AS total FROM records WHERE workspace_id = ?', ayse.personalWorkspaceId)).toBe(0)
    expect(count('SELECT count(*) AS total FROM sessions WHERE user_id = ?', ayse.user.id)).toBe(0)
    // Ekip alanı kayıtlarıyla yaşar; sahiplik en eski üyeye (izleyici de olsa Burak) geçti.
    expect(count('SELECT count(*) AS total FROM records WHERE workspace_id = ?', team)).toBe(1)
    const members = (await burak.client.get(API_PATHS.members(team))).body.members as { userId: string; role: string }[]
    expect(members.map((member) => [member.userId, member.role])).toEqual([
      [burak.user.id, 'owner'],
      [cem.user.id, 'editor'],
    ])
    // Cem'in alanı yaşar, Ayşe yalnız üyelikten çıkar.
    expect(count('SELECT count(*) AS total FROM members WHERE workspace_id = ?', joined)).toBe(1)
    expect((await ayse.client.get(API_PATHS.me)).status).toBe(401)
    expect((await new TestClient(t).post(API_PATHS.login, { email: ayse.email, password: GOOD_PASSWORD })).status).toBe(
      401,
    )
    expect(t.ctx.audit.recent().map((row) => row.action)).toEqual(
      expect.arrayContaining(['account.deleted', 'workspace.owner_transferred']),
    )
  })

  it('oturumsuz 401; şifresiz gövde 400', async () => {
    t = createTestServer()
    const ayse = await signUp(t)
    expect((await new TestClient(t).delete(API_PATHS.account, { password: GOOD_PASSWORD })).status).toBe(401)
    expect((await ayse.client.delete(API_PATHS.account, {})).status).toBe(400)
  })
})
