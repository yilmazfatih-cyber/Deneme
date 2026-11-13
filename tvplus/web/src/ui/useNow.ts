/**
 * Paylaşılan "şimdi": canlı ilerleme ve kalan süre için. Tüm bileşenler tek zamanlayıcıyı kullanır
 * (30 sn'de bir; sekme görünür olunca hemen yenilenir).
 */
import { useSyncExternalStore } from 'react'

const TICK_MS = 30_000
let now = Date.now()
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | null = null

function tick(): void {
  now = Date.now()
  for (const l of listeners) l()
}
function onVisible(): void {
  if (document.visibilityState === 'visible') tick()
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  if (!timer) {
    now = Date.now()
    timer = setInterval(tick, TICK_MS)
    document.addEventListener('visibilitychange', onVisible)
  }
  return () => {
    listeners.delete(fn)
    if (!listeners.size && timer) {
      clearInterval(timer)
      timer = null
      document.removeEventListener('visibilitychange', onVisible)
    }
  }
}

/** Epoch ms; 30 sn'de bir güncellenir. */
export function useNow(): number {
  return useSyncExternalStore(
    subscribe,
    () => now,
    () => now,
  )
}
