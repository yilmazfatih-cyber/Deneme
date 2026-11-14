/**
 * Panel açıkken devbus'a abone olur; kapalıyken hiçbir şey yapmaz.
 * Açılışta halka tamponu + seyrek olay toplayıcısından (collector.ts) durumu kurar, sonra gelen olayları 250 ms'lik paketlerle uygular
 * (en çok saniyede 4 çizim).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { devbus, type DevEvent } from '../lib/devbus'
import { hydrationEvents } from './collector'
import { initialModel, reduceModel, type DevModel } from './model'

const FLUSH_MS = 250

/** "Temizle" sınırı modül düzeyinde tutulur: panel kapanıp açılınca temizlenen olaylar geri gelmez. */
let feedClearedAfter = 0

export function useDevModel(active: boolean): { model: DevModel; clearFeed: () => void } {
  const [model, setModel] = useState<DevModel>(initialModel)
  const ref = useRef<DevModel>(model)

  useEffect(() => {
    if (!active) {
      // Kapalıyken bellek tutma: sonraki açılışta snapshot'tan yeniden kurulur.
      ref.current = initialModel()
      setModel(ref.current)
      return
    }
    ref.current = reduceModel(initialModel(), hydrationEvents(), feedClearedAfter)
    setModel(ref.current)
    let pending: DevEvent[] = []
    let timer: number | null = null
    const flush = () => {
      timer = null
      if (!pending.length) return
      ref.current = reduceModel(ref.current, pending, feedClearedAfter)
      pending = []
      setModel(ref.current)
    }
    const unsubscribe = devbus.subscribe((e) => {
      pending.push(e)
      if (timer === null) timer = window.setTimeout(flush, FLUSH_MS)
    })
    return () => {
      unsubscribe()
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [active])

  const clearFeed = useCallback(() => {
    const last = devbus.snapshot().at(-1)
    feedClearedAfter = Math.max(feedClearedAfter, last?.id ?? 0, ref.current.feed.rows[0]?.id ?? 0)
    ref.current = { ...ref.current, feed: { rows: [], byCat: {} } }
    setModel(ref.current)
  }, [])

  return { model, clearFeed }
}
