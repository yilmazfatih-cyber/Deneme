/**
 * Detay sayfasının birincil eylem durum makinesi (netflix_patterns §3 ilke 8: tek dolu düğme, etiket duruma göre).
 *   PLAYABLE + yarım kalmış   → "Devam et" (kalan süreyle) + ikincil "Baştan başlat"
 *   PLAYABLE                  → "İzle" (dizide sıradaki bölüm)
 *   UPSELL                    → "Paketi incele" (alt sayfa: gerekçe, paket adı, "Paketimde benzerleri")
 *   diğer (cihaz, pencere…)   → "Benzerlerini gör" + tek satır gerekçe (tam ekran hata yok)
 * Saf işlev; birim testi primaryAction.test.ts.
 */
import { isInProgress, joinMeta, playPath, remainingText } from '../preview'

export interface DetailActionInput {
  typename: 'Movie' | 'Show' | 'Episode' | 'Supplemental'
  videoId: number
  access: { state: string; reasonText: string | null; requiredProductName?: string | null; requiredProduct?: string | null }
  bookmark: { positionSec: number; runtimeSec?: number | null; progress: number } | null
  runtimeSec: number | null
  currentEpisode?: {
    videoId: number
    numberLabel?: string
    runtimeSec?: number | null
    bookmark: { positionSec: number; runtimeSec?: number | null; progress: number } | null
  } | null
  tctx: string | null
}

export type PrimaryAction =
  | { kind: 'play'; label: 'İzle'; to: string; playVideoId: number; hint: string | null; restartTo: null }
  | { kind: 'resume'; label: 'Devam et'; to: string; playVideoId: number; hint: string | null; restartTo: string }
  | { kind: 'upsell'; label: 'Paketi incele'; productName: string | null; reasonText: string | null }
  | { kind: 'unavailable'; label: 'Benzerlerini gör'; reasonText: string | null }

export function primaryActionOf(input: DetailActionInput): PrimaryAction {
  const { access } = input
  if (access.state === 'UPSELL') {
    return { kind: 'upsell', label: 'Paketi incele', productName: access.requiredProductName ?? access.requiredProduct ?? null, reasonText: access.reasonText }
  }
  if (access.state !== 'PLAYABLE') return { kind: 'unavailable', label: 'Benzerlerini gör', reasonText: access.reasonText }

  const isShow = input.typename === 'Show'
  const ep = isShow ? (input.currentEpisode ?? null) : null
  if (isShow && !ep) return { kind: 'unavailable', label: 'Benzerlerini gör', reasonText: 'Bu dizinin bölümü henüz yok' }
  const playVideoId = ep ? ep.videoId : input.videoId
  const bm = ep ? ep.bookmark : input.bookmark
  const runtime = ep ? (ep.runtimeSec ?? bm?.runtimeSec ?? null) : (input.runtimeSec ?? bm?.runtimeSec ?? null)
  const label = ep?.numberLabel ?? null

  if (isInProgress(bm)) {
    return {
      kind: 'resume',
      label: 'Devam et',
      to: playPath(playVideoId, input.tctx),
      playVideoId,
      hint: joinMeta([label, remainingText(bm!.positionSec, runtime)]) || null,
      restartTo: playPath(playVideoId, input.tctx, { fromStart: true }),
    }
  }
  return { kind: 'play', label: 'İzle', to: playPath(playVideoId, input.tctx), playVideoId, hint: label, restartTo: null }
}
