/**
 * İSKELET — içgörüler ve planlayıcı (katalog payı, izlenme payı, verim, zaman çizelgesi, içerik karması önerisi).
 * "Zevk toplulukları + içgörüler" ajanı dolduracak. Sözleşme: server/src/kernel/intelligence.ts (InsightsService).
 */
import type { FastifyInstance } from 'fastify'
import { httpError } from '../../gateway/errors'
import type { InsightsService } from '../../kernel/intelligence'

export default async function insightsPlugin(app: FastifyInstance): Promise<void> {
  const notReady = () => httpError(503, 'NOT_READY', 'İçgörüler henüz hazır değil.')
  const service: InsightsService = {
    mix: () => {
      throw notReady()
    },
    timeline: () => {
      throw notReady()
    },
    plan: () => {
      throw notReady()
    },
  }
  app.services.insights = service
}
