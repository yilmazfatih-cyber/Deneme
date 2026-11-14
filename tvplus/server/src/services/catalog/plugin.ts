import type { FastifyInstance } from 'fastify'
import { createCatalog } from './catalog'
import { loadContent, type ContentLog } from './load'

/** Katalog servisi: içerik klasörünü açılışta bir kez yükler (eksik/bozuk dosyada çökmez). */
export default async function plugin(app: FastifyInstance): Promise<void> {
  const log: ContentLog = (level, message) => app.log[level](message)
  const bundle = loadContent(app.config.contentDir, log)
  app.services.catalog = createCatalog(bundle, { contentDir: app.config.contentDir, log, services: () => app.services })
  const s = app.services.catalog.stats()
  app.log.info(`Katalog yüklendi: ${s.titles} başlık, ${s.playables} oynatılabilir, ${s.channels} kanal`)
}
