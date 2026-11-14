/**
 * @fastify/cookie, @fastify/formbody ve @fastify/static yedekleri. Çerez ayrıştırma ve `reply.setCookie` ev
 * sahibinin içindedir (fastify.ts); form gövdesi ayrıştırıcısı burada eklenir. Durağan dosyaları tarayıcı kipinde
 * barındırma sunar (GitHub Pages), bu yüzden @fastify/static hiçbir şey yapmaz.
 */
import type { FastifyHost } from './fastify'

const SKIP = Symbol.for('skip-override')

type Plugin = ((app: FastifyHost, opts?: Record<string, unknown>) => Promise<void>) & { [SKIP]?: boolean }

const mark = (fn: Plugin): Plugin => {
  fn[SKIP] = true
  return fn
}

export const cookie: Plugin = mark(async () => {})

export const formbody: Plugin = mark(async (app) => {
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, payload, done) => {
    const out: Record<string, string | string[]> = {}
    for (const [k, v] of new URLSearchParams(String(payload))) {
      const prev = out[k]
      out[k] = prev === undefined ? v : Array.isArray(prev) ? [...prev, v] : [prev, v]
    }
    done(null, out)
  })
})

export const staticFiles: Plugin = mark(async () => {})
