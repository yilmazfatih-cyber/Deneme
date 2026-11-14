/**
 * Kişisel eylemler: Listem (＋ / ✓) ve Beğen. İyimser: arayüz hemen değişir; sunucu reddederse geri alınır ve
 * sakin bir kısa bildirim çıkar (kırmızı yok).
 *
 * Aynı başlık aynı anda birkaç yerde görünebilir (pencerenin üstü, "Benzerleri" kartı, Listem ızgarası): son
 * kararlar küçük bir ortak depoda tutulur, böylece hepsi aynı durumu gösterir. Sunucu yanıtı kararla buluşunca ya da
 * karar eskiyince (sunucu artık doğruyu söylüyor) kayıt düşer.
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { gql } from '../../api/graphql'
import { logEvent } from '../../telemetry/logger'
import { toast } from '../../ui'
import { afterMyListChange, afterRatingChange } from './sync'
import type { ThumbRatingName } from './types'

interface Override {
  value: boolean
  at: number
  pending: boolean
}

/** Karar bu süreden sonra sunucu verisine bırakılır (başka ekrandan yapılan değişiklik görünür olsun). */
const OVERRIDE_TTL_MS = 20_000

function createOverrideStore() {
  const map = new Map<number, Override>()
  const listeners = new Set<() => void>()
  let version = 0
  const emit = () => {
    version++
    for (const l of listeners) l()
  }
  return {
    subscribe(fn: () => void) {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },
    version: () => version,
    get(id: number): Override | undefined {
      const o = map.get(id)
      if (o && !o.pending && Date.now() - o.at > OVERRIDE_TTL_MS) return undefined
      return o
    },
    set(id: number, o: Override) {
      map.set(id, o)
      emit()
    },
    settle(id: number) {
      const o = map.get(id)
      if (o) map.set(id, { ...o, pending: false, at: Date.now() })
      emit()
    },
    drop(id: number) {
      if (map.delete(id)) emit()
    },
  }
}

const listStore = createOverrideStore()
const likeStore = createOverrideStore()

export interface ToggleState {
  on: boolean
  busy: boolean
  toggle: () => void
}

function useOverride(store: ReturnType<typeof createOverrideStore>, videoId: number, server: boolean) {
  useSyncExternalStore(store.subscribe, store.version, store.version)
  const o = store.get(videoId)
  // Sunucu kararla buluştu: kaydı bırak.
  useEffect(() => {
    if (o && !o.pending && o.value === server) store.drop(videoId)
  }, [o, server, store, videoId])
  return o
}

/** Listeme ekle / Listemden çıkar. `server`: sorgudaki isInPlaylist. */
export function useMyListToggle(videoId: number, server: boolean, tctx?: string | null): ToggleState {
  const o = useOverride(listStore, videoId, server)
  const on = o ? o.value : server
  const busy = !!o?.pending
  const toggle = useCallback(() => {
    void setInMyList(videoId, !on, tctx)
  }, [videoId, on, tctx])
  return { on, busy, toggle }
}

/** Listem değişikliği (Listem sayfasındaki "Geri al" da bunu kullanır). Başarıda true. */
export async function setInMyList(videoId: number, next: boolean, tctx?: string | null): Promise<boolean> {
  if (listStore.get(videoId)?.pending) return false
  listStore.set(videoId, { value: next, at: Date.now(), pending: true })
  try {
    if (next) await gql('AddToPlaylist', { videoId, tctx: tctx ?? null })
    else await gql('RemoveFromPlaylist', { videoId })
    logEvent('playlist', { videoId, action: next ? 'ADD_TO_PLAYLIST' : 'DELETE_FROM_PLAYLIST' }, tctx)
    listStore.settle(videoId)
    afterMyListChange(videoId)
    return true
  } catch {
    listStore.drop(videoId)
    toast(next ? 'Listene eklenemedi. Tekrar dene.' : 'Listenden çıkarılamadı. Tekrar dene.')
    return false
  }
}

const isLiked = (r: ThumbRatingName | null | undefined) => r === 'THUMBS_UP' || r === 'THUMBS_WAY_UP'

/** Beğen (açık/kapalı). */
export function useLikeToggle(videoId: number, rating: ThumbRatingName, tctx?: string | null): ToggleState {
  const server = isLiked(rating)
  const o = useOverride(likeStore, videoId, server)
  const on = o ? o.value : server
  const busy = !!o?.pending
  const toggle = useCallback(() => {
    if (likeStore.get(videoId)?.pending) return
    const next = !on
    const value: ThumbRatingName = next ? 'THUMBS_UP' : 'THUMBS_UNRATED'
    likeStore.set(videoId, { value: next, at: Date.now(), pending: true })
    gql('SetThumbRating', { videoId, rating: value }).then(
      () => {
        logEvent('rating', { videoId, rating: value }, tctx)
        likeStore.settle(videoId)
        afterRatingChange(videoId)
      },
      () => {
        likeStore.drop(videoId)
        toast('Beğeni kaydedilemedi. Tekrar dene.')
      },
    )
  }, [videoId, on, tctx])
  return { on, busy, toggle }
}
