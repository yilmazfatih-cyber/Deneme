/**
 * Oynatıcının (kehribar) diğer web modüllerine açtığı sözleşme. Dışa aktarılan adlar ve imzalar SABİTTİR.
 * Arayüz ve motor (Netflix'te Cadmium gibi) ayrı bir parça olarak istek anında yüklenir; ağ katmanı
 * (FTL, MSL, manifest ön hazırlığı) küçüktür ve ana paketle gelir.
 */
import { createElement, lazy, Suspense, type ReactElement } from 'react'
import { prefetchManifest as prefetch } from './net/manifest'
import { startNetworkProbing as startProbing } from './net/ftl'

export { playerRemote } from './remote'
export type { PlayerSnapshot, PlayerCommand } from './remote'

const LazyWatchPage = lazy(() => import('./ui/WatchPage'))
const LazyPreviewPlayer = lazy(() => import('./ui/PreviewPlayer'))

/**
 * Tam ekran oynatma sayfası. Yol: #/izle/:viewableId  (?tctx=…&baslat=bastan&kaynak=OWN_CDN|YOUTUBE&konum=<sn>)
 * `chrome`: 'auto' (varsayılan; ekran biçimi) | 'desktop' | 'mobile' | 'tv' (yalnız kumanda tuşları).
 * `exitTo`: çıkışta gidilecek yol (verilmezse geçmişte geri). Dış denetim: `playerRemote`.
 */
export function WatchPage(
  props: { chrome?: 'auto' | 'desktop' | 'mobile' | 'tv'; exitTo?: string } = {},
): ReactElement {
  return createElement(
    Suspense,
    {
      fallback: createElement('div', {
        style: { position: 'fixed', inset: 0, background: '#000' },
        'aria-busy': 'true',
      }),
    },
    createElement(LazyWatchPage, props),
  )
}

/** Kart önizlemesi: sessiz, kısa tanıtım oynatımı. Üst kutuyu doldurur (position:absolute; inset:0). */
export function PreviewPlayer(props: {
  viewableId: string
  offsetSec: number
  muted?: boolean
  onPlaying?: () => void
  onError?: () => void
  /** En uzun oynatma (sn); varsayılan 30, null → söküline dek (canlı kanal önizlemesi) */
  maxSec?: number | null
  /** Kendiliğinden durunca ya da yayın bitince */
  onEnded?: () => void
  /** 'contain' (varsayılan) | 'cover' */
  fit?: 'contain' | 'cover'
}): ReactElement | null {
  return createElement(Suspense, { fallback: null }, createElement(LazyPreviewPlayer, props))
}

/** Manifest ön hazırlığı (vitrin, devam et'in ilk öğesi, komşu kanal). Tekrar çağrılabilir; asla fırlatmaz. */
export async function prefetchManifest(viewableId: string): Promise<void> {
  await prefetch(viewableId)
}

/** FTL ağ yoklamasını başlatır (profil seçildikten sonra bir kez). Tekrar çağrılabilir. */
export function startNetworkProbing(): void {
  startProbing()
}
