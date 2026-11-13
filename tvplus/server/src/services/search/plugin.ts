/**
 * Arama eklentisi (Netflix Pinot karşılığı). Kendi REST ucu yoktur: tek giriş GraphQL `searchPage`
 * (graphql/resolvers/search.ts). Dizin ilk istekte tembel kurulur; burada yalnızca açılışta ısıtılır.
 */
import type { FastifyInstance } from 'fastify'
import { getSearchIndex } from './engine'

export default async function plugin(app: FastifyInstance): Promise<void> {
  app.addHook('onReady', async () => {
    try {
      getSearchIndex(app.services)
    } catch (err) {
      // Katalog/yayın akışı henüz hazır değilse dizin ilk aramada kurulur.
      app.log.warn({ err }, 'arama dizini açılışta kurulamadı; ilk istekte denenecek')
    }
  })
}
