/**
 * Görsel API (Netflix /dnm/api/v6/ karşılığı):
 *   GET /img/v1/<tip>/<genişlik>x<yükseklik>/<encodeURIComponent(varlık)>.<webp|jpg>?r=<imza>
 * İmza `kernel/imageUrls.ts` ile doğrulanır; boyut tipin oranına normalleştirilmiş olmalıdır. Kaynak katalogdan
 * İSTEK ANINDA çözülür (`app.services.catalog.getArtworkSource`). Yanıt bir yıl değişmez önbelleklenir.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { ROUTES } from '../../../../shared/constants'
import {
  ARTWORK_SPECS,
  normalizeSize,
  setStaticArtworkAlias,
  verifyImageSignature,
  type ArtworkTypeName,
  type ImageRequest,
} from '../../kernel/imageUrls'
import { serveStaticAssetsForTesting, staticAliasOf } from './staticAssets'

interface ImageParams {
  type: string
  size: string
  file: string
}

const isArtworkType = (t: string): t is ArtworkTypeName => Object.hasOwn(ARTWORK_SPECS, t)

function sendError(req: FastifyRequest, reply: FastifyReply, status: number, code: string, message: string) {
  return reply
    .code(status)
    .header('cache-control', 'no-store')
    .send({ error: { code, message, traceId: req.trace?.traceId ?? null } })
}

/** Yol parçalarını ImageRequest'e çevirir; biçim bozuksa null. */
export function parseImagePath(p: ImageParams): ImageRequest | null {
  const type = p.type.toUpperCase()
  if (!isArtworkType(type) || p.type !== type.toLowerCase()) return null
  const size = /^(\d{1,5})x(\d{1,5})$/.exec(p.size)
  if (!size) return null
  const m = /^(.+)\.(webp|jpg)$/.exec(p.file)
  if (!m || !m[1] || !m[2]) return null
  let entityId: string
  try {
    // Fastify yol parametresini zaten çözer; çift kodlanmış "%3A" kalırsa bir kez daha çözülür.
    entityId = /%[0-9a-f]{2}/i.test(m[1]) ? decodeURIComponent(m[1]) : m[1]
  } catch {
    return null
  }
  return { type, entityId, width: Number(size[1]), height: Number(size[2]), format: m[2] === 'jpg' ? 'jpg' : 'webp' }
}

/**
 * Durağan kip (GitHub Pages): görsel adresleri önceden üretilmiş dosyaları gösterir (kernel/imageUrls.ts); burada yalnız
 * sayılamayan varlıkların eşleyicisi kaydedilir. sharp yüklenmez. Tarayıcıdaki sunucu bu işlevi doğrudan çağırabilir.
 */
export function registerStaticImages(app: FastifyInstance): void {
  setStaticArtworkAlias(app.config, staticAliasOf(app))
}

export default async function plugin(app: FastifyInstance): Promise<void> {
  if (app.config.staticHost) {
    registerStaticImages(app)
    // Yalnız Node'da sınama kolaylığı: pages-assets/img ve pages-assets/subtitles bu sunucudan verilir
    if (typeof process !== 'undefined' && process.versions?.node) await serveStaticAssetsForTesting(app)
    return
  }
  // sharp yalnız sunucu kipinde yüklenir (durağan kipte gerekmez, tarayıcıda yoktur)
  const { createImagePipeline } = await import('./pipeline')
  const pipeline = createImagePipeline({
    dataDir: app.config.dataDir,
    publicDir: app.config.publicDir,
    offline: app.config.offline,
  })

  app.get<{ Params: ImageParams; Querystring: { r?: string | string[] } }>(
    `${ROUTES.IMAGE_PREFIX}/:type/:size/:file`,
    async (req, reply) => {
      const ir = parseImagePath(req.params)
      if (!ir) return sendError(req, reply, 400, 'IMAGE_BAD_REQUEST', 'Görsel adresi biçimi geçersiz.')
      const r = Array.isArray(req.query.r) ? req.query.r[0] : req.query.r
      if (!verifyImageSignature(app.config, ir, r))
        return sendError(req, reply, 403, 'IMAGE_SIGNATURE_INVALID', 'Görsel imzası geçersiz.')
      const norm = normalizeSize(ir.type, ir.width)
      if (norm.width !== ir.width || norm.height !== ir.height)
        return sendError(
          req,
          reply,
          400,
          'IMAGE_SIZE_INVALID',
          `Bu tip için boyut ${norm.width}x${norm.height} olmalı.`,
        )

      const catalog = app.services.catalog as typeof app.services.catalog | undefined
      if (!catalog || typeof catalog.getArtworkSource !== 'function')
        return sendError(req, reply, 503, 'CATALOG_UNAVAILABLE', 'Katalog servisi hazır değil.')
      const src = catalog.getArtworkSource(ir.entityId, ir.type)
      if (!src) return sendError(req, reply, 404, 'IMAGE_NOT_FOUND', 'Görsel bulunamadı.')

      const out = await pipeline.get(ir, src)
      reply
        .header('content-type', out.contentType)
        .header('etag', out.etag)
        .header('cache-control', out.cacheable ? 'public, max-age=31536000, immutable' : 'public, max-age=300')
        .header('x-tvplus-img', `${out.origin}; cache=${out.cache}`)
      const inm = req.headers['if-none-match']
      if (inm && inm.split(',').some((t) => t.trim() === out.etag)) return reply.code(304).send()
      return reply.send(out.body)
    },
  )
}
