/**
 * Deney (A/B) ve özellik bayrağı servisi + stüdyo uçları (sözleşme: shared/experiments.ts).
 *   GET  /api/studio/experiments               → ExperimentsResponse
 *   POST /api/studio/experiments/:key/status   gövde { status } → ExperimentState (çakışan RUNNING → 409)
 *   PUT  /api/studio/experiments/pins          gövde { unitId, experiment, variant | null } → 204
 * Okuma erişimi app.ts'teki stüdyo kancasında denetlenir; yazma uçları ayrıca assertStudioWrite çağırır.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ROUTES } from '../../../../shared/constants'
import {
  DEFAULT_FLAGS,
  EXPERIMENT_STATUSES,
  FLAG_KEYS,
  FLAGS,
  type ExperimentState,
  type ExperimentsResponse,
} from '../../../../shared/experiments'
import { httpError } from '../../gateway/errors'
import { assertStudioWrite } from '../../kernel/intelligence'
import { createExperimentsService } from './service'

const zStatusBody = z.object({ status: z.enum(EXPERIMENT_STATUSES) }).strict()
const zPinBody = z
  .object({
    unitId: z.string().min(1).max(128),
    experiment: z.string().min(1).max(64),
    variant: z.string().min(1).max(64).nullable(),
  })
  .strict()

export default async function plugin(app: FastifyInstance): Promise<void> {
  const service = createExperimentsService({
    config: app.config,
    events: () => app.services.events,
    warn: (obj, msg) => app.log.warn(obj, msg),
  })
  app.services.experiments = service

  const base = `${ROUTES.STUDIO}/experiments`

  app.get(base, async (): Promise<ExperimentsResponse> => ({
    flags: FLAG_KEYS.map((key) => ({
      key,
      values: FLAGS[key].values,
      side: FLAGS[key].side,
      defaultValue: DEFAULT_FLAGS[key],
    })),
    experiments: service.state(),
  }))

  app.post(`${base}/:key/status`, async (req): Promise<ExperimentState> => {
    assertStudioWrite(req, app.config)
    const { key } = req.params as { key: string }
    const body = zStatusBody.safeParse(req.body ?? {})
    if (!body.success)
      throw httpError(400, 'VALIDATION_FAILED', `Durum geçersiz; beklenen: ${EXPERIMENT_STATUSES.join(' | ')}.`)
    if (!service.definitions().some((e) => e.key === key)) throw httpError(404, 'NOT_FOUND', 'Deney bulunamadı.')
    const r = service.setStatus(key, body.data.status)
    if (!r.ok) throw httpError(409, 'CONFLICT', r.error)
    return r.state
  })

  app.put(`${base}/pins`, async (req, reply) => {
    assertStudioWrite(req, app.config)
    const body = zPinBody.safeParse(req.body ?? {})
    if (!body.success)
      throw httpError(400, 'VALIDATION_FAILED', 'Gövde geçersiz: { unitId, experiment, variant | null } bekleniyor.')
    const { unitId, experiment, variant } = body.data
    const e = service.definitions().find((x) => x.key === experiment)
    if (!e) throw httpError(404, 'NOT_FOUND', 'Deney bulunamadı.')
    if (variant !== null && !e.variants.some((v) => v.key === variant))
      throw httpError(400, 'VALIDATION_FAILED', `Bu deneyde '${variant}' kolu yok.`)
    service.setPin(unitId, experiment, variant)
    return reply.code(204).send()
  })
}
