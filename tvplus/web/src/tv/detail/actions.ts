/**
 * Detay eylemleri: Listeme Ekle ↔ Listemde, Beğen. İyimser: yazı hemen değişir; sunucu reddederse geri alınır ve
 * sakin bir bildirim çıkar. Başarıda ilgili Falcor yolları ve GraphQL girdileri geçersiz kılınır (Listem satırı ana
 * sayfada belirir/kaybolur, Listem ekranı tazelenir).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { FalcorPath, JsonGraph } from '../../../../shared/types'
import { falcor } from '../../api/falcor'
import { gql } from '../../api/graphql'
import { queryCache } from '../../api/hooks'
import { peekBoot } from '../../api/session'
import { logEvent } from '../../telemetry/logger'
import { tvToast } from '../ui'

const PERSONAL_LEAVES = ['queue', 'bookmark', 'watchStatus', 'userRating', 'current']

/** Önbellekteki listelerden bağlamı verilenlerin kimlikleri (Listem: queue). */
function listIdsOf(graph: JsonGraph, contexts: readonly string[]): string[] {
  const lists = graph.lists as Record<string, unknown> | undefined
  if (!lists || typeof lists !== 'object' || '$type' in lists) return []
  const out: string[] = []
  for (const [id, node] of Object.entries(lists)) {
    const summary = (node as Record<string, unknown> | null)?.summary as {
      $type?: string
      value?: { context?: string }
    }
    if (summary?.$type === 'atom' && summary.value?.context && contexts.includes(summary.value.context)) out.push(id)
  }
  return out
}

/** Kişisel değişiklikten sonra göz atma ekranlarının ve listelerin tazelenmesi. */
export function invalidatePersonal(videoId: number, contexts: readonly string[]): void {
  const guid = peekBoot()?.activeProfile?.guid ?? null
  const paths: FalcorPath[] = []
  if (guid) paths.push(['lolomos', guid])
  for (const id of listIdsOf(falcor.getCache(), contexts)) paths.push(['lists', id])
  paths.push(['videos', videoId, PERSONAL_LEAVES])
  falcor.invalidate(...paths)
  queryCache.invalidate('TvMyList')
  queryCache.invalidate('Library')
  queryCache.invalidate('DetailModal')
}

export interface Toggle {
  on: boolean
  busy: boolean
  toggle: () => void
}

/** Listeme Ekle / Listemden Çıkar */
export function useMyListToggle(videoId: number, initial: boolean, tctx: string | null): Toggle {
  const [on, setOn] = useState(initial)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  useEffect(() => {
    if (!busyRef.current) setOn(initial)
  }, [initial, videoId])

  const toggle = useCallback(() => {
    if (busyRef.current) return
    const next = !on
    busyRef.current = true
    setBusy(true)
    setOn(next)
    const op = next ? gql('AddToPlaylist', { videoId, tctx: tctx ?? null }) : gql('RemoveFromPlaylist', { videoId })
    op.then(
      () => {
        logEvent('playlist', { videoId, action: next ? 'ADD_TO_PLAYLIST' : 'DELETE_FROM_PLAYLIST', from: 'tv' }, tctx)
        // Açık detay ekranının sorgusu geçersiz kılınmaz (ekran yeniden kurulup odak kaçmasın); detay her
        // açılışta zaten yeniden çekilir.
        invalidatePersonal(videoId, ['queue'])
        tvToast(next ? 'Listene eklendi' : 'Listenden çıkarıldı')
      },
      () => {
        setOn(!next)
        tvToast(next ? 'Listene eklenemedi. Tekrar dene.' : 'Listenden çıkarılamadı. Tekrar dene.')
      },
    ).finally(() => {
      busyRef.current = false
      setBusy(false)
    })
  }, [on, videoId, tctx])

  return { on, busy, toggle }
}

const isLiked = (r: string): boolean => r === 'THUMBS_UP' || r === 'THUMBS_WAY_UP'

/** Beğen (açık / kapalı) */
export function useLikeToggle(videoId: number, initial: string, tctx: string | null): Toggle {
  const [on, setOn] = useState(isLiked(initial))
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  useEffect(() => {
    if (!busyRef.current) setOn(isLiked(initial))
  }, [initial, videoId])

  const toggle = useCallback(() => {
    if (busyRef.current) return
    const next = !on
    const rating = next ? 'THUMBS_UP' : 'THUMBS_UNRATED'
    busyRef.current = true
    setBusy(true)
    setOn(next)
    gql('SetThumbRating', { videoId, rating })
      .then(
        () => {
          logEvent('rating', { videoId, rating, from: 'tv' }, tctx)
          invalidatePersonal(videoId, [])
          if (next) tvToast('Beğendin. Önerilerin buna göre güncellenir.')
        },
        () => {
          setOn(!next)
          tvToast('Beğeni kaydedilemedi. Tekrar dene.')
        },
      )
      .finally(() => {
        busyRef.current = false
        setBusy(false)
      })
  }, [on, videoId, tctx])

  return { on, busy, toggle }
}
