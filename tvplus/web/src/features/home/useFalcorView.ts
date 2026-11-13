/**
 * Kısmi okumalı Falcor kancası. api/hooks.ts `useFalcor` yollar TAMAMEN önbellekteyken veri verir; ana sayfa ise
 * açılış tohumunda olan yaprakları (ör. başlık, afiş) hemen çizmek, eksik olanları (ör. itemTctx) arkadan istemek ister.
 *   - Her model değişiminde önbellekten kısmi okuma (peek); eksik yollar `fetch` açıkken ağdan istenir.
 *   - Aynı tikteki tüm çağrılar modelin kendi toplayıcısıyla TEK POST'ta gider.
 *   - Eksik yollar yeniden çekilirken (geçersiz kılma, süre dolumu) önceki görüntü korunur: iskelet yanıp sönmez.
 *   - Hata: aynı eksik küme için kendiliğinden yeniden denenmez; `retry` ile denenir.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { FalcorPath } from '../../../../shared/types'
import { falcor } from '../../api/falcor'

let version = 0
const listeners = new Set<() => void>()
falcor.subscribe(() => {
  version++
  listeners.forEach((l) => l())
})
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
const getVersion = () => version

/** Aynı eksik küme başarılı bir istekten sonra hâlâ eksikse en erken bu kadar sonra yeniden sorulur. */
const REFETCH_FLOOR_MS = 5000

type Json = Record<string, unknown>

function mergeDeep(base: unknown, over: unknown): unknown {
  if (!over || typeof over !== 'object' || Array.isArray(over)) return over ?? base
  if (!base || typeof base !== 'object' || Array.isArray(base)) return over
  const out: Json = { ...(base as Json) }
  for (const [k, v] of Object.entries(over as Json)) out[k] = mergeDeep(out[k], v)
  return out
}

export interface FalcorView<T> {
  /** Önbellekteki kısmi veri (eksik yapraklar yok) */
  json: T
  /** Eksik yol kümesi sayısı */
  missing: number
  loading: boolean
  error: Error | null
  retry: () => void
}

export function useFalcorView<T>(paths: FalcorPath[], opts: { fetch?: boolean } = {}): FalcorView<T> {
  const fetch = opts.fetch ?? true
  const key = JSON.stringify(paths)
  const ver = useSyncExternalStore(subscribe, getVersion, getVersion)

  const view = useMemo(() => (paths.length ? falcor.peek<Json>(...paths) : { json: {} as Json, missing: [] as FalcorPath[] }), [key, ver])
  const missingKey = view.missing.length ? JSON.stringify(view.missing) : ''

  const [failure, setFailure] = useState<{ key: string; error: Error } | null>(null)
  const [nonce, setNonce] = useState(0)
  const lastFetch = useRef<{ key: string; at: number } | null>(null)
  const [inflight, setInflight] = useState(false)

  useEffect(() => {
    if (!fetch || !missingKey) return
    if (failure && failure.key === missingKey) return
    const last = lastFetch.current
    if (last && last.key === missingKey && Date.now() - last.at < REFETCH_FLOOR_MS) return
    lastFetch.current = { key: missingKey, at: Date.now() }
    let alive = true
    setInflight(true)
    falcor.get(...(JSON.parse(missingKey) as FalcorPath[])).then(
      () => {
        if (alive) setInflight(false)
      },
      (err: unknown) => {
        if (!alive) return
        setInflight(false)
        setFailure({ key: missingKey, error: err instanceof Error ? err : new Error(String(err)) })
      },
    )
    return () => {
      alive = false
    }
  }, [fetch, missingKey, nonce])

  // Eksik varken son tam görüntüyü koru (yeniden çekmede yanıp sönme olmasın).
  const stable = useRef<Json>({})
  const shown = useMemo(() => {
    const out = view.missing.length ? (mergeDeep(stable.current, view.json) as Json) : view.json
    if (!view.missing.length) stable.current = view.json
    return out
  }, [view])

  const retry = useCallback(() => {
    lastFetch.current = null
    setFailure(null)
    setNonce((n) => n + 1)
  }, [])

  const error = failure && failure.key === missingKey ? failure.error : null
  return { json: shown as T, missing: view.missing.length, loading: !!missingKey && !error && (inflight || fetch), error, retry }
}
