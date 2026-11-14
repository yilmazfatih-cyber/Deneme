/**
 * Kumanda ve yansıtma. Dışa aktarım adları SABİT:
 *   RemotePage  (#/kumanda)    UX_SPEC §5 "Kumanda" — telefonu TV kumandası yapar
 *   DevicesPage (#/cihazlar)   hesaptaki cihazlar, yeniden adlandır, oturumu kapat, TV'ye Bağlan
 *   CastButton                 "TV'de İzle" simgesi (masaüstü üst menü ve mobil üst çubuk; kabuk tembel yükler)
 *   NowOnTvBar                 mobilde alt sekmelerin üstündeki "Şu an TV'de" çubuğu (oynatan TV yoksa null)
 * Bu dosya İNCE kalır: kabuk CastButton / NowOnTvBar için bu modülü her sayfada yükler; sayfalar ayrı parçadır.
 * Modülün yüklenmesi yansıtma köprüsünü de kurar (devices/runtime.tsx installDeviceUi).
 */
import { lazy, Suspense, type ReactElement } from 'react'
import { PageSkeleton } from '../../app'

export { CastButton, NowOnTvBar } from '../../devices/NowOnTv'

const LazyRemote = lazy(() => import('./RemotePage'))
const LazyDevices = lazy(() => import('./DevicesPage'))

export function RemotePage(): ReactElement {
  return (
    <Suspense fallback={<PageSkeleton hero={false} />}>
      <LazyRemote />
    </Suspense>
  )
}

export function DevicesPage(): ReactElement {
  return (
    <Suspense fallback={<PageSkeleton hero={false} />}>
      <LazyDevices />
    </Suspense>
  )
}
