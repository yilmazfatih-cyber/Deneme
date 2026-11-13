/**
 * POST /graphql — kalıcı sorgu ucu. Şema `shared/graphql/schema.graphql`, kayıt defteri
 * `shared/graphql/persisted.server.json` (npm run persisted ile üretilir), çözümleyiciler `./resolvers/index`.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { ROUTES } from '../../../shared/constants'
import { createGraphQLEngine, type PersistedRegistry } from './engine'
import { resolvers } from './resolvers/index'

export const GQL_OP_HEADER = 'x-tvplus-gql-op'

function loadRegistry(app: FastifyInstance, file: string): PersistedRegistry | null {
  if (!existsSync(file)) {
    app.log.error(`Kalıcı sorgu kayıt defteri yok (${file}). Önce \`npm run persisted\` çalıştırın.`)
    return null
  }
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as PersistedRegistry
    if (typeof raw.version !== 'number' || !raw.operations || typeof raw.operations !== 'object') throw new Error('biçim')
    return raw
  } catch (err) {
    app.log.error({ err }, `Kalıcı sorgu kayıt defteri okunamadı (${file}). \`npm run persisted\` ile yeniden üretin.`)
    return null
  }
}

export default async function plugin(app: FastifyInstance): Promise<void> {
  const dir = join(app.config.rootDir, 'shared', 'graphql')
  const typeDefs = readFileSync(join(dir, 'schema.graphql'), 'utf8')
  const engine = createGraphQLEngine({
    typeDefs,
    resolvers,
    persisted: loadRegistry(app, join(dir, 'persisted.server.json')),
    log: (level, msg, detail) => app.log[level](detail instanceof Error ? { err: detail } : { detail }, msg),
  })

  app.post(ROUTES.GRAPHQL, async (req, reply) => {
    const result = await engine.handle({
      body: req.body,
      passport: req.passport,
      makeContext: () => ({
        req,
        passport: req.passport,
        trace: req.trace,
        services: app.services,
        config: app.config,
        cache: new Map(),
      }),
    })
    if (result.operationName) reply.header(GQL_OP_HEADER, result.operationName)
    reply.header('cache-control', 'no-store')
    return reply.code(result.statusCode).send(result.body)
  })
}
