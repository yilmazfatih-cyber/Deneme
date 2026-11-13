/**
 * İSKELET — izleme verisi deposu (kaynaktan bağımsız olaylar ve izleyici × başlık özetleri).
 * "İzleme verisi + Mixpanel" ajanı dolduracak. Sözleşme: server/src/kernel/intelligence.ts (ViewingService).
 */
import { createHmac } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { deriveKey } from '../../kernel/config'
import type { ViewingService } from '../../kernel/intelligence'

export default async function viewingPlugin(app: FastifyInstance): Promise<void> {
  const key = deriveKey(app.config, 'viewer-id')
  const service: ViewingService = {
    append: (events) => ({ accepted: 0, duplicates: 0, rejected: events.length }),
    facts: () => [],
    factsOfViewer: () => [],
    titleTotals: () => new Map(),
    monthlyTitleHours: () => new Map(),
    viewerTraits: () => ({ device: null, country: null }),
    viewerIdOfProfile: (guid) =>
      `v_${createHmac('sha256', key).update(`profile:${guid}`).digest('base64url').slice(0, 16)}`,
    sources: () => [],
    activeSources: () => [],
    clear: () => {},
    revision: () => 0,
  }
  app.services.viewing = service
}
