/**
 * Mikro tür servisi (bkz. docs/ICERIK_ZEKASI.md §4): geçerli etiketleri ve künyeyi birleştirip dar kategoriler kurar;
 * görünen (ana sayfa) ve görünmeyen (benzerlik, "Çünkü … izledin") katmanı ayırır.
 * Sözleşme: server/src/kernel/intelligence.ts (MicrogenreService) · tel: shared/intelligence.ts ("Mikro türler").
 * Etiketleme ve kataloğa yalnız istek anında erişir; üretim tembeldir ve etiket/katalog değişince tazelenir.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ROUTES } from '../../../../shared/constants'
import { GENRES } from '../../../../shared/taxonomy'
import { MICROGENRE_SLOTS } from '../../../../shared/tagging-schema'
import { httpError } from '../../gateway/errors'
import { createMicrogenreCore, type MicrogenreCore } from './service'

const coreByApp = new WeakMap<FastifyInstance, MicrogenreCore>()
export function microgenreCore(app: FastifyInstance): MicrogenreCore {
  const c = coreByApp.get(app)
  if (!c) throw new Error('Mikro tür eklentisi bu uygulamada kurulmamış')
  return c
}

const zListQuery = z.strictObject({
  core: z.enum(Object.keys(GENRES) as [keyof typeof GENRES, ...(keyof typeof GENRES)[]]).optional(),
  slot: z.enum(MICROGENRE_SLOTS).optional(),
  q: z.string().max(100).optional(),
  layer: z.enum(['VISIBLE', 'HIDDEN']).optional(),
  minSize: z.coerce.number().int().min(1).max(1_000_000).optional(),
  first: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).max(10_000_000).default(0),
})
const zSimilarQuery = z.strictObject({ first: z.coerce.number().int().min(1).max(200).default(12) })
const ID_RE = /^mg_[0-9a-f]{8,64}$/

export default async function microgenresPlugin(app: FastifyInstance): Promise<void> {
  const core = createMicrogenreCore({
    tagging: () => app.services.tagging,
    titles: () => app.services.catalog.allTitles(),
  })
  coreByApp.set(app, core)
  app.services.microgenres = {
    all: core.all,
    get: core.get,
    ofTitle: core.ofTitle,
    similarTitles: core.similarTitles,
    stats: core.stats,
    revision: core.revision,
  }

  const BASE = `${ROUTES.STUDIO}/microgenres`

  app.get(BASE, async (req, reply) => {
    const r = zListQuery.safeParse(req.query)
    if (!r.success) {
      const i = r.error.issues[0]
      const what =
        i?.code === 'unrecognized_keys'
          ? `bilinmeyen parametre: ${i.keys.join(', ')}`
          : `${i?.path.join('.')}: ${i?.message}`
      throw httpError(400, 'INVALID_QUERY', `Sorgu geçersiz (${what}).`)
    }
    reply.header('cache-control', 'no-store')
    return core.list(r.data)
  })

  app.get<{ Params: { titleId: string } }>(`${BASE}/by-title/:titleId`, async (req, reply) => {
    const id = Number(req.params.titleId)
    if (!Number.isInteger(id) || id <= 0)
      throw httpError(400, 'INVALID_TITLE_ID', 'Başlık kimliği pozitif bir tam sayı olmalı.')
    if (!app.services.catalog.getTitle(id))
      throw httpError(404, 'TITLE_NOT_FOUND', `${id} kimlikli başlık katalogda yok.`)
    reply.header('cache-control', 'no-store')
    return core.ofTitle(id)
  })

  // "Buna benzer" / "Çünkü … izledin": ortak mikro türlere göre benzer başlıklar; `shared` en ağır ortak mikro türler
  app.get<{ Params: { titleId: string }; Querystring: Record<string, unknown> }>(
    `${BASE}/similar/:titleId`,
    async (req, reply) => {
      const id = Number(req.params.titleId)
      if (!Number.isInteger(id) || id <= 0)
        throw httpError(400, 'INVALID_TITLE_ID', 'Başlık kimliği pozitif bir tam sayı olmalı.')
      const q = zSimilarQuery.safeParse(req.query)
      if (!q.success) throw httpError(400, 'INVALID_QUERY', 'Sorgu geçersiz (first: 1–200 arası tam sayı).')
      if (!app.services.catalog.getTitle(id))
        throw httpError(404, 'TITLE_NOT_FOUND', `${id} kimlikli başlık katalogda yok.`)
      reply.header('cache-control', 'no-store')
      return core.similarTitles(id, q.data.first)
    },
  )

  app.get<{ Params: { id: string } }>(`${BASE}/:id`, async (req, reply) => {
    if (!ID_RE.test(req.params.id)) throw httpError(400, 'INVALID_ID', 'Mikro tür kimliği "mg_" ile başlamalı.')
    const mg = core.get(req.params.id)
    if (!mg)
      throw httpError(
        404,
        'MICROGENRE_NOT_FOUND',
        'Bu kimlikle bir mikro tür yok (etiketler değiştiyse yeniden üretilmiş olabilir).',
      )
    reply.header('cache-control', 'no-store')
    return mg
  })
}
