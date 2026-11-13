/**
 * Kumanda ve yansıtma — YER TUTUCU. Cihaz deneyimi ekibi dolduracak; dışa aktarım adları SABİT:
 *   RemotePage  (#/kumanda)    UX_SPEC §5 "Kumanda"
 *   DevicesPage (#/cihazlar)   hesaptaki cihazlar, yeniden adlandır, oturumu kapat
 *   CastButton                 "TV'de izle" simgesi (masaüstü üst menü ve mobil üst çubuk; kabuk tembel yükler)
 *   NowOnTvBar                 mobilde alt sekmelerin üstündeki "Şu an TV'de" çubuğu (oynatan TV yoksa null)
 * Bu dosya İNCE kalmalı: kabuk CastButton / NowOnTvBar için bu modülü her sayfada yükler.
 */
import type { ReactElement } from 'react'
import { PagePlaceholder } from '../../app'
import { IconButton } from '../../ui'

export function RemotePage(): ReactElement {
  return <PagePlaceholder title="Kumanda" variant="grid" />
}

export function DevicesPage(): ReactElement {
  return <PagePlaceholder title="Cihazlar" variant="grid" />
}

/**
 * YER TUTUCU: her zaman görünür ve kumandaya gider. Asıl sürüm yalnız başka bir cihaz çevrimiçiyken görünür
 * (devices/bridge.ts `isCastAvailable`) ve cihaz seçiciyi açar.
 */
export function CastButton({ className }: { className?: string }): ReactElement {
  return <IconButton icon="cast" label="TV'de İzle" to="/kumanda" className={className} />
}

/** YER TUTUCU: oynatan TV yokken hiçbir şey çizmez. */
export function NowOnTvBar(): ReactElement | null {
  return null
}
