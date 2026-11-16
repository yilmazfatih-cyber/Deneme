/**
 * Afiş seçimi eklentisi: `app.services.artwork` (service.ts) ve uygulama olaylarından öğrenme.
 * Olay servisinin kabul ettiği her paket (POST /log/web/cl/1) izleme verisi köprüsüyle aynı yoldan dinlenir:
 *   impression / click → record(profil, başlık, olay[, çeşit])
 * Başlık `data.videoId`, `data.viewableId` ya da `data.entityIds` girdilerinden ('Video:<id>' ya da çeşit kimliği
 * 'Video:<id>~<anahtar>') okunur; isteğe bağlı `data.artworkKey` gösterilen çeşidi bildirir. Profilsiz paketler sayılmaz.
 */
import type { FastifyInstance } from 'fastify'
import type { EventBatch } from '../../../../shared/types'
import { ARTWORK_KEY_RE, parseVideoEntity } from './ids'
import { createArtworkService } from './service'

const MAX_ENTITIES_PER_EVENT = 40

export interface ArtworkEvent {
  videoId: number
  event: 'impression' | 'click'
  /** Olay gösterilen çeşidi bildirdiyse ('' = varsayılan); bildirmediyse null */
  key: string | null
}

/** Paketteki gösterim ve tıklamaları çıkarır (saf). */
export function artworkEventsOf(batch: EventBatch): ArtworkEvent[] {
  const out: ArtworkEvent[] = []
  for (const e of batch.events ?? []) {
    if (e.name !== 'impression' && e.name !== 'click') continue
    const event = e.name
    const data = (e.data ?? {}) as Record<string, unknown>
    const explicit =
      typeof data.artworkKey === 'string' && (data.artworkKey === '' || ARTWORK_KEY_RE.test(data.artworkKey))
        ? data.artworkKey
        : null
    const vid = data.videoId
    if (typeof vid === 'number' && Number.isSafeInteger(vid) && vid > 0) {
      out.push({ videoId: vid, event, key: explicit })
      continue
    }
    const viewable = typeof data.viewableId === 'string' ? parseVideoEntity(data.viewableId) : null
    if (viewable) {
      out.push({ videoId: viewable.videoId, event, key: viewable.key || explicit })
      continue
    }
    const ids = Array.isArray(data.entityIds) ? data.entityIds.slice(0, MAX_ENTITIES_PER_EVENT) : []
    for (const ent of ids) {
      const p = typeof ent === 'string' ? parseVideoEntity(ent) : null
      // Çeşit kimliği gösterilen görseli kesin bildirir; düz 'Video:<id>' atamaya bırakılır
      if (p) out.push({ videoId: p.videoId, event, key: p.key ? p.key : null })
    }
  }
  return out
}

export default async function artworkPlugin(app: FastifyInstance): Promise<void> {
  const service = createArtworkService({ config: app.config, services: () => app.services })
  app.services.artwork = service

  let unsubscribe: (() => void) | null = null
  app.addHook('onReady', async () => {
    unsubscribe =
      app.services.events.subscribe?.((batch, profileGuid) => {
        if (!profileGuid || !service.enabled()) return
        for (const ev of artworkEventsOf(batch)) service.record(profileGuid, ev.videoId, ev.event, ev.key)
      }) ?? null
  })
  app.addHook('onClose', async () => {
    unsubscribe?.()
    service.flush()
  })
}
