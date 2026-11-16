/**
 * Eşitleme tetikleyicileri: motora "ne zaman eşitle" der.
 *   - yerel yazma         → kısa gecikmeyle (art arda yazmalar tek istekte toplanır)
 *   - çevrimiçi olma      → hemen (bekleyen geri çekilme bozulur)
 *   - sekmeye dönme       → son denemeden beri yeterince zaman geçtiyse
 *   - düzenli aralık      → sekme görünürken
 *   - anlık bildirim      → sunucu "değişti" deyince (kendi değişikliğimiz hariç)
 *
 * Genişletme: yeni tetikleyici → `attachSyncTriggers` içinde dinleyici ekleyin ve dönen temizlik işlevinde kaldırın.
 */
import type { PokeEvent } from '@uygulama/shared'
import type { AppDb } from '../store/db.ts'
import type { SyncEngine } from './engine.ts'
import { SYNC_TIMING, type SyncTiming } from './timing.ts'

export interface TriggerOptions {
  readonly engine: SyncEngine
  readonly db: AppDb
  /** Bu cihazın kimliği: kendi değişikliğimizin dürtmesi yok sayılır. */
  readonly clientId: string
  /** Anlık bildirim akışına bağlanır; bağlantıyı kapatan işlevi döndürür. Verilmezse yalnız aralıkla eşitlenir. */
  readonly connectPokes?: (onPoke: (poke: PokeEvent) => void) => () => void
  readonly target?: Window
  readonly timing?: Partial<SyncTiming>
  readonly now?: () => number
}

function debounce(fn: () => void, ms: number): { call: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null
  return {
    call: () => {
      if (timer !== null) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        fn()
      }, ms)
    },
    cancel: () => {
      if (timer !== null) clearTimeout(timer)
      timer = null
    },
  }
}

/** Tetikleyicileri bağlar ve ilk eşitlemeyi başlatır. Dönen işlev hepsini çözer. */
export function attachSyncTriggers(options: TriggerOptions): () => void {
  const { engine, db } = options
  const timing = { ...SYNC_TIMING, ...options.timing }
  const target = options.target ?? window
  const now = options.now ?? Date.now
  const isVisible = () => target.document.visibilityState !== 'hidden'

  const push = debounce(() => engine.requestSync('push'), timing.pushDebounceMs)
  const pull = debounce(() => engine.requestSync('pull'), timing.pokeDebounceMs)

  const offWrite = db.onLocalWrite(push.call)
  const onOnline = () => void engine.syncNow()
  const onVisibility = () => {
    if (isVisible() && now() - engine.lastAttemptAt > timing.resumeMinGapMs) engine.requestSync('pull')
  }
  target.addEventListener('online', onOnline)
  target.document.addEventListener('visibilitychange', onVisibility)
  const interval = setInterval(() => {
    if (isVisible()) engine.requestSync('pull')
  }, timing.pollMs)
  const disconnect = options.connectPokes?.((poke) => {
    if (poke.clientId !== options.clientId) pull.call()
  })

  engine.requestSync('pull')
  return () => {
    offWrite()
    push.cancel()
    pull.cancel()
    target.removeEventListener('online', onOnline)
    target.document.removeEventListener('visibilitychange', onVisibility)
    clearInterval(interval)
    disconnect?.()
  }
}
