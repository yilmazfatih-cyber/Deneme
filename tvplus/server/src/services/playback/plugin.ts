/**
 * Oynatma API'si (Netflix playapi): MSL anahtar sağlama + lisanslı manifest.
 *   POST /msl/v1/provision?reqName=aleProvision                       (düz JSON)
 *   POST /msl/v1/playapi/licensedManifest?reqName=[prefetch/]licensedManifest   (MSL zarfı)
 * Manifest hataları (ManifestError) da zarfın içinde, HTTP 200 ile döner; MSL katmanı hataları düz JSON
 * MslErrorBody (400/401); üyelik/profil eksikliği düz REST hatası (401).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { HEADERS, ROUTES } from '../../../../shared/constants'
import { MSL_VERSION } from '../../../../shared/playback'
import type { ContentSource } from '../../../../shared/content-schema'
import type { PlaybackService, StreamInfo } from '../../kernel/services'
import { ftlKey } from '../ftl/plugin'
import { buildManifest, zManifestRequest } from './manifest'
import { planeOf, type Plane } from './plane'
import { streamInfoOf } from './sources/registry'

const ACTIVE_WINDOW_MS = 2 * 60 * 1000

function parseBody(body: unknown): unknown {
  if (typeof body === 'string') {
    try {
      return JSON.parse(body)
    } catch {
      return null
    }
  }
  if (Buffer.isBuffer(body)) {
    try {
      return JSON.parse(body.toString('utf8'))
    } catch {
      return null
    }
  }
  return body
}

function restError(req: FastifyRequest, reply: FastifyReply, status: number, code: string, message: string) {
  return reply.code(status).type('application/json; charset=utf-8').send({ error: { code, message, traceId: req.trace?.traceId } })
}

function subtitlesDirOf(app: FastifyInstance): string | null {
  try {
    return app.services.catalog?.subtitlesDir() ?? null
  } catch {
    return null
  }
}

const streamSourceOf = (sources: ContentSource[]) => sources.find((s) => s.type === 'DASH' || s.type === 'PACKAGED') ?? null

function createPlaybackService(app: FastifyInstance, plane: Plane): PlaybackService {
  return {
    cachedStreamInfo(videoId: number): StreamInfo | null {
      try {
        const playable = app.services.catalog?.getPlayable(videoId)
        if (!playable) return null
        const src = streamSourceOf(playable.sources)
        if (!src) return null
        const d = plane.sources.peek(src, { subtitlesDir: subtitlesDirOf(app) })
        return d ? streamInfoOf(d, playable.runtimeSec) : null
      } catch {
        return null
      }
    },
    stats() {
      const c = plane.counters
      const cutoff = Date.now() - ACTIVE_WINDOW_MS
      while (c.recent.length > 0 && c.recent[0]! < cutoff) c.recent.shift()
      return { activeSessions: c.recent.length, manifestsIssued: c.manifestsIssued, prefetchIssued: c.prefetchIssued }
    },
  }
}

/** Açılıştan sonra arka planda tüm DASH kaynaklarının MPD'lerini önbelleğe alır (rozetler eş zamanlı yanıtlansın). */
async function warmCache(app: FastifyInstance, plane: Plane): Promise<void> {
  const catalog = app.services.catalog
  if (!catalog) return
  const seen = new Set<string>()
  const sources: Extract<ContentSource, { type: 'DASH' }>[] = []
  const add = (s: ContentSource | undefined) => {
    if (s && s.type === 'DASH' && !seen.has(s.manifest)) {
      seen.add(s.manifest)
      sources.push(s)
    }
  }
  try {
    for (const t of catalog.allTitles()) {
      add(t.promo?.source)
      for (const p of catalog.listPlayables(t.videoId)) {
        p.sources.forEach(add)
        add(p.promo?.source)
      }
    }
  } catch (err) {
    app.log.warn({ err: (err as Error).message }, 'ısıtma: katalog okunamadı')
    return
  }
  let ok = 0
  const t0 = Date.now()
  for (const s of sources) {
    try {
      await plane.sources.resolve(s, { subtitlesDir: subtitlesDirOf(app) })
      ok++
    } catch (err) {
      app.log.warn({ manifest: s.manifest, err: (err as Error).message }, 'ısıtma: MPD alınamadı')
    }
  }
  app.log.info({ ok, total: sources.length, ms: Date.now() - t0 }, 'oynatma: MPD önbelleği ısıtıldı')
}

export default async function plugin(app: FastifyInstance): Promise<void> {
  const plane = planeOf(app)
  app.services.playback = createPlaybackService(app, plane)

  app.post(ROUTES.MSL_PROVISION, async (req, reply) => {
    reply.header(HEADERS.MSL, MSL_VERSION).header('cache-control', 'no-store')
    const result = plane.msl.provision(parseBody(req.body))
    if (!result.ok) return reply.code(result.status).send(result.body)
    return reply.send(result.response)
  })

  app.post(ROUTES.MSL_MANIFEST, async (req: FastifyRequest<{ Querystring: { reqName?: string } }>, reply) => {
    reply.header(HEADERS.MSL, MSL_VERSION).header('cache-control', 'no-store')
    const passport = plane.passportOf(req)
    if (!passport || !passport.account || passport.membershipStatus !== 'CURRENT_MEMBER') {
      return restError(req, reply, 401, 'UNAUTHENTICATED', 'Oynatmak için giriş yapmalısınız.')
    }
    if (!passport.profile) return restError(req, reply, 401, 'PROFILE_REQUIRED', 'Önce bir profil seçin.')

    const opened = plane.msl.open(parseBody(req.body))
    if (!opened.ok) return reply.code(opened.status).send(opened.body)

    const parsed = zManifestRequest.safeParse(opened.payload)
    if (!parsed.success) {
      const body = { error: { code: 'BAD_REQUEST', message: 'Manifest isteği biçimi hatalı.' } }
      return reply.send(plane.msl.seal(opened.session, body, opened.header))
    }
    const input = { ...parsed.data, prefetch: parsed.data.prefetch || req.query.reqName === 'prefetch/licensedManifest' }
    const result = await buildManifest(app, plane, passport, input, plane.ftl.get(ftlKey(plane, req)))
    if (result.ok) {
      if (input.prefetch) plane.counters.prefetchIssued++
      else {
        plane.counters.manifestsIssued++
        plane.counters.recent.push(Date.now())
      }
      return reply.send(plane.msl.seal(opened.session, result.manifest, opened.header))
    }
    return reply.send(plane.msl.seal(opened.session, result.body, opened.header))
  })

  if (!app.config.offline && !app.config.isTest) {
    app.addHook('onReady', async () => {
      setTimeout(() => {
        void warmCache(app, plane)
      }, 1500).unref()
    })
  }
}
