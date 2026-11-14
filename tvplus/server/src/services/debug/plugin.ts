/**
 * GET /api/debug/state — "Kaputun altı" paneli için sunucu durumu (DebugServerState).
 * Her parça ayrı korunur: henüz hazır olmayan bir servis hata yerine sıfır değerler döndürür.
 */
import type { FastifyInstance } from 'fastify'
import { ROUTES } from '../../../../shared/constants'
import type { DebugServerState } from '../../../../shared/types'

function guard<T>(fn: () => T, fallback: T): T {
  try {
    const v = fn()
    return v ?? fallback
  } catch {
    return fallback
  }
}

export default async function plugin(app: FastifyInstance): Promise<void> {
  const startedAt = Date.now()

  app.get(`${ROUTES.DEBUG_PREFIX}/state`, async (_req, reply): Promise<DebugServerState> => {
    reply.header('cache-control', 'no-store')
    const s = app.services
    return {
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
      region: app.config.region,
      oca: guard(() => s.oca.nodes(), []),
      events: guard(() => s.events.stats(), { total: 0, lastBatchAt: null, byName: {} }),
      playback: guard(() => s.playback.stats(), { activeSessions: 0, manifestsIssued: 0, prefetchIssued: 0 }),
      catalog: guard(() => s.catalog.stats(), { titles: 0, playables: 0, channels: 0, bySourceKind: {} }),
    }
  })
}
