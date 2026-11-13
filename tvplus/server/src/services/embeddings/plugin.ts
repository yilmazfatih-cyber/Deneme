/**
 * Gömme servisi eklentisi (çekim düzeyi vektörler; etiketler ve özet her çekime genel bağlam olarak eklenir).
 * Sözleşme: server/src/kernel/intelligence.ts (EmbeddingService), shared/intelligence.ts (uçlar), docs/ICERIK_ZEKASI.md §8.
 *
 * Uçlar (hepsi /api/studio altında; erişim app.ts kancasında, yazma assertStudioWrite ile):
 *   GET  /embeddings                                         → EmbeddingInfo
 *   GET  /embeddings/titles/:titleId/neighbors?first=12      → NeighborTitle[]
 *   GET  /embeddings/videos/:videoId/shots                   → ShotSummary[]
 *   GET  /embeddings/videos/:videoId/shots/:index/neighbors?first=12&sameVideo=false → NeighborShot[]
 *   GET  /embeddings/videos/:videoId/shots/:index/keyframe.jpg → image/jpeg (paftadan kırpılır; bellekte önbellek)
 *   GET  /embeddings/projection                              → ProjectionPoint[]
 *   POST /embeddings/rebuild                                 → EmbeddingInfo (+ x-tvplus-embed-* kurulum başlıkları)
 *
 * Kurulum açılıştan sonra arka planda başlar; testlerde (isTest) ilk erişimde başlar ki uygulama anında açılsın.
 * Sunucu ağa çıkmaz ve ffmpeg çalıştırmaz: vektörler content/shots altındaki çözümleme dosyalarından kurulur
 * (http sağlayıcısı seçilmişse yalnız TVP_EMBEDDING_URL'e gider).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { ROUTES } from '../../../../shared/constants'
import { httpError } from '../../gateway/errors'
import type { AppConfig } from '../../kernel/config'
import { assertStudioWrite } from '../../kernel/intelligence'
import { createDosyaProvider } from './dosya'
import { createHttpProvider } from './http'
import { inputModalities, type EmbeddingProvider } from './provider'
import { createEmbeddingService, type EmbeddingServiceImpl } from './service'
import { createTabanProvider } from './taban'

const BASE = `${ROUTES.STUDIO}/embeddings`

/** config.embedding'e göre sağlayıcı. */
export function providerFor(config: AppConfig): EmbeddingProvider {
  if (config.embedding.provider === 'dosya') return createDosyaProvider(config.dataDir)
  if (config.embedding.provider === 'http') {
    if (config.embedding.url) return createHttpProvider({ url: config.embedding.url })
    return {
      id: 'http',
      version: 'http:ayarsız',
      dims: 0,
      modalities: inputModalities,
      init: async () => {
        throw new Error('TVP_EMBEDDING_PROVIDER=http ama TVP_EMBEDDING_URL tanımlı değil')
      },
      embed: async () => null,
    }
  }
  return createTabanProvider()
}

const internalsByApp = new WeakMap<FastifyInstance, EmbeddingServiceImpl>()
/** Testlerin ve betiklerin servisin tüm yöntemlerine erişimi (kurulumu beklemek, vektör okumak). */
export function embeddingsInternals(app: FastifyInstance): EmbeddingServiceImpl {
  const s = internalsByApp.get(app)
  if (!s) throw new Error('Gömme eklentisi bu uygulamada kurulmamış')
  return s
}

const zId = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER)
const zTitleParams = z.object({ titleId: zId })
const zVideoParams = z.object({ videoId: zId })
const zShotParams = z.object({ videoId: zId, index: z.coerce.number().int().min(0).max(100_000) })
const zFirst = z.object({ first: z.coerce.number().int().min(1).max(100).default(12) })
const zShotQuery = zFirst.extend({
  sameVideo: z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((v) => v === 'true' || v === '1'),
})

function parse<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
  const r = schema.safeParse(value)
  if (!r.success) throw httpError(400, 'INVALID_REQUEST', `Geçersiz ${what}: ${r.error.issues[0]?.message ?? ''}`.trim())
  return r.data
}

export default async function embeddingsPlugin(app: FastifyInstance): Promise<void> {
  const config = app.config
  const service = createEmbeddingService({
    dataDir: config.dataDir,
    contentDir: config.contentDir,
    catalog: () => app.services.catalog,
    tagging: () => app.services.tagging ?? null,
    provider: providerFor(config),
    log: { info: (m) => app.log.info(m), warn: (m) => app.log.warn(m) },
  })
  app.services.embeddings = service
  internalsByApp.set(app, service)

  if (!config.isTest)
    app.addHook('onReady', async () => {
      setImmediate(() => service.start())
    })
  app.addHook('onClose', async () => service.close())

  /** Vektörler hazır olana dek bekler; kurulum başarısızsa 503. */
  const ensure = async () => {
    await service.whenReady()
    if (!service.ready())
      throw httpError(
        503,
        'EMBEDDINGS_UNAVAILABLE',
        `Gömme vektörleri hazır değil: ${service.lastBuild()?.error ?? 'kurulum sürüyor'}`,
      )
  }

  app.get(BASE, async () => service.info())

  app.get(`${BASE}/titles/:titleId/neighbors`, async (req: FastifyRequest) => {
    const { titleId } = parse(zTitleParams, req.params, 'başlık kimliği')
    const { first } = parse(zFirst, req.query, 'sorgu')
    if (!app.services.catalog.getTitle(titleId)) throw httpError(404, 'NOT_FOUND', 'Başlık bulunamadı.')
    await ensure()
    const out = service.titleNeighbors(titleId, first)
    if (!out) throw httpError(404, 'NOT_FOUND', 'Bu başlığın gömme vektörü yok.')
    return out
  })

  app.get(`${BASE}/videos/:videoId/shots`, async (req: FastifyRequest) => {
    const { videoId } = parse(zVideoParams, req.params, 'video kimliği')
    await ensure()
    const out = service.shots(videoId)
    if (!out) throw httpError(404, 'NOT_FOUND', 'Bu videonun çekim vektörü yok.')
    return out
  })

  app.get(`${BASE}/videos/:videoId/shots/:index/neighbors`, async (req: FastifyRequest) => {
    const { videoId, index } = parse(zShotParams, req.params, 'çekim')
    const { first, sameVideo } = parse(zShotQuery, req.query, 'sorgu')
    await ensure()
    const out = service.shotNeighbors(videoId, index, first, sameVideo)
    if (!out) throw httpError(404, 'NOT_FOUND', 'Çekim bulunamadı.')
    return out
  })

  app.get(`${BASE}/videos/:videoId/shots/:index/keyframe.jpg`, async (req: FastifyRequest, reply: FastifyReply) => {
    const { videoId, index } = parse(zShotParams, req.params, 'çekim')
    await ensure()
    const body = await service.keyframe(videoId, index)
    if (!body) throw httpError(404, 'NOT_FOUND', 'Bu çekimin anahtar karesi yok.')
    return reply.type('image/jpeg').header('cache-control', 'private, max-age=3600').send(body)
  })

  app.get(`${BASE}/projection`, async () => {
    await ensure()
    return service.projection()
  })

  app.post(`${BASE}/rebuild`, async (req: FastifyRequest, reply: FastifyReply) => {
    assertStudioWrite(req, config)
    const stats = await service.rebuild()
    if (stats.error) throw httpError(503, 'EMBEDDINGS_UNAVAILABLE', `Gömme kurulumu başarısız: ${stats.error}`)
    reply.header('x-tvplus-embed-computed', String(stats.computed))
    reply.header('x-tvplus-embed-reused', String(stats.reused))
    reply.header('x-tvplus-embed-failed', String(stats.failed.length))
    reply.header('x-tvplus-embed-ms', String(stats.ms))
    return service.info()
  })
}
