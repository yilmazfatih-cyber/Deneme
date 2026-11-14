/**
 * Önizleme verisi deposu: tek PreviewCache + MiniModalQuery isteği + devbus bildirimleri.
 * Uygulama genelinde tektir; böylece ana sayfada ön yüklenen satır, aynı kartın başka ekrandaki önizlemesine de yarar.
 */
import { useSyncExternalStore } from 'react'
import { gql } from '../../api/graphql'
import { onBootChange } from '../../api/session'
import { devbus } from '../../lib/devbus'
import { PreviewCache } from './cache'
import type { MiniModalData, MiniModalVideo } from './types'

export const previewCache = new PreviewCache<MiniModalVideo>()

let version = 0
const listeners = new Set<() => void>()
const failed = new Map<number, number>()

function notify(): void {
  version++
  listeners.forEach((l) => l())
}
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
const getVersion = () => version

// Profil değişince başka profilin önizleme verisi (Listem, beğeni) kalmasın.
let lastGuid: string | null | undefined
onBootChange((b) => {
  const g = b.activeProfile?.guid ?? null
  if (lastGuid !== undefined && g !== lastGuid) clearPreviews()
  lastGuid = g
})

export function clearPreviews(): void {
  previewCache.clear()
  failed.clear()
  notify()
}

/**
 * Bir satırda önizleme açılıyor: satırda yüklü TÜM kimlikler için (önbellekte olmayanlar) tek MiniModalQuery.
 * Aynı satırda sonraki kartlar önbellekten gelir (devbus `cache`).
 */
export function requestRowPreview(rowId: string, rowVideoIds: readonly number[], videoId: number): void {
  const now = Date.now()
  const plan = previewCache.planRow(rowId, rowVideoIds, videoId, now)
  if (plan.hit) {
    const hit = previewCache.get(videoId, now)
    devbus.emit('cache', 'MiniModal: isabet', {
      key: `MiniModal|${videoId}`,
      rowId,
      expires: now - (hit?.ageMs ?? 0) + 5 * 60_000,
      ageMs: hit?.ageMs ?? 0,
    })
    return
  }
  if (!plan.fetch.length) return // yolda; sonuç gelince çizilir
  const ids = plan.fetch
  previewCache.begin(ids)
  failed.delete(videoId)
  devbus.emit('prefetch', 'MiniModal satır', { rowId, videoIds: ids })
  notify()
  gql<MiniModalData, { videoIds: number[]; uiContext: 'BOB' }>('MiniModalQuery', {
    videoIds: ids,
    uiContext: 'BOB',
  }).then(
    (data) => {
      const values = new Map<number, MiniModalVideo>()
      for (const v of data.videos ?? []) if (v) values.set(v.videoId, v)
      previewCache.settle(ids, values, Date.now())
      for (const id of ids) if (!values.has(id)) failed.set(id, Date.now())
      notify()
    },
    () => {
      previewCache.settle(ids, new Map(), Date.now())
      for (const id of ids) failed.set(id, Date.now())
      notify()
    },
  )
}

/** İyimser güncelleme (önizleme kartı ve detay aynı veriyi görür). */
export function updatePreview(videoId: number, fn: (v: MiniModalVideo) => MiniModalVideo): void {
  if (previewCache.update(videoId, fn)) notify()
}

export interface PreviewVideoState {
  video: MiniModalVideo | null
  loading: boolean
  failed: boolean
}

export function usePreviewVideo(videoId: number | null): PreviewVideoState {
  useSyncExternalStore(subscribe, getVersion, getVersion)
  if (videoId === null) return { video: null, loading: false, failed: false }
  const hit = previewCache.get(videoId, Date.now())
  return {
    video: hit?.value ?? null,
    loading: !hit && previewCache.isInflight(videoId),
    failed: !hit && failed.has(videoId),
  }
}
