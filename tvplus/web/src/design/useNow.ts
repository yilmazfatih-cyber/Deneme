/** Belirli aralıkla yenilenen "şimdi" (canlı ilerleme ve kalan süre için). Tüm bileşenler tek zamanlayıcıyı paylaşır. */
import { useSyncExternalStore } from 'react'

const TICK_MS = 30_000
let now = Date.now()
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | null = null

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  if (!timer) {
    now = Date.now()
    timer = setInterval(() => {
      now = Date.now()
      for (const l of listeners) l()
    }, TICK_MS)
  }
  return () => {
    listeners.delete(fn)
    if (!listeners.size && timer) {
      clearInterval(timer)
      timer = null
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
