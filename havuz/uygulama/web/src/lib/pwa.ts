/**
 * PWA: servis çalışanını kaydeder ve "yeni sürüm hazır" durumunu arayüze bildirir.
 * Yalnız derlenmiş sürümde çalışır (geliştirmede servis çalışanı yoktur). Önbellek kuralları: vite.config.ts.
 *
 * Akış: yeni sürüm indirilince `needRefresh` olur → arayüz "Yeni sürüm hazır · Yenile" bildirimini gösterir →
 * kullanıcı onaylarsa `applyUpdate()` yeni servis çalışanını devreye alıp sayfayı yeniler.
 *
 * Genişletme: güncelleme denetim sıklığı için `CHECK_INTERVAL_MS`.
 */
import { useSyncExternalStore } from 'react'

const CHECK_INTERVAL_MS = 60 * 60 * 1000

interface PwaState {
  readonly needRefresh: boolean
  readonly offlineReady: boolean
}

let state: PwaState = { needRefresh: false, offlineReady: false }
let update: ((reload?: boolean) => Promise<void>) | null = null
const listeners = new Set<() => void>()

function set(patch: Partial<PwaState>): void {
  state = { ...state, ...patch }
  for (const listener of listeners) listener()
}

/** main.tsx çağırır (yalnız derlenmiş sürümde). */
export async function startPwa(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  const { registerSW } = await import('virtual:pwa-register')
  update = registerSW({
    immediate: true,
    onNeedRefresh: () => set({ needRefresh: true }),
    onOfflineReady: () => set({ offlineReady: true }),
    onRegisteredSW: (_url, registration) => {
      if (registration) setInterval(() => void registration.update(), CHECK_INTERVAL_MS)
    },
  })
}

/** Bekleyen yeni sürümü devreye alır ve sayfayı yeniler. */
export async function applyUpdate(): Promise<void> {
  if (update) await update(true)
  else location.reload()
}

export function dismissUpdate(): void {
  set({ needRefresh: false })
}

export function usePwaState(): PwaState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state,
    () => state,
  )
}
