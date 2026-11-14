/**
 * Arama eklentisi (Netflix Pinot karşılığı). Kendi REST ucu yoktur: girişler GraphQL `searchPage`,
 * `searchPredictions`, `popularSearches`, `recordSearchFeedback` (graphql/resolvers/search.ts). Dizin ilk istekte tembel kurulur; burada yalnızca açılışta ısıtılır.
 */
import type { FastifyInstance } from 'fastify'
import { getSearchIndex } from './engine'
import { searchModel } from './model/runtime'

export default async function plugin(app: FastifyInstance): Promise<void> {
  // Tahmin modelinin kalıcı durumu (.data/search-model.json) açılışta yüklenir; kapanışta bekleyen yazım boşaltılır.
  const model = searchModel(app.services, app.config)
  app.addHook('onClose', async () => {
    if (!app.config.isTest) model.store.flush()
  })
  app.addHook('onReady', async () => {
    try {
      getSearchIndex(app.services)
    } catch (err) {
      // Katalog/yayın akışı henüz hazır değilse dizin ilk aramada kurulur.
      app.log.warn({ err }, 'arama dizini açılışta kurulamadı; ilk istekte denenecek')
    }
  })
}
