/**
 * Tahmin modeli — izleme verisinden eğitilen öneri modeli (docs/ICERIK_ZEKASI.md §13.2).
 * Sözleşme: server/src/kernel/intelligence.ts (PredictionService), shared/intelligence.ts "Tahmin modeli".
 *
 *   GET  /api/studio/model                                         → PredictionModelInfo
 *   POST /api/studio/model/train          gövde: TrainRequest      → TrainingRun (RUNNING; arka planda eğitir)
 *   GET  /api/studio/model/runs                                    → TrainingRun[] (en yeni önce)
 *   GET  /api/studio/model/viewers?communityId=&first=20           → ModelViewerSample[]
 *   GET  /api/studio/model/predict?viewerId=|profileGuid=&first=20 → ViewerPrediction
 *   GET  /api/studio/model/explain?viewerId=|profileGuid=&titleId= → PredictionExplanation
 *
 * Bileşenler: data.ts (etkileşimler, bölmeler) · als.ts (ağırlıklı ALS) · content.ts (içerik kulesi) ·
 * ranker.ts (lojistik sıralayıcı, eşleşme yüzdesi) · metrics.ts · train.ts (hat) · model.ts (fold-in, kalıcılık) ·
 * service.ts (yaşam döngüsü, sunum).
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ROUTES } from '../../../../shared/constants'
import type {
  ModelViewerSample,
  PredictionExplanation,
  PredictionModelInfo,
  ViewerPrediction,
} from '../../../../shared/intelligence'
import { httpError } from '../../gateway/errors'
import { assertStudioWrite } from '../../kernel/intelligence'
import { createPredictionService, type PredictionImpl, type PredictionTuning } from './service'
import type { TrainingRunInfo } from './train'

const BASE = `${ROUTES.STUDIO}/model`

const implByApp = new WeakMap<FastifyInstance, PredictionImpl>()
/** Testler ve betikler için: eğitimi bekleme, modele erişim gibi sözleşme dışı yöntemler. */
export function predictionInternals(app: FastifyInstance): PredictionImpl {
  const impl = implByApp.get(app)
  if (!impl) throw new Error('Tahmin modeli eklentisi bu uygulamada kurulmamış')
  return impl
}

export function tuningFor(isTest: boolean): PredictionTuning {
  return { autoStart: !isTest, sliceMs: 12, pollMs: 2000, debounceMs: 4000, maxWaitMs: 120_000 }
}

const zTrain = z
  .object({
    factors: z.number().int().min(2).max(128).optional(),
    iterations: z.number().int().min(1).max(50).optional(),
    regularization: z.number().min(0.0001).max(1000).optional(),
    alpha: z.number().min(0).max(1000).optional(),
    seed: z.number().int().min(0).max(4294967295).optional(),
  })
  .strict()

const zFirst = z.coerce.number().int().min(1).max(100).default(20)
const zViewerId = z.string().min(1).max(200)
const zWho = z
  .object({
    viewerId: zViewerId.optional(),
    profileGuid: z.string().min(1).max(200).optional(),
  })
  .refine((q) => (q.viewerId === undefined) !== (q.profileGuid === undefined), {
    message: 'viewerId ya da profileGuid verilmeli (yalnız biri)',
  })

const zPredict = zWho.and(z.object({ first: zFirst }))
const zExplain = zWho.and(z.object({ titleId: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER) }))
const zViewers = z.object({
  communityId: z
    .string()
    .regex(/^tc_\d{2,4}$/)
    .optional(),
  first: zFirst,
})

const invalid = (message: string) => httpError(400, 'VALIDATION_FAILED', message)

export default async function predictionsPlugin(app: FastifyInstance): Promise<void> {
  const impl = createPredictionService(app, tuningFor(app.config.isTest))
  implByApp.set(app, impl)
  app.services.predictions = impl

  app.get(BASE, async (): Promise<PredictionModelInfo> => impl.info())

  app.post(`${BASE}/train`, async (req): Promise<TrainingRunInfo> => {
    assertStudioWrite(req, app.config)
    const parsed = zTrain.safeParse(req.body ?? {})
    if (!parsed.success)
      throw invalid(
        'Gövde geçersiz: factors 2–128, iterations 1–50 tamsayı; regularization 0,0001–1000; alpha 0–1000; ' +
          'seed 0 ya da pozitif tamsayı; başka alan yok.',
      )
    return impl.startTraining(parsed.data, 'stüdyo isteği')
  })

  app.get(`${BASE}/runs`, async (): Promise<TrainingRunInfo[]> => impl.runs())

  app.get(`${BASE}/viewers`, async (req): Promise<ModelViewerSample[]> => {
    const q = zViewers.safeParse(req.query)
    if (!q.success) throw invalid('Sorgu geçersiz: communityId (ör. tc_01) ve first 1–100.')
    return impl.sampleViewers(q.data.communityId ?? null, q.data.first)
  })

  app.get(`${BASE}/predict`, async (req): Promise<ViewerPrediction> => {
    const q = zPredict.safeParse(req.query)
    if (!q.success) throw invalid('Sorgu geçersiz: viewerId ya da profileGuid (yalnız biri) ve first 1–100.')
    return impl.predict(q.data, q.data.first)
  })

  app.get(`${BASE}/explain`, async (req): Promise<PredictionExplanation> => {
    const q = zExplain.safeParse(req.query)
    if (!q.success) throw invalid('Sorgu geçersiz: viewerId ya da profileGuid (yalnız biri) ve titleId.')
    if (!impl.ready()) throw httpError(409, 'MODEL_NOT_READY', 'Tahmin modeli henüz eğitilmedi.')
    const e = impl.explainFor(q.data, q.data.titleId)
    if (!e)
      throw httpError(
        404,
        'PREDICTION_UNAVAILABLE',
        'Bu izleyici ve başlık için açıklama yok (izleme geçmişi yok, başlık bilinmiyor ya da görünmüyor).',
      )
    return e
  })
}
