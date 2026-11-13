/**
 * OCA düğüm benzetimi (Netflix Open Connect). Aynı kökte dört sanal düğüm + 'anycast' takma adı:
 *   GET /oca/:node/range/:start-:end?o&v&e&t   → 206, istenen baytlar
 *   GET /oca/:node/file?o&v&e&t                → Range başlığına göre 206 / 200 (PROGRESSIVE)
 *   GET /oca/:node/timedtext/:trackId?o&v&e&t  → TTML
 *   GET /oca/:node/ftl/probe?data=N            → N rastgele bayt (FTL)
 * Her düğümde yapay gecikme, hız sınırı, hata oranı ve "kapalı" durumu uygulanır.
 * Hata ayıklama: GET /api/debug/oca · POST /api/debug/oca/:node · POST /api/debug/oca/reset
 */
import { randomBytes } from 'node:crypto'
import { open } from 'node:fs/promises'
import { Readable } from 'node:stream'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { HEADERS, ROUTES } from '../../../../shared/constants'
import type { OcaNodeState } from '../../../../shared/types'
import { planeOf, type Plane } from '../playback/plane'
import { CacheMissError } from './blockCache'
import { ANYCAST_ALIAS } from './nodes'
import type { ObjectRecord } from './objects'
import { OfflineError, upstreamRange, upstreamSize } from './upstream'

const P = ROUTES.OCA_PREFIX
const CHUNK = 16 * 1024
/** Bir koşuda en çok bu kadar blok birlikte çekilir (≈ 2 MiB). */
const RUN_BLOCKS = 8
const MAX_PROBE_BYTES = 1024 * 1024

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function errorBody(req: FastifyRequest, code: string, message: string) {
  return { error: { code, message, traceId: req.trace?.traceId } }
}
function sendError(req: FastifyRequest, reply: FastifyReply, status: number, code: string, message: string) {
  return reply.code(status).header('cache-control', 'no-store').type('application/json; charset=utf-8').send(errorBody(req, code, message))
}

function baseHeaders(req: FastifyRequest, reply: FastifyReply, node: OcaNodeState) {
  reply.header(HEADERS.OCA_NODE, node.id)
  reply.header(HEADERS.TCP_INFO, `addr=${req.ip};port=${req.socket?.remotePort ?? 0};rtt=${node.latencyMs}`)
  reply.header('server', 'tvplus-oca')
  reply.header('timing-allow-origin', '*')
}

/** Düğüm koşulları: kapalı → hemen 503; gecikme; rastgele hata. false → yanıt verildi. */
async function gate(req: FastifyRequest, reply: FastifyReply, node: OcaNodeState): Promise<boolean> {
  node.requests++
  baseHeaders(req, reply, node)
  if (node.down) {
    await sendError(req, reply, 503, 'NODE_DOWN', 'Bu OCA düğümü şu an hizmet dışı.')
    return false
  }
  if (node.latencyMs > 0) await sleep(node.latencyMs)
  if (node.errorRate > 0 && Math.random() < node.errorRate) {
    await sendError(req, reply, 503, 'NODE_ERROR', 'OCA düğümü isteği karşılayamadı.')
    return false
  }
  return true
}

/** Gövdeyi düğümün hız sınırına göre parça parça akıtır; sayaçları günceller. */
async function* paced(source: AsyncIterable<Buffer> | Iterable<Buffer>, node: OcaNodeState): AsyncGenerator<Buffer> {
  const t0 = Date.now()
  let sent = 0
  for await (const buf of source) {
    for (let off = 0; off < buf.length; off += CHUNK) {
      const piece = buf.subarray(off, Math.min(off + CHUNK, buf.length))
      const kbps = node.throughputKbps
      if (kbps && kbps > 0) {
        const due = t0 + ((sent + piece.length) * 8) / kbps
        const wait = due - Date.now()
        if (wait > 1) await sleep(wait)
      }
      sent += piece.length
      node.bytesServed += piece.length
      yield piece
    }
  }
}

type Resolved = { node: OcaNodeState; rec: ObjectRecord }

/** Düğüm + imza + nesne doğrulaması. null → yanıt verildi. */
async function resolveSigned(
  plane: Plane,
  req: FastifyRequest<{ Params: { node: string }; Querystring: Record<string, string> }>,
  reply: FastifyReply,
): Promise<Resolved | null> {
  const node = plane.nodes.get(req.params.node)
  if (!node) {
    await sendError(req, reply, 404, 'NODE_NOT_FOUND', 'Böyle bir OCA düğümü yok.')
    return null
  }
  if (!(await gate(req, reply, node))) return null
  const v = plane.signer.verify(node.id, req.query)
  if (!v.ok) {
    await sendError(req, reply, v.status, v.code, v.message)
    return null
  }
  const rec = plane.objects.get(v.o)
  if (!rec) {
    await sendError(req, reply, 404, 'OBJECT_NOT_FOUND', 'Nesne bulunamadı.')
    return null
  }
  if (rec.v !== v.v) {
    await sendError(req, reply, 410, 'OBJECT_VERSION_STALE', 'Nesnenin bu sürümü artık sunulmuyor; manifesti yenileyin.')
    return null
  }
  return { node, rec }
}

/** Uzak nesnenin boyu (bilinmiyorsa kökene sorulur). */
async function sizeOf(plane: Plane, rec: ObjectRecord): Promise<number> {
  const loc = rec.loc
  if (loc.kind === 'local') return loc.size
  if (loc.kind !== 'remote') throw new Error('bayt nesnesi değil')
  if (loc.size !== null) return loc.size
  const size = await upstreamSize(plane.config, loc.url, 6000)
  plane.objects.setSize(rec.o, size)
  return size
}

/** [start, end] baytlarını üreten kaynak; ilk koşu yanıt başlıklarından önce hazırlanır (hata → 502). */
async function bytesSource(plane: Plane, rec: ObjectRecord, node: OcaNodeState, size: number, start: number, end: number): Promise<AsyncIterable<Buffer>> {
  const loc = rec.loc
  if (loc.kind === 'local') {
    node.cacheHits++
    return (async function* () {
      // Dosya tüketim başlayınca açılır (HEAD gibi gövdesiz yanıtlarda tanıtıcı sızmaz).
      const fh = await open(loc.path, 'r')
      try {
        let pos = start
        while (pos <= end) {
          const len = Math.min(256 * 1024, end - pos + 1)
          const buf = Buffer.allocUnsafe(len)
          const { bytesRead } = await fh.read(buf, 0, len, pos)
          if (bytesRead <= 0) break
          yield buf.subarray(0, bytesRead)
          pos += bytesRead
        }
      } finally {
        await fh.close()
      }
    })()
  }
  if (loc.kind !== 'remote') throw new Error('bayt nesnesi değil')
  const cache = plane.cache
  const B = cache.blockSize
  const first = Math.floor(start / B)
  const last = Math.floor(end / B)
  const fetcher = plane.config.offline ? null : (a: number, b: number) => upstreamRange(plane.config, loc.url, a, b)
  let anyMiss = false
  const runEnd = (a: number) => Math.min(last, a + RUN_BLOCKS - 1)
  const firstRun = await cache.ensure(rec.o, rec.v, size, first, runEnd(first), fetcher)
  if (firstRun.misses > 0) anyMiss = true
  const slice = (blocks: Buffer[], a: number) => {
    const out: Buffer[] = []
    blocks.forEach((blk, k) => {
      const blockStart = (a + k) * B
      const s = Math.max(start, blockStart) - blockStart
      const e = Math.min(end, blockStart + blk.length - 1) - blockStart
      if (e >= s) out.push(blk.subarray(s, e + 1))
    })
    return out
  }
  return (async function* () {
    try {
      yield* slice(firstRun.blocks, first)
      for (let a = runEnd(first) + 1; a <= last; a = runEnd(a) + 1) {
        const run = await cache.ensure(rec.o, rec.v, size, a, runEnd(a), fetcher)
        if (run.misses > 0) anyMiss = true
        yield* slice(run.blocks, a)
      }
    } finally {
      if (anyMiss) node.cacheMisses++
      else node.cacheHits++
    }
  })()
}

function upstreamFailure(req: FastifyRequest, reply: FastifyReply, err: unknown) {
  if (err instanceof OfflineError || err instanceof CacheMissError) {
    return sendError(req, reply, 502, 'ORIGIN_UNREACHABLE', 'Nesne bu düğümün önbelleğinde yok ve kökene ulaşılamıyor.')
  }
  req.log.warn({ err: (err as Error).message }, 'OCA köken hatası')
  return sendError(req, reply, 502, 'ORIGIN_ERROR', 'Köken sunucusundan veri alınamadı.')
}

async function serveBytes(
  plane: Plane,
  req: FastifyRequest,
  reply: FastifyReply,
  r: Resolved,
  range: { start: number; end: number | null } | null,
): Promise<FastifyReply> {
  const { node, rec } = r
  if (rec.loc.kind === 'text') return sendError(req, reply, 404, 'OBJECT_NOT_FOUND', 'Bu nesne bayt aralığıyla sunulmaz.')
  let size: number
  try {
    size = await sizeOf(plane, rec)
  } catch (err) {
    return upstreamFailure(req, reply, err)
  }
  const start = range ? range.start : 0
  let end = range ? (range.end ?? size - 1) : size - 1
  if (range && (start >= size || (range.end !== null && range.end < start))) {
    reply.header('content-range', `bytes */${size}`)
    return sendError(req, reply, 416, 'RANGE_NOT_SATISFIABLE', 'İstenen bayt aralığı dosyanın dışında.')
  }
  end = Math.min(end, size - 1)
  if (size === 0) {
    return reply.code(200).header('content-length', '0').type(rec.loc.mime).send(Buffer.alloc(0))
  }
  let source: AsyncIterable<Buffer>
  try {
    source = await bytesSource(plane, rec, node, size, start, end)
  } catch (err) {
    return upstreamFailure(req, reply, err)
  }
  reply
    .code(range ? 206 : 200)
    .header('content-type', rec.loc.mime)
    .header('content-length', String(end - start + 1))
    .header('accept-ranges', 'bytes')
    .header('cache-control', 'private, max-age=3600')
  if (range) reply.header('content-range', `bytes ${start}-${end}/${size}`)
  return reply.send(Readable.from(paced(source, node)))
}

/** "bytes=a-b" | "bytes=a-" | "bytes=-n" (tek aralık). Geçersiz/çoklu → null (tam dosya). */
export function parseRangeHeader(h: string | undefined, sizeHint: number | null): { start: number; end: number | null } | null | 'invalid' {
  if (!h) return null
  const m = /^bytes=(\d*)-(\d*)$/.exec(h.trim())
  if (!m) return null
  const [, a, b] = m
  if (a === '' && b === '') return 'invalid'
  if (a === '') {
    const n = Number(b)
    if (sizeHint === null) return 'invalid'
    return { start: Math.max(0, sizeHint - n), end: sizeHint - 1 }
  }
  return { start: Number(a), end: b === '' ? null : Number(b) }
}

const zConditions = z
  .object({
    latencyMs: z.number().int().min(0).max(30_000),
    throughputKbps: z.number().positive().max(10_000_000).nullable(),
    errorRate: z.number().min(0).max(1),
    down: z.boolean(),
  })
  .partial()
  .strict()

export default async function plugin(app: FastifyInstance): Promise<void> {
  const plane = planeOf(app)
  app.services.oca = { nodes: () => plane.nodes.list() }

  type SignedReq = FastifyRequest<{ Params: { node: string; range?: string; trackId?: string }; Querystring: Record<string, string> }>

  app.get(`${P}/:node/range/:range`, async (req: SignedReq, reply) => {
    const m = /^(\d+)-(\d+)$/.exec(req.params.range ?? '')
    const r = await resolveSigned(plane, req, reply)
    if (!r) return reply
    if (!m) return sendError(req, reply, 400, 'BAD_RANGE', 'Aralık başlangıç-bitiş biçiminde olmalı.')
    const start = Number(m[1])
    const end = Number(m[2])
    if (end < start) {
      let size: number | null = null
      try {
        size = await sizeOf(plane, r.rec)
      } catch {
        /* boy bilinmiyor */
      }
      if (size !== null) reply.header('content-range', `bytes */${size}`)
      return sendError(req, reply, 416, 'RANGE_NOT_SATISFIABLE', 'Aralığın sonu başından küçük.')
    }
    return serveBytes(plane, req, reply, r, { start, end })
  })

  app.get(`${P}/:node/file`, async (req: SignedReq, reply) => {
    const r = await resolveSigned(plane, req, reply)
    if (!r) return reply
    const hint = r.rec.loc.kind === 'text' ? null : r.rec.loc.size
    let range = parseRangeHeader(req.headers.range, hint)
    if (range === 'invalid') {
      // sonek aralığı için boy gerekiyor
      try {
        const size = await sizeOf(plane, r.rec)
        range = parseRangeHeader(req.headers.range, size)
      } catch (err) {
        return upstreamFailure(req, reply, err)
      }
      if (range === 'invalid') return sendError(req, reply, 416, 'RANGE_NOT_SATISFIABLE', 'Range başlığı geçersiz.')
    }
    return serveBytes(plane, req, reply, r, range)
  })

  app.get(`${P}/:node/timedtext/:trackId`, async (req: SignedReq, reply) => {
    const r = await resolveSigned(plane, req, reply)
    if (!r) return reply
    const loc = r.rec.loc
    if (loc.kind !== 'text') return sendError(req, reply, 404, 'OBJECT_NOT_FOUND', 'Bu nesne altyazı değil.')
    let doc
    try {
      doc = await plane.subtitles.ttml({ url: loc.url, path: loc.path, format: loc.format, lang: loc.lang })
    } catch (err) {
      return upstreamFailure(req, reply, err)
    }
    const body = Buffer.from(doc.ttml, 'utf8')
    r.node.cacheHits++
    return reply
      .code(200)
      .header('content-type', 'application/ttml+xml; charset=utf-8')
      .header('content-length', String(body.length))
      .header('cache-control', 'private, max-age=3600')
      .send(Readable.from(paced([body], r.node)))
  })

  app.get(`${P}/:node/ftl/probe`, async (req: FastifyRequest<{ Params: { node: string }; Querystring: { data?: string } }>, reply) => {
    const node = plane.nodes.resolve(req.params.node)
    if (!node) {
      if (req.params.node === ANYCAST_ALIAS) return sendError(req, reply, 503, 'NODE_DOWN', 'Sağlıklı OCA düğümü yok.')
      return sendError(req, reply, 404, 'NODE_NOT_FOUND', 'Böyle bir OCA düğümü yok.')
    }
    if (!(await gate(req, reply, node))) return reply
    const n = Math.min(MAX_PROBE_BYTES, Math.max(0, Number.parseInt(req.query.data ?? '5120', 10) || 0))
    return reply
      .code(200)
      .header('content-type', 'application/octet-stream')
      .header('content-length', String(n))
      .header('cache-control', 'no-store')
      .send(Readable.from(paced([randomBytes(n)], node)))
  })

  /* ───────────── Hata ayıklama ───────────── */
  const D = `${ROUTES.DEBUG_PREFIX}/oca`
  app.get(D, async (_req, reply) => reply.header('cache-control', 'no-store').send(plane.nodes.list()))
  app.post(`${D}/reset`, async (_req, reply) => {
    plane.nodes.reset()
    return reply.header('cache-control', 'no-store').send(plane.nodes.list())
  })
  app.post(`${D}/:node`, async (req: FastifyRequest<{ Params: { node: string } }>, reply) => {
    const parsed = zConditions.safeParse(req.body ?? {})
    if (!parsed.success) return sendError(req, reply, 400, 'VALIDATION_FAILED', 'Geçersiz koşul: latencyMs, throughputKbps, errorRate, down.')
    const updated = plane.nodes.setConditions(req.params.node, parsed.data)
    if (!updated) return sendError(req, reply, 404, 'NODE_NOT_FOUND', 'Böyle bir OCA düğümü yok.')
    return reply.header('cache-control', 'no-store').send(updated)
  })
}
