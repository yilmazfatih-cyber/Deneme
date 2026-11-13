/**
 * POST /api/member/pathEvaluator — Falcor JSON Graph ucu (Netflix Shakti `pathEvaluator`).
 * Gövde form kodlu: yinelenen `path=<JSON dizi>` + `authURL=<belirteç>`; JSON `{ paths: [...] }` da kabul edilir.
 * Sorgu dizgesi yetenek bayraklarıdır (webp, isTop10Supported, withSize, materialize, …).
 */
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { ROUTES } from '../../../shared/constants'
import type { FalcorPath } from '../../../shared/types'
import { httpError } from '../gateway/errors'
import { evaluatePaths } from './engine'
import { FalcorPathError, normalizePathSet, parsePathString } from './paths'

const MAX_PATH_SETS = 200

/** İstek gövdesinden yol kümelerini çıkarır. */
export function readPathSets(body: unknown): FalcorPath[] {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new FalcorPathError('INVALID_PATH', 'İstek gövdesinde yol yok.')
  }
  const b = body as Record<string, unknown>
  const out: FalcorPath[] = []
  if (b.path !== undefined) {
    const list = Array.isArray(b.path) ? b.path : [b.path]
    for (const s of list) {
      if (typeof s !== 'string') throw new FalcorPathError('INVALID_PATH', 'Yol dizgesi bekleniyordu.')
      out.push(parsePathString(s))
    }
  }
  if (b.paths !== undefined) {
    if (typeof b.paths === 'string') {
      // Form gövdesinde tek parça `paths=[[…],[…]]`
      let raw: unknown
      try {
        raw = JSON.parse(b.paths)
      } catch {
        throw new FalcorPathError('INVALID_PATH', 'Yollar JSON olarak okunamadı.')
      }
      if (!Array.isArray(raw)) throw new FalcorPathError('INVALID_PATH', 'Yollar dizi olmalı.')
      for (const p of raw) out.push(normalizePathSet(p))
    } else if (Array.isArray(b.paths)) {
      for (const p of b.paths) out.push(normalizePathSet(p))
    } else throw new FalcorPathError('INVALID_PATH', 'Yollar dizi olmalı.')
  }
  if (out.length === 0) throw new FalcorPathError('INVALID_PATH', 'İstek gövdesinde yol yok.')
  if (out.length > MAX_PATH_SETS) throw new FalcorPathError('PATH_EXPANSION_LIMIT', 'İstek çok fazla yol içeriyor.')
  return out
}

function flagsOf(req: FastifyRequest): Record<string, string> {
  const q = (req.query ?? {}) as Record<string, unknown>
  const flags: Record<string, string> = {}
  for (const [k, v] of Object.entries(q)) {
    const s = Array.isArray(v) ? v[v.length - 1] : v
    if (typeof s === 'string') flags[k] = s
  }
  return flags
}

export default async function plugin(app: FastifyInstance): Promise<void> {
  app.post(ROUTES.PATH_EVALUATOR, async (req, reply) => {
    const passport = req.passport
    if (passport.membershipStatus !== 'CURRENT_MEMBER') throw httpError(401, 'UNAUTHENTICATED', 'Önce giriş yapmalısınız.')
    if (!passport.profile) throw httpError(403, 'PROFILE_REQUIRED', 'Önce bir profil seçin.')
    if (!passport.authURLVerified) throw httpError(403, 'CSRF_FAILED', 'Oturum belirteci geçersiz; sayfayı yenileyin.')

    let paths: FalcorPath[]
    try {
      paths = readPathSets(req.body)
    } catch (err) {
      if (err instanceof FalcorPathError) throw httpError(400, err.code, err.message)
      throw err
    }
    const flags = flagsOf(req)
    try {
      const result = await evaluatePaths({ req, passport, services: app.services, config: app.config, flags }, paths)
      reply.header('cache-control', 'no-store')
      return result
    } catch (err) {
      if (err instanceof FalcorPathError) throw httpError(400, err.code, err.message)
      throw err
    }
  })
}
