/**
 * Masaüstü detay penceresinin adres sözleşmesi: `?jbv=<videoId>` (+ isteğe bağlı `tctx`).
 * Kabuk, `jbv` görülünce features/detail `DetailModalOutlet`'i (bir kez) yükler ve çizer; pencere içeriği
 * `useDetailModal()` ile hangi başlığın açık olduğunu okur, `switchTo()` ile pencerede başka başlığa geçer ve
 * `close()` ile kapanır.
 *
 * Geçmiş:
 *   - Pencere bu sayfadan (ileri gidişle) açıldıysa kapanışta geçmişte bir adım geri gidilir (tarayıcının geri
 *     tuşuyla aynı sonuç); adres doğrudan açıldıysa `jbv` silinerek yerinde değiştirilir.
 *   - `switchTo` (Benzerleri'nden başka başlık) geçerli girdiyi YERİNDE değiştirir: yinelenen girdi oluşmaz ve
 *     "uygulama içinden açıldı" bilgisi yeni girdiye taşınır, böylece kapanış yine alttaki sayfaya döner.
 */
import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { detectFormFactor } from '../lib/formFactor'
import { buildTitleHref, closeTitleHref, DETAIL_PARAM, TCTX_PARAM, type LocationLike } from './links'

/** Pencerenin uygulama içinden açıldığı geçmiş girdileri (react-router konum anahtarları). */
const openedInApp = new Set<string>()
/** `switchTo` ile değiştirilen girdinin taşıdığı durum (history.state.usr) */
const IN_APP_STATE = 'tvpDetailInApp'

/** Kabuk çağırır: `jbv` bu gezintiyle (PUSH) geldiyse girdiyi işaretle. */
export function markDetailOpenedInApp(locationKey: string): void {
  openedInApp.add(locationKey)
}

function stateFlag(state: unknown): boolean {
  return typeof state === 'object' && state !== null && (state as Record<string, unknown>)[IN_APP_STATE] === true
}

/**
 * Başka başlığa geçiş adresi (saf; birim testi detailModal.test.ts): aynı sayfa, yeni `jbv`, yeni ya da düşen `tctx`.
 * Masaüstü dışında tam sayfa detay yolu döner.
 */
export function switchTitleHref(
  current: LocationLike,
  videoId: string | number,
  tctx?: string | null,
  formFactor: 'desktop' | 'mobile' | 'tv' = 'desktop',
): string {
  return buildTitleHref(formFactor, current, videoId, tctx)
}

export interface DetailModalState {
  /** Açık başlık; pencere kapalıysa null */
  videoId: string | null
  tctx: string | null
  /** Pencereyi kapatır (Esc, ✕, dışarı tıklama) */
  close: () => void
  /** Pencere açıkken başka başlığa geçer (geçerli geçmiş girdisi yerinde değişir) */
  switchTo: (videoId: string | number, tctx?: string | null) => void
}

export function useDetailModal(): DetailModalState {
  const location = useLocation()
  const navigate = useNavigate()
  const params = new URLSearchParams(location.search)
  const videoId = params.get(DETAIL_PARAM)
  const tctx = params.get(TCTX_PARAM)

  const inApp = openedInApp.has(location.key) || stateFlag(location.state)

  const close = useCallback(() => {
    if (inApp) {
      openedInApp.delete(location.key)
      navigate(-1)
    } else {
      navigate(closeTitleHref(location), { replace: true })
    }
  }, [inApp, location, navigate])

  const switchTo = useCallback(
    (nextId: string | number, nextTctx?: string | null) => {
      const ff = detectFormFactor()
      const href = switchTitleHref(location, nextId, nextTctx, ff)
      if (ff !== 'desktop') {
        navigate(href) // mobilde detay bir sayfadır: ileri gidiş
        return
      }
      if (String(nextId) === videoId && (nextTctx ?? null) === tctx) return
      openedInApp.delete(location.key)
      navigate(href, { replace: true, state: inApp ? { [IN_APP_STATE]: true } : null })
    },
    [inApp, location, navigate, videoId, tctx],
  )

  return { videoId, tctx, close, switchTo }
}
