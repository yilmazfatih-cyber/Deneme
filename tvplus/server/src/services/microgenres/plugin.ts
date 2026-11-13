/**
 * İSKELET — mikro tür üreteci (etiketleri birleştirip dar kategoriler kurar). "Etiketleme + mikro türler" ajanı dolduracak.
 * Sözleşme: server/src/kernel/intelligence.ts (MicrogenreService), shared/intelligence.ts.
 */
import type { FastifyInstance } from 'fastify'
import type { MicrogenreService } from '../../kernel/intelligence'

export default async function microgenresPlugin(app: FastifyInstance): Promise<void> {
  const service: MicrogenreService = {
    all: () => [],
    get: () => null,
    ofTitle: () => [],
    similarTitles: () => [],
    stats: () => ({
      rubricVersion: '0000.00-0',
      generatedAt: new Date(0).toISOString(),
      total: 0,
      visible: 0,
      hidden: 0,
      bySpecificity: {},
      coveredTitles: 0,
      possibleDefinitions: 0,
    }),
    revision: () => 0,
  }
  app.services.microgenres = service
}
