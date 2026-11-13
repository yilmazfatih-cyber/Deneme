/**
 * Oynatıcının (kehribar) diğer web modüllerine açtığı sözleşme. İSKELET — oynatıcı ajanı gerçek uygulamayla değiştirecek;
 * dışa aktarılan adlar ve imzalar SABİTTİR.
 */
import { createElement, type ReactElement } from 'react'

/** Tam ekran oynatma sayfası. Yol: #/izle/:viewableId  (?tctx=…&baslat=bastan&kaynak=OWN_CDN|YOUTUBE) */
export function WatchPage(): ReactElement {
  return createElement('main', { style: { padding: 24 } }, 'Oynatıcı hazırlanıyor…')
}

/** Kart önizlemesi: sessiz, kısa tanıtım oynatımı. Üst kutuyu doldurur (position:absolute; inset:0). */
export function PreviewPlayer(_props: {
  viewableId: string
  offsetSec: number
  muted?: boolean
  onPlaying?: () => void
  onError?: () => void
}): ReactElement | null {
  return null
}

/** Manifest ön hazırlığı (vitrin, devam et'in ilk öğesi, komşu kanal). Tekrar çağrılabilir; asla fırlatmaz. */
export async function prefetchManifest(_viewableId: string): Promise<void> {}

/** FTL ağ yoklamasını başlatır (profil seçildikten sonra bir kez). Tekrar çağrılabilir. */
export function startNetworkProbing(): void {}
