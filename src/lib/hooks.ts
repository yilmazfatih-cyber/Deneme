import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import {
  db,
  defaultProfile,
  defaultSettings,
  type PersonalItem,
  type Profile,
  type Settings,
  type SrsState,
} from '../db'

export function useSettings(): Settings {
  const stored = useLiveQuery(() => db.settings.get('main'), [])
  return useMemo(() => ({ ...defaultSettings, ...stored }), [stored])
}

/** Ayarlar veritabanından ilk kez okunana kadar `undefined` döner (kurulum yönlendirmesi için). */
export function useSettingsLoaded(): Settings | undefined | null {
  return useLiveQuery(async () => (await db.settings.get('main')) ?? null, [])
}

export function useProfile(): Profile {
  const stored = useLiveQuery(() => db.profile.get('main'), [])
  return useMemo(() => ({ ...defaultProfile, ...stored }), [stored])
}

const noItems: PersonalItem[] = []
export function usePersonalItems(): PersonalItem[] {
  return useLiveQuery(() => db.personalItems.orderBy('createdAt').toArray(), [], noItems)
}

const noStates = new Map<string, SrsState>()
export function useSrsStates(): Map<string, SrsState> {
  return useLiveQuery(async () => new Map((await db.srsStates.toArray()).map((s) => [s.wordId, s])), [], noStates)
}

const blobUrlRefs = new Map<string, number>()

/**
 * Blob için geçici adres üretir ve kullanan kalmayınca serbest bırakır.
 * Sayaç, StrictMode'daki çift efekt çalıştırmasında adresin erken iptal edilmesini önler.
 */
export function useBlobUrl(blob: Blob | undefined): string | undefined {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : undefined), [blob])
  useEffect(() => {
    if (!url) return
    blobUrlRefs.set(url, (blobUrlRefs.get(url) ?? 0) + 1)
    return () => {
      blobUrlRefs.set(url, (blobUrlRefs.get(url) ?? 1) - 1)
      setTimeout(() => {
        if (!blobUrlRefs.get(url)) {
          blobUrlRefs.delete(url)
          URL.revokeObjectURL(url)
        }
      }, 1000)
    }
  }, [url])
  return url
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!mq) return
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}
