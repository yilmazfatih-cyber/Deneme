/**
 * Detay verisi: zorunlu `DetailModal` + isteğe bağlı `DetailInsights` (eşleşme, mikro türler, gerekçeli benzerler).
 * İkincisi hata verirse ya da null dönerse yalnız o parçalar gizlenir; pencere hiçbir zaman onun yüzünden bozulmaz.
 */
import { useEffect, useRef } from 'react'
import { useGql } from '../../api/hooks'
import { devbus } from '../../lib/devbus'
import type { DetailData, DetailVideo, InsightsData } from './types'

export interface DetailQuery {
  video: DetailVideo | null
  /** Yanıt geldi ama başlık yok (kaldırılmış ya da bu profilde görünmüyor) */
  notFound: boolean
  error: Error | null
  loading: boolean
  refetch: () => void
  insights: InsightsData['video']
}

export function useDetailQuery(videoId: number): DetailQuery {
  const valid = Number.isInteger(videoId) && videoId > 0
  const main = useGql<DetailData, { videoId: number }>('DetailModal', { videoId }, { enabled: valid, ttlMs: 30_000 })
  const extra = useGql<InsightsData, { videoId: number }>(
    'DetailInsights',
    { videoId },
    { enabled: valid && !!main.data?.video, ttlMs: 120_000 },
  )

  // Kaputun altı: isteğe bağlı katman düştüyse bunu sessizce bildir (arayüzde hata yok).
  const reported = useRef<string | null>(null)
  const extraError = extra.error
  useEffect(() => {
    if (!extraError || reported.current === `${videoId}`) return
    reported.current = `${videoId}`
    devbus.emit(
      'graphql',
      'DetailInsights gizlendi',
      { videoId, reason: extraError.message, effect: 'eşleşme, mikro türler ve gerekçeler gösterilmiyor' },
      { ok: false },
    )
  }, [extraError, videoId])

  const video = main.data?.video ?? null
  const insights = extra.data?.video && extra.data.video.videoId === videoId ? extra.data.video : null
  return {
    video,
    notFound: !valid || (main.data !== undefined && main.data.video === null),
    error: main.error,
    loading: main.loading,
    refetch: main.refetch,
    insights,
  }
}
