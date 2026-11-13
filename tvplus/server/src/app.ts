/**
 * Uygulama kurulumu: tek kapı (gateway) + servis eklentileri. Sıra önemlidir:
 * izleme → gövde/çerez ayrıştırma → kimlik (pasaport) → servisler → API uçları → SPA kabuğu.
 * Her eklenti kendi klasöründedir ve tek sahibi vardır (bkz. docs/MIMARI.md).
 */
import cookie from '@fastify/cookie'
import formbody from '@fastify/formbody'
import Fastify, { type FastifyInstance } from 'fastify'
import falcorPlugin from './falcor/plugin'
import errorsPlugin from './gateway/errors'
import shellPlugin from './gateway/shell'
import tracingPlugin from './gateway/tracing'
import graphqlPlugin from './graphql/plugin'
import { loadConfig, type AppConfig } from './kernel/config'
import type { Services } from './kernel/services'
import catalogPlugin from './services/catalog/plugin'
import debugPlugin from './services/debug/plugin'
import discoveryPlugin from './services/discovery/plugin'
import entitlementPlugin from './services/entitlement/plugin'
import epgPlugin from './services/epg/plugin'
import eventsPlugin from './services/events/plugin'
import ftlPlugin from './services/ftl/plugin'
import identityPlugin from './services/identity/plugin'
import imagePlugin from './services/image/plugin'
import notificationsPlugin from './services/notifications/plugin'
import ocaPlugin from './services/oca/plugin'
import playbackPlugin from './services/playback/plugin'
import progressPlugin from './services/progress/plugin'
import searchPlugin from './services/search/plugin'
import subtitlesPlugin from './services/subtitles/plugin'

export async function buildApp(overrides: Partial<AppConfig> = {}): Promise<FastifyInstance> {
  const config = loadConfig(overrides)
  const app = Fastify({
    logger: config.logLevel === 'silent' || config.isTest ? false : { level: config.logLevel },
    bodyLimit: 2 * 1024 * 1024,
    trustProxy: true,
  })
  app.decorate('config', config)
  app.decorate('services', {} as Services)

  // Eklentiler kapsüllenmez: hepsi aynı örneğe kanca/uç ekler (fastify-plugin'e gerek kalmasın diye doğrudan çağrılır).
  await tracingPlugin(app)
  await errorsPlugin(app)
  await app.register(cookie)
  await app.register(formbody)

  await identityPlugin(app)
  await eventsPlugin(app)
  await notificationsPlugin(app)

  await catalogPlugin(app)
  await entitlementPlugin(app)
  await epgPlugin(app)
  await progressPlugin(app)
  await discoveryPlugin(app)
  await searchPlugin(app)

  await playbackPlugin(app)
  await ocaPlugin(app)
  await ftlPlugin(app)
  await subtitlesPlugin(app)
  await imagePlugin(app)

  await graphqlPlugin(app)
  await falcorPlugin(app)
  await debugPlugin(app)
  await shellPlugin(app)

  return app
}
