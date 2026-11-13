/**
 * Masaüstü detay penceresinin adres sözleşmesi: `?jbv=<videoId>` (+ isteğe bağlı `tctx`).
 * Kabuk, `jbv` görülünce features/detail `DetailModalOutlet`'i (bir kez) yükler ve çizer; pencere içeriği
 * `useDetailModal()` ile hangi başlığın açık olduğunu okur ve `close()` ile kapanır.
 *
 * Kapanış: pencere bu sayfadan (ileri gidişle) açıldıysa geçmişte bir adım geri gidilir (tarayıcının geri tuşuyla
 * aynı sonuç, ileri tuşu pencereyi yeniden açar); adres doğrudan açıldıysa `jbv` silinerek yerinde değiştirilir.
 */
import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { closeTitleHref, DETAIL_PARAM, TCTX_PARAM } from './links'

/** Pencerenin uygulama içinden açıldığı geçmiş girdileri (history.state anahtarları). */
const openedInApp = new Set<string>()

/** Kabuk çağırır: `jbv` bu gezintiyle (PUSH) geldiyse girdiyi işaretle. */
export function markDetailOpenedInApp(locationKey: string): void {
  openedInApp.add(locationKey)
}

export interface DetailModalState {
  /** Açık başlık; pencere kapalıysa null */
  videoId: string | null
  tctx: string | null
  /** Pencereyi kapatır (Esc, ✕, dışarı tıklama) */
  close: () => void
}

export function useDetailModal(): DetailModalState {
  const location = useLocation()
  const navigate = useNavigate()
  const params = new URLSearchParams(location.search)
  const videoId = params.get(DETAIL_PARAM)
  const tctx = params.get(TCTX_PARAM)
  const close = useCallback(() => {
    if (openedInApp.has(location.key)) {
      openedInApp.delete(location.key)
      navigate(-1)
    } else {
      navigate(closeTitleHref(location), { replace: true })
    }
  }, [location, navigate])
  return { videoId, tctx, close }
}
