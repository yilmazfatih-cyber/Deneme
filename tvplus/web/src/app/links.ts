/**
 * Detay bağlantıları (UX_SPEC §7 kural 5: detay masaüstünde pencere, mobilde sayfa, TV'de tam ekran).
 *   Masaüstü: geçerli sayfanın adresine `?jbv=<videoId>` eklenir — pencere o sayfanın ÜSTÜNDE açılır.
 *   Mobil:    `/baslik/<videoId>` tam sayfa.
 * `tctx` (satır konumu izleme bağlamı) her iki biçimde de sorgu parametresi olarak taşınır.
 * Saf çekirdek (buildTitleHref, closeTitleHref) birim testlidir: links.test.ts.
 */
import { useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { detectFormFactor, useFormFactor, type FormFactor } from '../lib/formFactor'

/** Detay penceresinin sorgu parametresi (Netflix: ?jbv=) */
export const DETAIL_PARAM = 'jbv'
export const TCTX_PARAM = 'tctx'

export interface LocationLike {
  pathname: string
  search: string
}

/** Pencerenin üstünde açılabileceği (kabuklu, göz atma) sayfalar değilse pencere ana sayfanın üstünde açılır. */
const NO_MODAL_BASE = /^\/(izle|baslik|profiller|karsilama|bagla|vitrin|_ui(?!\/kabuk))(\/|$)/

export function buildTitleHref(
  formFactor: FormFactor,
  current: LocationLike,
  videoId: string | number,
  tctx?: string | null,
): string {
  const id = encodeURIComponent(String(videoId))
  if (formFactor !== 'desktop') {
    return tctx ? `/baslik/${id}?${TCTX_PARAM}=${encodeURIComponent(tctx)}` : `/baslik/${id}`
  }
  const base = !current.pathname || current.pathname === '/' || NO_MODAL_BASE.test(current.pathname)
  const pathname = base ? '/goz-at' : current.pathname
  const params = new URLSearchParams(base ? '' : current.search)
  params.set(DETAIL_PARAM, String(videoId))
  if (tctx) params.set(TCTX_PARAM, tctx)
  else params.delete(TCTX_PARAM)
  return `${pathname}?${params.toString()}`
}

/** Pencere kapanınca gidilecek adres: aynı sayfa, `jbv` ve `tctx` olmadan. */
export function closeTitleHref(current: LocationLike): string {
  const params = new URLSearchParams(current.search)
  params.delete(DETAIL_PARAM)
  params.delete(TCTX_PARAM)
  const q = params.toString()
  return q ? `${current.pathname}?${q}` : current.pathname
}

/** HashRouter'ın geçerli konumu (`#/goz-at?x=1` → { pathname, search }). */
export function currentHashLocation(): LocationLike {
  const raw = window.location.hash.replace(/^#/, '') || '/'
  const q = raw.indexOf('?')
  return q === -1 ? { pathname: raw, search: '' } : { pathname: raw.slice(0, q), search: raw.slice(q) }
}

/**
 * Detay bağlantısı (çizim anında okunur; sayfa değişince yeniden çizilen kartlarda doğru kalır).
 * Tepki veren biçim gerekiyorsa `useTitleHref()`.
 *
 *   <TitleCard to={titleHref(video.id, tctx)} … />
 */
export function titleHref(videoId: string | number, tctx?: string | null): string {
  return buildTitleHref(detectFormFactor(), currentHashLocation(), videoId, tctx)
}

/** Konum ve ekran biçimi değişince yenilenen `titleHref`. */
export function useTitleHref(): (videoId: string | number, tctx?: string | null) => string {
  const ff = useFormFactor()
  const { pathname, search } = useLocation()
  return useCallback(
    (videoId: string | number, tctx?: string | null) => buildTitleHref(ff, { pathname, search }, videoId, tctx),
    [ff, pathname, search],
  )
}
