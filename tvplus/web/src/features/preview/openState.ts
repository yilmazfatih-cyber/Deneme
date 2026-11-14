/**
 * Açık önizleme kartı var mı — uygulama genelinde tek değer. Vitrin tanıtımı bir önizleme açılınca durur
 * (Netflix: aynı anda tek ses / tek hareketli görüntü).
 */
import { useSyncExternalStore } from 'react'

/** Önizleme kartının kapanış küçülmesi (ms) */
export const CLOSE_MS = 200

let open = false
const listeners = new Set<() => void>()

export function setPreviewOpen(value: boolean): void {
  if (open === value) return
  open = value
  listeners.forEach((l) => l())
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
const get = () => open

/** Ekranda bir önizleme kartı açık mı */
export function usePreviewOpen(): boolean {
  return useSyncExternalStore(subscribe, get, get)
}
