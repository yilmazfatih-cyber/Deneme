/**
 * FTL ("Faster Than Light") ağ yoklaması — Netflix /api/ftl/probe karşılığı.
 * İstemci dört hedefi yarıştırır (resolver, anycast, IX, bulut); darbeler [0, 2000, 70000] ms.
 * Raporlanan sonuçlar cihaz başına en hızlıdan yavaşa CDN sıralaması olarak saklanır ve
 * istemci manifest isteğinde cdnHints göndermezse varsayılan sıralama olarak kullanılır.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { FTL_PROBE_BYTES, FTL_PULSE_DELAYS_MS, ROUTES } from '../../../../shared/constants'
import type { FtlProbeResponse, FtlReport } from '../../../../shared/playback'
import { ANYCAST_ALIAS } from '../oca/nodes'
import { planeOf, type Plane } from '../playback/plane'

export const FTL_TARGETS: readonly { name: string; cdnId: string }[] = [
  { name: 'resolver', cdnId: 'c101-ist001-ix' },
  { name: 'oc.anycast.proxy', cdnId: ANYCAST_ALIAS },
  { name: 'oc.ix.proxy', cdnId: 'c102-ist001-ix' },
  { name: 'cloud', cdnId: 'cloud-ist-origin' },
]

const zReport = z.object({
  iter: z.number().int().min(0),
  pulse: z.number().int().min(0),
  results: z
    .array(
      z.object({
        name: z.string().max(64),
        cdnId: z.string().max(64),
        ok: z.boolean(),
        ttfbMs: z.number().min(0),
        totalMs: z.number().min(0),
        bytes: z.number().min(0),
        kbps: z.number().min(0),
      }),
    )
    .max(16),
})

/** Sıralama anahtarı: cihaz kimliği (tvpvdid), yoksa IP. */
export function ftlKey(plane: Plane, req: FastifyRequest): string {
  const passport = plane.passportOf(req)
  return passport?.deviceId ? `d:${passport.deviceId}` : `ip:${req.ip}`
}

/** Rapordan CDN sıralaması: başarılı sonuçlar ilk bayt süresine göre; anycast gerçek düğüm değildir, atlanır. */
export function rankingFromReport(plane: Plane, report: FtlReport): string[] {
  const ok = report.results
    .filter((r) => r.ok && r.cdnId !== ANYCAST_ALIAS && plane.nodes.get(r.cdnId))
    .sort((a, b) => a.ttfbMs - b.ttfbMs || a.totalMs - b.totalMs)
  const ranking: string[] = []
  for (const r of ok) if (!ranking.includes(r.cdnId)) ranking.push(r.cdnId)
  return ranking
}

export default async function plugin(app: FastifyInstance): Promise<void> {
  const plane = planeOf(app)

  app.get(ROUTES.FTL_PROBE, async (req: FastifyRequest<{ Querystring: { device?: string; iter?: string; monotonic?: string } }>, reply) => {
    const device = (req.query.device ?? 'web').slice(0, 32)
    const body: FtlProbeResponse = {
      urls: FTL_TARGETS.map((t) => ({
        name: t.name,
        url: `${ROUTES.OCA_PREFIX}/${t.cdnId}/ftl/probe?data=${FTL_PROBE_BYTES}`,
        cdnId: t.cdnId,
      })),
      pulse_delays: [...FTL_PULSE_DELAYS_MS],
      pulses: FTL_PULSE_DELAYS_MS.length,
      ctx: { ip: req.ip, region: app.config.region, device },
      report: ROUTES.FTL_REPORT,
    }
    return reply.header('cache-control', 'no-store').send(body)
  })

  app.post(ROUTES.FTL_REPORT, async (req, reply) => {
    let input: unknown = req.body
    if (typeof input === 'string') {
      try {
        input = JSON.parse(input)
      } catch {
        input = null
      }
    }
    const parsed = zReport.safeParse(input)
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: { code: 'VALIDATION_FAILED', message: 'FTL raporu biçimi hatalı.', traceId: req.trace?.traceId } })
    }
    const ranking = rankingFromReport(plane, parsed.data)
    if (ranking.length > 0) plane.ftl.set(ftlKey(plane, req), ranking)
    return reply.header('cache-control', 'no-store').send({ accepted: true, ranking })
  })
}
