/**
 * Geçiş modu hafızası: uygulama son seçilen modu (Canlı TV / Film & Dizi) hatırlar; `#/` oraya gider.
 * localStorage gizli pencerede ya da engelliyken hata verebilir: her erişim try/catch içinde.
 */
import type { AppMode } from '../design'

const KEY = 'tvp.mode'

export const MODE_PATHS: Record<AppMode, string> = { live: '/canli', vod: '/film-dizi' }

export function getLastMode(): AppMode {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'live' || v === 'vod') return v
  } catch {
    /* depolama yok: varsayılan */
  }
  return 'vod'
}

export function setLastMode(mode: AppMode): void {
  try {
    localStorage.setItem(KEY, mode)
  } catch {
    /* depolama yok: yalnız bu oturumda hatırlanmaz */
  }
}

export const lastModePath = (): string => MODE_PATHS[getLastMode()]

/** Yol bir mod ana sayfasıysa modu döndürür. */
export function modeOfPath(pathname: string): AppMode | null {
  if (pathname === MODE_PATHS.live || pathname.startsWith(`${MODE_PATHS.live}/`)) return 'live'
  if (pathname === MODE_PATHS.vod || pathname.startsWith(`${MODE_PATHS.vod}/`)) return 'vod'
  return null
}
