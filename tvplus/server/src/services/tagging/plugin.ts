/**
 * İSKELET — etiketleme servisi (kılavuz sözlüğü, etiket fişleri, uzlaşı). "Etiketleme + mikro türler" ajanı dolduracak.
 * Sözleşme: server/src/kernel/intelligence.ts (TaggingService), shared/intelligence.ts, shared/tagging-schema.ts.
 */
import type { FastifyInstance } from 'fastify'
import type { TaggingService } from '../../kernel/intelligence'

const EMPTY_VERSION = '0000.00-0'

export default async function taggingPlugin(app: FastifyInstance): Promise<void> {
  const service: TaggingService = {
    vocabulary: () => ({
      version: EMPTY_VERSION,
      scales: [],
      facets: [],
      naming: { genreNouns: {}, regions: [], eras: [], order: ['ADJECTIVE'] },
    }),
    effective: (titleId) => ({
      titleId,
      rubricVersion: EMPTY_VERSION,
      basis: 'NONE',
      sheetCount: 0,
      agreement: null,
      scales: {},
      facets: {},
      descriptors: [],
    }),
    sheets: () => [],
    revision: () => 0,
  }
  app.services.tagging = service
}
