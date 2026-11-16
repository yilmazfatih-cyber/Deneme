/**
 * Uygunluk testlerinin bellek içi başvuru sunucusuna karşı koşusu.
 * Aynı senaryolar gerçek API'ye karşı da koşar: api/test/sync.conformance.test.ts
 */
import {
  defineSyncConformance,
  MemoryServer,
  type ConformanceBackend,
  type ConformanceUser,
} from '../src/testing/index.ts'

const PAGE_SIZE = 20

async function makeMemoryBackend(): Promise<ConformanceBackend> {
  const server = new MemoryServer({ pageSize: PAGE_SIZE })
  return {
    pageSize: PAGE_SIZE,
    async createUser(name): Promise<ConformanceUser> {
      const { userId, personalWorkspaceId } = server.createUser(name)
      // Gerçek ağ gibi davranması için istek JSON'a çevrilip geri okunur; hatalar söz (promise) reddi olur.
      return {
        userId,
        personalWorkspaceId,
        sync: async (request) => structuredClone(server.sync(userId, JSON.parse(JSON.stringify(request)))),
      }
    },
    async createWorkspace(owner, name) {
      return server.createWorkspace(owner.userId, name)
    },
    async setMember(workspaceId, user, role) {
      server.setMember(workspaceId, user.userId, role)
    },
  }
}

defineSyncConformance('bellek içi başvuru sunucusu', makeMemoryBackend)
