/**
 * İSKELET — zevk toplulukları (izleyicileri izleme davranışına göre kümeler).
 * "Zevk toplulukları + içgörüler" ajanı dolduracak. Sözleşme: server/src/kernel/intelligence.ts (AudienceService).
 */
import type { FastifyInstance } from 'fastify'
import { httpError } from '../../gateway/errors'
import type { AudienceService } from '../../kernel/intelligence'

export default async function audiencePlugin(app: FastifyInstance): Promise<void> {
  const service: AudienceService = {
    run: () => null,
    communities: () => [],
    get: () => null,
    ofViewer: () => null,
    ofProfile: () => null,
    topTitles: () => [],
    recompute: () => {
      throw httpError(503, 'NOT_READY', 'Zevk toplulukları henüz hazır değil.')
    },
  }
  app.services.audience = service
}
