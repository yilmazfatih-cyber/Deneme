/**
 * Zipkin B3 izleme (Netflix: Envoy kapısının her yanıta koyduğu x-b3-traceid).
 * Gelen geçerli x-b3-traceid / x-b3-spanid kabul edilir, yoksa üretilir; her yanıt iz başlıklarını,
 * bölgeyi ve kapıda geçen süreyi (`server-timing: gateway;dur=<ms>`) taşır.
 * İstek süslemeleri (`trace`, `passport`) burada bildirilir; pasaportu kimlik eklentisi doldurur.
 */
import { randomBytes } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { HEADERS } from '../../../shared/constants'
import type { Passport, Trace } from '../kernel/context'

const TRACE_ID_RE = /^(?:[0-9a-f]{16}|[0-9a-f]{32})$/
const SPAN_ID_RE = /^[0-9a-f]{16}$/

const header = (req: FastifyRequest, name: string): string | null => {
  const v = req.headers[name]
  const s = Array.isArray(v) ? v[0] : v
  return typeof s === 'string' ? s.trim().toLowerCase() : null
}

export const newTraceId = (): string => randomBytes(16).toString('hex')
export const newSpanId = (): string => randomBytes(8).toString('hex')

/** Gelen başlıklardan izi çözer; geçersiz değerler yok sayılır. */
export function resolveTrace(req: FastifyRequest): Trace {
  const t = header(req, HEADERS.TRACE_ID)
  const s = header(req, HEADERS.SPAN_ID)
  const p = header(req, HEADERS.PARENT_SPAN_ID)
  const traceId = t && TRACE_ID_RE.test(t) && !/^0+$/.test(t) ? t : newTraceId()
  const spanId = s && SPAN_ID_RE.test(s) && !/^0+$/.test(s) ? s : newSpanId()
  const parentSpanId = p && SPAN_ID_RE.test(p) ? p : null
  return { traceId, spanId, parentSpanId }
}

const started = new WeakMap<FastifyRequest, bigint>()

export default async function plugin(app: FastifyInstance): Promise<void> {
  app.decorateRequest('trace', null as unknown as Trace)
  app.decorateRequest('passport', null as unknown as Passport)

  app.addHook('onRequest', async (req) => {
    started.set(req, process.hrtime.bigint())
    req.trace = resolveTrace(req)
  })

  app.addHook('onSend', async (req, reply, payload) => {
    const trace = req.trace ?? resolveTrace(req)
    reply.header(HEADERS.TRACE_ID, trace.traceId)
    reply.header(HEADERS.SPAN_ID, trace.spanId)
    if (trace.parentSpanId) reply.header(HEADERS.PARENT_SPAN_ID, trace.parentSpanId)
    reply.header(HEADERS.SAMPLED, '1')
    reply.header(HEADERS.REGION, app.config.region)
    const t0 = started.get(req)
    const ms = t0 === undefined ? 0 : Number(process.hrtime.bigint() - t0) / 1e6
    const prev = reply.getHeader('server-timing')
    const entry = `gateway;dur=${ms.toFixed(1)}`
    reply.header('server-timing', prev ? `${String(prev)}, ${entry}` : entry)
    return payload
  })
}
