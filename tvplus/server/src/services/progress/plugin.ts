import type { FastifyInstance } from 'fastify'
import { createStore } from '../../kernel/store'
import { createProgressService, initialMemberState } from './progress'

/** Üye durumu servisi (yer imleri, Listem, puanlar, kanallar, son aramalar). */
export default async function plugin(app: FastifyInstance): Promise<void> {
  const store = createStore(app.config, 'member-state', initialMemberState)
  app.services.progress = createProgressService(
    store,
    () => app.services,
    () => app.services.epg?.now() ?? new Date(),
  )
  app.addHook('onClose', async () => {
    if (!app.config.isTest) store.flush()
  })
}
