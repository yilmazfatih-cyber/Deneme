/**
 * Oynatıcının (kehribar) diğer web modüllerine açtığı sözleşme. Dışa aktarılan adlar ve imzalar SABİTTİR.
 * Arayüz ve motor (Netflix'te Cadmium gibi) ayrı bir parça olarak istek anında yüklenir; ağ katmanı
 * (FTL, MSL, manifest ön hazırlığı) küçüktür ve ana paketle gelir.
 */
import { createElement, lazy, Suspense, type ReactElement } from 'react'
import { prefetchManifest as prefetch } from './net/manifest'
import { startNetworkProbing as startProbing } from './net/ftl'

const LazyWatchPage = lazy(() => import('./ui/WatchPage'))
const LazyPreviewPlayer = lazy(() => import('./ui/PreviewPlayer'))

/** Tam ekran oynatma sayfası. Yol: #/izle/:viewableId  (?tctx=…&baslat=bastan&kaynak=OWN_CDN|YOUTUBE) */
export function WatchPage(): ReactElement {
  return createElement(
    Suspense,
    {
      fallback: createElement('div', {
        style: { position: 'fixed', inset: 0, background: '#000' },
        'aria-busy': 'true',
      }),
    },
    createElement(LazyWatchPage),
  )
}

/** Kart önizlemesi: sessiz, kısa tanıtım oynatımı. Üst kutuyu doldurur (position:absolute; inset:0). */
export function PreviewPlayer(props: {
  viewableId: string
  offsetSec: number
  muted?: boolean
  onPlaying?: () => void
  onError?: () => void
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
