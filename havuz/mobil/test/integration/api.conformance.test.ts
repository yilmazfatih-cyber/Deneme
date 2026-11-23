/**
 * Ortak uygunluk senaryoları (shared/testing/conformance.ts) GERÇEK API'ye karşı, mobilin kendi ApiClient'ıyla
 * (belirteç kipi, HTTP). Varsayılan olarak ATLANIR; `MOBIL_API_URL=http://127.0.0.1:8310 npx jest test/integration`
 * ile açılır (npm run e2e:api bunu API'yi bir kopyadan başlatarak yapar).
 *
 * Kullanıcı = kayıt; alan = POST /api/workspaces; üyelik = davet + kabul / rol değiştir / üyeyi çıkar.
 * Kaynak: uygulama/api/test/sync.conformance.test.ts (orada sunucu içi test istemcisi kullanılır).
 * Gerçek ağ gerekir: jest-expo `fetch`i sahtesiyle değiştirir. Bu yüzden dosya düz Node ortamında koşar ve
 * `EXPO_PUBLIC_USE_RN_FETCH=1` ister (Expo'nun fetch'i kurulmaz, Node'un kendi fetch'i kalır; npm run e2e:api verir).
 *
 * @jest-environment node
 */
import {
  API_PATHS,
  membersResponseSchema,
  uuidv7,
  workspaceResponseSchema,
  workspacesResponseSchema,
  type WorkspaceRole,
} from '@uygulama/shared'
import { defineSyncConformance, type ConformanceBackend, type ConformanceUser } from '@uygulama/shared/testing'
import { z } from 'zod'
import { ApiClient } from '../../src/lib/api/client.ts'

const API_URL = process.env.MOBIL_API_URL
const PASSWORD = 'yesil-orman-yolu-17-deniz'
/** Gerçek API'nin alan başına sayfa boyutu (api/src/config.ts → syncPageSize). */
const PAGE_SIZE = 500

const inviteSchema = z.object({ invite: z.object({ token: z.string() }) })

async function makeApiBackend(baseUrl: string): Promise<ConformanceBackend> {
  const clients = new Map<string, ApiClient>()
  const owners = new Map<string, string>()
  const clientOf = (userId: string): ApiClient => {
    const client = clients.get(userId)
    if (!client) throw new Error(`Bilinmeyen kullanıcı: ${userId}`)
    return client
  }
  return {
    pageSize: PAGE_SIZE,
    async createUser(name): Promise<ConformanceUser> {
      let token: string | null = null
      const client = new ApiClient({ baseUrl, getToken: () => token, clientName: 'mobil/uygunluk', timeoutMs: 60_000 })
      const auth = await client.register({ email: `mobil-${uuidv7()}@ornek.com`, password: PASSWORD, name })
      token = auth.token ?? null
      const { workspaces } = await client.request('GET', API_PATHS.workspaces, { schema: workspacesResponseSchema })
      const personal = workspaces.find((workspace) => workspace.kind === 'personal')
      if (!personal || !token) throw new Error('Kayıt sonrası kişisel alan ya da belirteç yok.')
      clients.set(auth.user.id, client)
      return { userId: auth.user.id, personalWorkspaceId: personal.id, sync: (request) => client.sync(request) }
    },
    async createWorkspace(owner, name) {
      const { workspace } = await clientOf(owner.userId).request('POST', API_PATHS.workspaces, {
        body: { name },
        schema: workspaceResponseSchema,
      })
      owners.set(workspace.id, owner.userId)
      return workspace.id
    },
    async setMember(workspaceId, user, role: WorkspaceRole | null) {
      const ownerId = owners.get(workspaceId)
      if (!ownerId) throw new Error('Alanın sahibi bilinmiyor.')
      const owner = clientOf(ownerId)
      const { members } = await owner.request('GET', API_PATHS.members(workspaceId), { schema: membersResponseSchema })
      const isMember = members.some((member) => member.userId === user.userId)
      if (role === null) {
        if (isMember) await owner.request('DELETE', API_PATHS.member(workspaceId, user.userId))
        return
      }
      if (!isMember) {
        const { invite } = await owner.request('POST', API_PATHS.invites(workspaceId), {
          body: { role: role === 'viewer' ? 'viewer' : 'editor' },
          schema: inviteSchema,
        })
        await clientOf(user.userId).request('POST', API_PATHS.acceptInvite, { body: { token: invite.token } })
        if (role !== 'owner') return
      }
      await owner.request('PATCH', API_PATHS.member(workspaceId, user.userId), { body: { role } })
    },
  }
}

if (API_URL && process.env.EXPO_PUBLIC_USE_RN_FETCH !== '1') {
  throw new Error('MOBIL_API_URL ile birlikte EXPO_PUBLIC_USE_RN_FETCH=1 verin (ya da: npm run e2e:api).')
}

if (API_URL) {
  jest.setTimeout(120_000)
  defineSyncConformance(`gerçek API (${API_URL}), mobil ApiClient`, () => makeApiBackend(API_URL))
} else {
  describe('gerçek API uygunluğu', () => {
    it.skip('MOBIL_API_URL verilmedi: npm run e2e:api ile çalıştırın', () => {})
  })
}
