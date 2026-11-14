/**
 * İzleme verisi servisi (ViewingService; sözleşme server/src/kernel/intelligence.ts, docs/ICERIK_ZEKASI.md §5).
 * Kaynaktan bağımsız kanonik olaylar → dosya tabanlı eklemeli günlük (store.ts) → izleyici × başlık özetleri.
 * Uygulamanın kendi olayları köprüyle (bridge.ts) TVPLUS kaynağı olarak girer; Mixpanel ve sentetik örnek
 * `services/mixpanel` üzerinden gelir. REST uçları da oradadır (/api/studio/sources/*).
 */
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { deriveKey } from '../../kernel/config'
import { createAppEventsBridge } from './bridge'
import { createTitleResolver, referenceSeconds, type TitleResolver } from './resolve'
import { openViewingStore, type ViewingStore } from './store'

/** Mixpanel bağdaştırıcısının (aynı sahibin) kullandığı iç bağımlılıklar. */
export interface ViewingInternals {
  store: ViewingStore
  /** Katalogdan kurulan başlık eşleyici (ilk kullanımda kurulur) */
  resolver(): TitleResolver
  viewerKey: Buffer
  eventKey: Buffer
}
const internalsByApp = new WeakMap<FastifyInstance, ViewingInternals>()
export function viewingInternals(app: FastifyInstance): ViewingInternals {
  const i = internalsByApp.get(app)
  if (!i) throw new Error('İzleme verisi eklentisi bu uygulamada kurulmamış')
  return i
}

export default async function viewingPlugin(app: FastifyInstance): Promise<void> {
  const config = app.config
  const viewerKey = deriveKey(config, 'viewer-id')
  const eventKey = deriveKey(config, 'viewing-event-id')
  const store = await openViewingStore({
    dir: join(config.dataDir, 'viewing'),
    viewerKey,
    snapshotDelayMs: config.isTest ? 0 : 2000,
    realDataMinViewers: config.realDataMinViewers,
    // Tarayıcı içi sunucuda tek süreç vardır; kilidi tazelemek yalnız gereksiz kalıcılık yazımı üretir
    lockHeartbeatMs: config.staticHost ? 0 : undefined,
    log: (level, message) => app.log[level](message),
  })
  // İlgi puanının referans süresi istek anında katalogdan okunur
  store.setReference((titleId) => referenceSeconds(app.services.catalog.getTitle(titleId), store.observedDuration))

  let resolver: TitleResolver | null = null
  const internals: ViewingInternals = {
    store,
    resolver: () => (resolver ??= createTitleResolver(app.services.catalog.allTitles())),
    viewerKey,
    eventKey,
  }
  internalsByApp.set(app, internals)
  app.services.viewing = store

  // Uygulama olayları köprüsü: tüm eklentiler kurulduktan sonra abone olunur (kayıt sırasında başka servise dokunulmaz)
  const bridge = createAppEventsBridge({
    resolve: (videoId) => internals.resolver().byVideoId(videoId),
    viewerIdOfProfile: (guid) => store.viewerIdOfProfile(guid),
    eventKey,
  })
  let unsubscribe: (() => void) | null = null
  app.addHook('onReady', async () => {
    unsubscribe =
      app.services.events.subscribe?.((batch, profileGuid) => {
        const events = bridge.translate(batch, profileGuid)
        if (events.length) store.append(events)
      }) ?? null
  })
  app.addHook('onClose', async () => {
    unsubscribe?.()
    store.close()
  })
}
