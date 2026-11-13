/**
 * Ekran biçimi: aynı uygulama üç kabukla çalışır — 'tv' (kumandayla, 10-foot), 'mobile' (< 900 px), 'desktop'.
 * Zorlamak için adres: ?cihaz=tv | mobil | web (cihaz vitrini çerçeveleri böyle açılır).
 */
import { useSyncExternalStore } from 'react'
import { FORM_FACTOR_PARAM } from '../../../shared/constants'

export type FormFactor = 'tv' | 'mobile' | 'desktop'

const MOBILE_MAX = 899
const TV_UA =
  /SmartTV|SMART-TV|Tizen|Web0S|webOS|NetCast|HbbTV|GoogleTV|Android TV|AFT[A-Z]|BRAVIA|VIDAA|Roku|CrKey|PlayStation|Xbox/i

function forced(): FormFactor | null {
  try {
    const v = new URLSearchParams(window.location.search).get(FORM_FACTOR_PARAM)
    if (v === 'tv') return 'tv'
    if (v === 'mobil') return 'mobile'
    if (v === 'web') return 'desktop'
  } catch {
    /* adres okunamazsa algıla */
  }
  return null
}

const FORCED = forced()
const IS_TV = FORCED === 'tv' || (FORCED === null && TV_UA.test(navigator.userAgent))

export function detectFormFactor(): FormFactor {
  if (IS_TV) return 'tv'
  if (FORCED) return FORCED
  return window.innerWidth <= MOBILE_MAX ? 'mobile' : 'desktop'
}

function subscribe(cb: () => void): () => void {
  window.addEventListener('resize', cb)
  return () => window.removeEventListener('resize', cb)
}

/** Pencere boyutu değişince mobil ↔ masaüstü arasında geçer; TV sabittir. */
export function useFormFactor(): FormFactor {
  return useSyncExternalStore(subscribe, detectFormFactor)
}

export const isTv = (): boolean => IS_TV
