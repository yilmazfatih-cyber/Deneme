/**
 * Ortak sözleşmenin uygunluk testleri (shared/testing/conformance.ts) bellek içi başvuru sunucusuna karşı.
 * Amaç: kopyanın bu temelde (Jest + vitest köprüsü) DEĞİŞTİRİLMEDEN çalıştığını kanıtlamak. Aynı senaryolar gerçek
 * API'ye karşı da koşabilir: test/integration/api.conformance.test.ts (MOBIL_API_URL verilince).
 */
import { defineSyncConformance, MemoryServer, type ConformanceBackend } from '@uygulama/shared/testing'

const PAGE_SIZE = 20

defineSyncConformance('bellek içi başvuru sunucusu (mobil kopya)', async (): Promise<ConformanceBackend> => {
  const server = new MemoryServer({ pageSize: PAGE_SIZE })
  return {
    pageSize: PAGE_SIZE,
    async createUser(name) {
      const { userId, personalWorkspaceId } = server.createUser(name)
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
})
