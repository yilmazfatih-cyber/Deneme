/**
 * İyimser durum (favori kanal, yayın hatırlatması) için saf indirgeyici ve küçük bir dış depo.
 *
 * Dokunuş anında değer değişir (bekleme yok); sunucu yanıtı gelince onaylanır, hata olursa önceki değere döner.
 * Değer = geçersiz kılma ?? sunucunun son verisi. Sayfalar arasında (Canlı TV, Rehber, Arama) aynı depo kullanılır,
 * böylece bir yerde kurulan hatırlatma her yerde aynı anda görünür; yeniden çekmede önbellek boşaltılmaz (titreme yok).
 */
import { useSyncExternalStore } from 'react'

export interface OverrideState {
  /** anahtar → kullanıcının son istediği / sunucunun onayladığı değer */
  values: Readonly<Record<string, boolean>>
  /** anahtar → yanıtı beklenen istek sayısı */
  pending: Readonly<Record<string, number>>
}

export type OverrideAction =
  | { type: 'request'; key: string; value: boolean }
  | { type: 'confirm'; key: string; value: boolean }
  | { type: 'fail'; key: string; previous: boolean }
  | { type: 'reset' }

export const EMPTY_OVERRIDES: OverrideState = { values: {}, pending: {} }

function withPending(p: Readonly<Record<string, number>>, key: string, delta: number): Record<string, number> {
  const next = { ...p }
  const n = (next[key] ?? 0) + delta
  if (n > 0) next[key] = n
  else delete next[key]
  return next
}

export function overrideReducer(s: OverrideState, a: OverrideAction): OverrideState {
  switch (a.type) {
    case 'request':
      return { values: { ...s.values, [a.key]: a.value }, pending: withPending(s.pending, a.key, 1) }
    case 'confirm': {
      // Arada yeni bir istek varsa (hızlı çift dokunuş) son isteğin değeri korunur; yalnız sayaç düşer.
      const stillPending = (s.pending[a.key] ?? 0) > 1
      return {
        values: stillPending ? s.values : { ...s.values, [a.key]: a.value },
        pending: withPending(s.pending, a.key, -1),
      }
    }
    case 'fail': {
      const stillPending = (s.pending[a.key] ?? 0) > 1
      return {
        values: stillPending ? s.values : { ...s.values, [a.key]: a.previous },
        pending: withPending(s.pending, a.key, -1),
      }
    }
    case 'reset':
      return EMPTY_OVERRIDES
  }
}

/** Geçerli değer: geçersiz kılma varsa o, yoksa sunucunun değeri. */
export function effectiveValue(s: OverrideState, key: string, server: boolean): boolean {
  return s.values[key] ?? server
}

export const isPending = (s: OverrideState, key: string): boolean => (s.pending[key] ?? 0) > 0

/* ───────────── Depo ───────────── */

export interface OverrideStore {
  get(): OverrideState
  dispatch(a: OverrideAction): void
  subscribe(fn: () => void): () => void
}

export function createOverrideStore(): OverrideStore {
  let state = EMPTY_OVERRIDES
  const listeners = new Set<() => void>()
  return {
    get: () => state,
    dispatch(a) {
      const next = overrideReducer(state, a)
      if (next === state) return
      state = next
      for (const l of listeners) l()
    },
    subscribe(fn) {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },
  }
}

export function useOverrides(store: OverrideStore): OverrideState {
  return useSyncExternalStore(store.subscribe, store.get, store.get)
}
