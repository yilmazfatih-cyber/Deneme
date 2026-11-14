/**
 * Falcor görünümü (TV): verilen yol kümelerini önbellekten okur, eksikleri tek istekte ister, önbellek değişince
 * yeniden okur. Aynı tikteki tüm istekler Falcor modelinde zaten tek POST'ta toplanır.
 *
 * Döngü koruması: eksik (ya da hata atomlu) bir yol en çok `RETRY_MS`'de bir yeniden istenir — hata atomu önbellekte
 * "eksik" sayıldığı için korumasız bir görünüm sonsuza dek isterdi.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { FalcorPath } from '../../../../shared/types'
import { falcor, type FalcorJson } from '../../api/falcor'

const RETRY_MS = 8000
const askedAt = new Map<string, number>()

const keyOf = (p: FalcorPath): string => JSON.stringify(p)

let version = 0
const bump = (): void => {
  version++
}
falcor.subscribe(bump)

function subscribe(fn: () => void): () => void {
  return falcor.subscribe(fn)
}
const getVersion = (): number => version

export interface FalcorView<T> {
  json: T
  /** Eksik yol var ve istek yolda (ya da yakın zamanda istendi) */
  pending: boolean
  /** En az bir eksik yol kaldı */
  missing: number
}

/** Yolları önbellekten okur; eksikleri ister. `paths` her işlemede yeni dizi olabilir (içerikle karşılaştırılır). */
export function useFalcorPaths<T = FalcorJson>(paths: readonly FalcorPath[]): FalcorView<T> {
  const v = useSyncExternalStore(subscribe, getVersion, getVersion)
  const key = JSON.stringify(paths)
  const stable = useMemo(() => paths, [key]) // yol kümeleri içerikle karşılaştırılır
  const peeked = useMemo(
    () => (stable.length ? falcor.peek<T>(...stable) : { json: {} as T, missing: [] as FalcorPath[] }),
    [stable, v],
  )
  const [inflight, setInflight] = useState(0)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    if (!peeked.missing.length) return
    const now = Date.now()
    const ask = peeked.missing.filter((p) => now - (askedAt.get(keyOf(p)) ?? 0) > RETRY_MS)
    if (!ask.length) return
    for (const p of ask) askedAt.set(keyOf(p), now)
    setInflight((n) => n + 1)
    falcor
      .get(...ask)
      .catch(() => undefined) // hata atomları ve ağ hatası: satır kendi boş durumunu gösterir
      .finally(() => {
        if (mounted.current) setInflight((n) => Math.max(0, n - 1))
      })
  }, [peeked])

  return { json: peeked.json, pending: inflight > 0, missing: peeked.missing.length }
}

/** Testler ve profil değişimi için: yeniden deneme zamanlarını unutur. */
export function resetFalcorViewBackoff(): void {
  askedAt.clear()
}
