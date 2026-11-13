/**
 * İSKELET — gömme servisi (çekim düzeyi vektörler; etiketler ve özet her çekime genel bağlam olarak eklenir).
 * "Gömme" ajanı dolduracak. Sözleşme: server/src/kernel/intelligence.ts (EmbeddingService).
 */
import type { FastifyInstance } from 'fastify'
import type { EmbeddingService } from '../../kernel/intelligence'

export default async function embeddingsPlugin(app: FastifyInstance): Promise<void> {
  const service: EmbeddingService = {
    info: () => ({
      provider: app.config.embedding.provider,
      modelVersion: 'yok',
      dims: 0,
      titles: 0,
      shots: 0,
      modalities: [],
      builtAt: null,
      sceneDetected: 0,
    }),
    ready: () => false,
    titleVector: () => null,
    similarTitles: () => [],
    revision: () => 0,
  }
  app.services.embeddings = service
}
