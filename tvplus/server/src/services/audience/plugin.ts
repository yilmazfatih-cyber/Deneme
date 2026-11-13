/**
 * Zevk toplulukları — izleyicileri yaşa ya da cinsiyete göre değil, NE İZLEDİKLERİNE göre kümeler (docs/ICERIK_ZEKASI.md §6).
 * Sözleşme: server/src/kernel/intelligence.ts (AudienceService), shared/intelligence.ts.
 *
 *   GET  /api/studio/communities             → CommunitiesResponse
 *   GET  /api/studio/communities/:id         → TasteCommunity
 *   POST /api/studio/communities/recompute   gövde: { k?, seed? } → ClusteringRun   (yazma: assertStudioWrite)
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ROUTES } from '../../../../shared/constants'
import type { CommunitiesResponse, TasteCommunity } from '../../../../shared/intelligence'
import { httpError } from '../../gateway/errors'
import { assertStudioWrite } from '../../kernel/intelligence'
import { createAudienceService, type AudienceImpl, type AudienceTuning, type ClusteringRunInfo } from './service'

const implByApp = new WeakMap<FastifyInstance, AudienceImpl>()
/** Testler ve içgörüler için: arka plan hesabını bekleme gibi sözleşme dışı yöntemler. */
export function audienceInternals(app: FastifyInstance): AudienceImpl {
  const impl = implByApp.get(app)
  if (!impl) throw new Error('Zevk toplulukları eklentisi bu uygulamada kurulmamış')
  return impl
}

/** Hiç çalıştırma yokken yalnız çok küçük veri eşzamanlı hesaplanır; gerisi arka planda (olay döngüsü kilitlenmez). */
export const DEFAULT_TUNING: AudienceTuning = { syncFactLimit: 5_000, sliceMs: 15 }

const zRecompute = z
  .object({
    k: z.number().int().min(1).max(2000).optional(),
    seed: z.number().int().min(0).max(4294967295).optional(),
  })
  .strict()

const COMMUNITY_ID_RE = /^tc_\d{2,4}$/

export default async function audiencePlugin(app: FastifyInstance): Promise<void> {
  const impl = createAudienceService(app, DEFAULT_TUNING)
  implByApp.set(app, impl)
  app.services.audience = impl

  // İlk hesap arka planda sürüyorsa stüdyo isteği onu bekler (await: olay döngüsü serbest kalır);
  // önceki bir çalıştırma varsa beklemeden o sunulur.
  const firstRun = async () => {
    if (impl.run() === null && impl.busy()) await impl.idle()
  }

  app.get(`${ROUTES.STUDIO}/communities`, async (): Promise<CommunitiesResponse> => {
    await firstRun()
    return { run: impl.run(), items: impl.communities() }
  })

  app.get<{ Params: { id: string } }>(`${ROUTES.STUDIO}/communities/:id`, async (req): Promise<TasteCommunity> => {
    const { id } = req.params
    if (!COMMUNITY_ID_RE.test(id)) throw httpError(400, 'VALIDATION_FAILED', 'Topluluk kimliği geçersiz (ör. tc_01).')
    await firstRun()
    const c = impl.get(id)
    if (!c) throw httpError(404, 'COMMUNITY_NOT_FOUND', 'Topluluk bulunamadı.')
    return c
  })

  app.post(`${ROUTES.STUDIO}/communities/recompute`, async (req): Promise<ClusteringRunInfo> => {
    assertStudioWrite(req, app.config)
    const parsed = zRecompute.safeParse(req.body ?? {})
    if (!parsed.success) {
      throw httpError(
        400,
        'VALIDATION_FAILED',
        'Gövde geçersiz: k 1–2000 arası tamsayı, seed 0 ya da pozitif tamsayı olmalı; başka alan yok.',
      )
    }
    return impl.recomputeAsync(parsed.data)
  })
}
