/**
 * Eşitleme uygunluk testleri GERÇEK API'ye karşı, HTTP üzerinden (shared/src/testing/conformance.ts).
 * Aynı senaryolar bellek içi başvuru sunucusuna karşı da koşar (shared/test/conformance.test.ts); ikisi de
 * geçiyorsa API protokole birebir uyuyor demektir.
 *
 * Bağdaştırıcı her şeyi gerçek uçlarla yapar: kullanıcı = kayıt (belirteç kipi), alan = POST /api/workspaces,
 * üyelik = davet oluştur + kabul et / rol değiştir / üyeyi çıkar. Yanıtlar syncResponseSchema ile de doğrulanır.
 */
import { API_PATHS, syncResponseSchema, type Member, type WorkspaceRole } from '@uygulama/shared'
import { defineSyncConformance, type ConformanceBackend, type ConformanceUser } from '@uygulama/shared/testing'
import { GOOD_PASSWORD, TestClient, toAppError, uniqueEmail } from './support/client.ts'
import { createTestServer } from './support/harness.ts'

const PAGE_SIZE = 20

async function makeHttpBackend(): Promise<ConformanceBackend> {
  const t = createTestServer({ config: { syncPageSize: PAGE_SIZE } })
  const clients = new Map<string, TestClient>()
  const owners = new Map<string, string>()

  const clientOf = (userId: string): TestClient => {
    const client = clients.get(userId)
    if (!client) throw new Error(`Bilinmeyen kullanıcı: ${userId}`)
    return client
  }

  const expectOk = async <T>(promise: Promise<{ status: number; body: T }>): Promise<T> => {
    const reply = await promise
    if (reply.status >= 300) throw toAppError(reply as never)
    return reply.body
  }

  return {
    pageSize: PAGE_SIZE,
    async createUser(name): Promise<ConformanceUser> {
      const client = new TestClient(t, { origin: null })
      const body = await expectOk(
        client.post(
          API_PATHS.register,
          { email: uniqueEmail('uyum'), password: GOOD_PASSWORD, name },
          { 'X-Auth-Mode': 'token' },
        ),
      )
      client.token = (body as { token: string }).token
      const userId = (body as { user: { id: string } }).user.id
      const { workspaces } = await expectOk(
        client.get<{ workspaces: { id: string; kind: string }[] }>(API_PATHS.workspaces),
      )
      const personal = workspaces.find((workspace) => workspace.kind === 'personal')
      if (!personal) throw new Error('Kişisel alan yok')
      clients.set(userId, client)
      return {
        userId,
        personalWorkspaceId: personal.id,
        sync: async (request) => {
          const reply = await client.post(API_PATHS.sync, request)
          if (reply.status !== 200) throw toAppError(reply)
          return syncResponseSchema.parse(reply.body)
        },
      }
    },
    async createWorkspace(owner, name) {
      const body = await expectOk(clientOf(owner.userId).post(API_PATHS.workspaces, { name }))
      const id = (body as { workspace: { id: string } }).workspace.id
      owners.set(id, owner.userId)
      return id
    },
    async setMember(workspaceId, user, role: WorkspaceRole | null) {
      const ownerId = owners.get(workspaceId)
      if (!ownerId) throw new Error('Alanın sahibi bilinmiyor')
      const owner = clientOf(ownerId)
      const { members } = await expectOk(owner.get<{ members: Member[] }>(API_PATHS.members(workspaceId)))
      const isMember = members.some((member) => member.userId === user.userId)
      if (role === null) {
        if (isMember) await expectOk(owner.delete(API_PATHS.member(workspaceId, user.userId)))
        return
      }
      if (!isMember) {
        const inviteRole = role === 'viewer' ? 'viewer' : 'editor'
        const created = await expectOk(owner.post(API_PATHS.invites(workspaceId), { role: inviteRole }))
        const token = (created as { invite: { token: string } }).invite.token
        await expectOk(clientOf(user.userId).post(API_PATHS.acceptInvite, { token }))
        if (inviteRole === role) return
      }
      await expectOk(owner.patch(API_PATHS.member(workspaceId, user.userId), { role }))
    },
    async close() {
      await t.close()
    },
  }
}

defineSyncConformance('gerçek API (HTTP)', makeHttpBackend)
