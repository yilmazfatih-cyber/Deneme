import {
  API_PATHS,
  membersResponseSchema,
  memberResponseSchema,
  workspaceResponseSchema,
  workspacesResponseSchema,
} from '@uygulama/shared'
import { afterEach, describe, expect, it } from 'vitest'
import { signUp, TestClient } from '../support/client.ts'
import { createTestServer, type TestServer } from '../support/harness.ts'
import { addMember, createShared } from '../support/workspaces.ts'

let t: TestServer
afterEach(async () => {
  await t.close()
})

describe('alanları listele / oluştur / adlandır / sil', () => {
  it('sahip alan açar, adlandırır, siler; liste şemaya uyar', async () => {
    t = createTestServer()
    const ayse = await signUp(t, { name: 'Ayşe' })
    const created = await ayse.client.post(API_PATHS.workspaces, { name: '  Tatil planı ' })
    expect(created.status).toBe(201)
    const { workspace } = workspaceResponseSchema.parse(created.body)
    expect(workspace).toMatchObject({ name: 'Tatil planı', kind: 'shared', role: 'owner', rev: 0, memberCount: 1 })

    const renamed = await ayse.client.patch(API_PATHS.workspace(workspace.id), { name: 'Yaz tatili' })
    expect(workspaceResponseSchema.parse(renamed.body).workspace.name).toBe('Yaz tatili')

    const list = workspacesResponseSchema.parse((await ayse.client.get(API_PATHS.workspaces)).body)
    expect(list.workspaces.map((item) => item.kind)).toEqual(['personal', 'shared'])

    expect((await ayse.client.delete(API_PATHS.workspace(workspace.id))).body).toEqual({ ok: true })
    const after = workspacesResponseSchema.parse((await ayse.client.get(API_PATHS.workspaces)).body)
    expect(after.workspaces).toHaveLength(1)
  })

  it('boş ad doğrulama hatası verir; oturumsuz istek 401 alır', async () => {
    t = createTestServer()
    const ayse = await signUp(t)
    const empty = await ayse.client.post(API_PATHS.workspaces, { name: '   ' })
    expect(empty.status).toBe(400)
    expect(empty.body.error.message).toBe('Alana bir ad verin.')
    expect((await new TestClient(t).get(API_PATHS.workspaces)).status).toBe(401)
    expect((await new TestClient(t).post(API_PATHS.workspaces, { name: 'X' })).status).toBe(401)
  })

  it('kişisel alan silinemez ama adı değiştirilebilir', async () => {
    t = createTestServer()
    const ayse = await signUp(t)
    const removal = await ayse.client.delete(API_PATHS.workspace(ayse.personalWorkspaceId))
    expect(removal.status).toBe(403)
    expect(removal.body.error.message).toBe('Kişisel alan silinemez.')
    const rename = await ayse.client.patch(API_PATHS.workspace(ayse.personalWorkspaceId), { name: 'Benim' })
    expect(rename.status).toBe(200)
  })

  it('düzenleyen ve izleyici alanı adlandıramaz ve silemez (403); üye olmayan 404 alır', async () => {
    t = createTestServer()
    const ayse = await signUp(t)
    const burak = await signUp(t)
    const cem = await signUp(t)
    const deniz = await signUp(t)
    const ws = await createShared(ayse)
    await addMember(ayse, burak, ws, 'editor')
    await addMember(ayse, cem, ws, 'viewer')
    for (const who of [burak, cem]) {
      expect((await who.client.patch(API_PATHS.workspace(ws), { name: 'Benim' })).status).toBe(403)
      expect((await who.client.delete(API_PATHS.workspace(ws))).status).toBe(403)
    }
    for (const response of [
      await deniz.client.patch(API_PATHS.workspace(ws), { name: 'Ele geçir' }),
      await deniz.client.delete(API_PATHS.workspace(ws)),
      await deniz.client.get(API_PATHS.members(ws)),
    ]) {
      expect(response.status).toBe(404)
      expect(response.body.error.message).toBe('Alan bulunamadı ya da artık üyesi değilsiniz.')
    }
  })

  it('alan silinince kayıtları ve üyelikleri de gider', async () => {
    t = createTestServer()
    const ayse = await signUp(t)
    const burak = await signUp(t)
    const ws = await createShared(ayse)
    await addMember(ayse, burak, ws)
    await ayse.client.post(API_PATHS.sync, {
      protocolVersion: 1,
      clientId: 'c1',
      cursors: {},
      mutations: [
        {
          mid: 1,
          workspaceId: ws,
          collection: 'tasks',
          recordId: 'r1',
          at: '2026-11-16T10:00:00.000Z',
          op: 'put',
          data: { title: 'A' },
        },
      ],
    })
    expect((await ayse.client.delete(API_PATHS.workspace(ws))).status).toBe(200)
    expect(t.db.get<{ total: number }>('SELECT count(*) AS total FROM records WHERE workspace_id = ?', ws)?.total).toBe(
      0,
    )
    expect(t.db.get<{ total: number }>('SELECT count(*) AS total FROM members WHERE workspace_id = ?', ws)?.total).toBe(
      0,
    )
    const burakList = workspacesResponseSchema.parse((await burak.client.get(API_PATHS.workspaces)).body)
    expect(burakList.workspaces.some((item) => item.id === ws)).toBe(false)
  })

  it('geçersiz kimlik 400 alır; yeniden adlandırmada boş/çok uzun ad 400', async () => {
    t = createTestServer()
    const ayse = await signUp(t)
    expect((await ayse.client.get('/api/workspaces/k%C3%B6t%C3%BC%20kimlik/members')).status).toBe(400)
    const ws = await createShared(ayse)
    expect((await ayse.client.patch(API_PATHS.workspace(ws), { name: '' })).status).toBe(400)
    const long = await ayse.client.patch(API_PATHS.workspace(ws), { name: 'x'.repeat(81) })
    expect(long.body.error.message).toBe('Ad en çok 80 karakter olabilir.')
  })
})

describe('üyeler', () => {
  it('her üye listeyi görür; sahip rol değiştirir; düzenleyen değiştiremez', async () => {
    t = createTestServer()
    const ayse = await signUp(t, { name: 'Ayşe' })
    const burak = await signUp(t, { name: 'Burak' })
    const cem = await signUp(t, { name: 'Cem' })
    const ws = await createShared(ayse)
    await addMember(ayse, burak, ws, 'editor')
    await addMember(ayse, cem, ws, 'viewer')

    const list = membersResponseSchema.parse((await cem.client.get(API_PATHS.members(ws))).body)
    expect(list.members.map((member) => [member.name, member.role])).toEqual([
      ['Ayşe', 'owner'],
      ['Burak', 'editor'],
      ['Cem', 'viewer'],
    ])

    const changed = await ayse.client.patch(API_PATHS.member(ws, cem.user.id), { role: 'editor' })
    expect(memberResponseSchema.parse(changed.body).member.role).toBe('editor')
    expect((await burak.client.patch(API_PATHS.member(ws, cem.user.id), { role: 'viewer' })).status).toBe(403)
    expect((await ayse.client.patch(API_PATHS.member(ws, cem.user.id), { role: 'yonetici' })).status).toBe(400)
    expect((await ayse.client.patch(API_PATHS.member(ws, 'olmayan-kisi'), { role: 'viewer' })).status).toBe(404)
  })

  it('son sahip düşürülemez; başka sahip varsa kendini düşürebilir', async () => {
    t = createTestServer()
    const ayse = await signUp(t)
    const burak = await signUp(t)
    const ws = await createShared(ayse)
    await addMember(ayse, burak, ws)
    const demoteSelf = await ayse.client.patch(API_PATHS.member(ws, ayse.user.id), { role: 'editor' })
    expect(demoteSelf.status).toBe(403)
    expect(demoteSelf.body.error.message).toBe('Alanın en az bir sahibi kalmalı. Önce başka bir üyeyi sahip yapın.')
    expect((await ayse.client.patch(API_PATHS.member(ws, burak.user.id), { role: 'owner' })).status).toBe(200)
    expect((await ayse.client.patch(API_PATHS.member(ws, ayse.user.id), { role: 'viewer' })).status).toBe(200)
    // Artık Ayşe izleyici: rol değiştiremez.
    expect((await ayse.client.patch(API_PATHS.member(ws, burak.user.id), { role: 'editor' })).status).toBe(403)
  })

  it('sahip üye çıkarır; düzenleyen başkasını çıkaramaz ama kendisi ayrılabilir; son sahip ayrılamaz', async () => {
    t = createTestServer()
    const ayse = await signUp(t)
    const burak = await signUp(t)
    const cem = await signUp(t)
    const ws = await createShared(ayse)
    await addMember(ayse, burak, ws)
    await addMember(ayse, cem, ws)
    expect((await burak.client.delete(API_PATHS.member(ws, cem.user.id))).status).toBe(403)
    expect((await burak.client.delete(API_PATHS.member(ws, burak.user.id))).status).toBe(200)
    expect((await burak.client.get(API_PATHS.members(ws))).status).toBe(404)
    expect((await ayse.client.delete(API_PATHS.member(ws, cem.user.id))).status).toBe(200)
    const leave = await ayse.client.delete(API_PATHS.member(ws, ayse.user.id))
    expect(leave.status).toBe(403)
    const personal = await ayse.client.delete(API_PATHS.member(ayse.personalWorkspaceId, ayse.user.id))
    expect(personal.status).toBe(403)
    expect(personal.body.error.message).toBe('Kişisel alandan ayrılamazsınız.')
    expect(t.ctx.audit.recent().filter((row) => row.action === 'member.removed')).toHaveLength(2)
  })
})
