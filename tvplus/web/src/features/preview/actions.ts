/**
 * Ortak eylemler (önizleme kartı ve detay sayfası): Listeme ekle ↔ Listemde, Beğen.
 * İyimser: arayüz hemen değişir; sunucu reddederse geri alınır ve kısa bir bildirim çıkar (kırmızı yok).
 * Başarıda lolomo yolları geçersiz kılınır (sync.ts) — Listem satırı ana sayfada belirir/kaybolur.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { gql } from '../../api/graphql'
import { toast } from '../../design'
import { logEvent } from '../../telemetry/logger'
import { updatePreview } from './store'
import { onMyListChanged, onRatingChanged } from './sync'
import type { ThumbRatingName } from './types'

export interface ToggleState {
  on: boolean
  busy: boolean
  toggle: () => void
}

/** Listeme ekle / Listemden çıkar */
export function usePlaylistToggle(videoId: number, initial: boolean, tctx?: string | null): ToggleState {
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
    updatePreview(videoId, (v) => ({ ...v, isInPlaylist: next }))
    const op = next ? gql('AddToPlaylist', { videoId, tctx: tctx ?? null }) : gql('RemoveFromPlaylist', { videoId })
    op.then(
      () => {
        logEvent('playlist', { videoId, action: next ? 'ADD_TO_PLAYLIST' : 'DELETE_FROM_PLAYLIST' }, tctx)
        onMyListChanged(videoId)
      },
      () => {
        setOn(!next)
        updatePreview(videoId, (v) => ({ ...v, isInPlaylist: !next }))
        toast(next ? 'Listene eklenemedi. Tekrar dene.' : 'Listenden çıkarılamadı. Tekrar dene.')
      },
    ).finally(() => {
      busyRef.current = false
      setBusy(false)
    })
  }, [on, videoId, tctx])

  return { on, busy, toggle }
}

const liked = (r: ThumbRatingName) => r === 'THUMBS_UP' || r === 'THUMBS_WAY_UP'

/** Beğen (açık/kapalı) */
export function useThumbToggle(videoId: number, initial: ThumbRatingName, tctx?: string | null): ToggleState {
  const [on, setOn] = useState(liked(initial))
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  useEffect(() => {
    if (!busyRef.current) setOn(liked(initial))
  }, [initial, videoId])

  const toggle = useCallback(() => {
    if (busyRef.current) return
    const next = !on
    const rating: ThumbRatingName = next ? 'THUMBS_UP' : 'THUMBS_UNRATED'
    busyRef.current = true
    setBusy(true)
    setOn(next)
    updatePreview(videoId, (v) => ({ ...v, thumbRating: rating }))
    gql('SetThumbRating', { videoId, rating })
      .then(
        () => {
          logEvent('rating', { videoId, rating }, tctx)
          onRatingChanged(videoId)
        },
        () => {
          setOn(!next)
          updatePreview(videoId, (v) => ({ ...v, thumbRating: next ? 'THUMBS_UNRATED' : 'THUMBS_UP' }))
          toast('Beğeni kaydedilemedi. Tekrar dene.')
        },
      )
      .finally(() => {
        busyRef.current = false
        setBusy(false)
      })
  }, [on, videoId, tctx])

  return { on, busy, toggle }
}
