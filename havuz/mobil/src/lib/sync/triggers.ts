/**
 * Eşitleme tetikleyicileri: motora "ne zaman eşitle" der.
 *   - yerel yazma          → kısa gecikmeyle (art arda yazmalar tek istekte toplanır)
 *   - ağ geri gelince      → hemen (bekleyen geri çekilme bozulur)
 *   - ön plana gelince     → son denemeden beri yeterince zaman geçtiyse
 *   - düzenli aralık       → uygulama ön plandayken
 *   - anlık bildirim       → sunucu "değişti" deyince (kendi değişikliğimiz hariç; isteğe bağlı)
 *
 * Kaynaklar (uygulama durumu, ağ) dışarıdan verilir: gerçekleri lib/platform/lifecycle.ts ve network.ts'te,
 * testte sahteleri. Genişletme: yeni tetikleyici → burada dinleyici ekleyin, dönen temizlik işlevinde kaldırın.
 */
import type { PokeEvent } from '@uygulama/shared'
import type { AppLifecycle } from '../platform/lifecycle.ts'
import type { NetworkMonitor } from '../platform/network.ts'
import type { LocalDb } from '../store/localDb.ts'
import type { SyncEngine } from './engine.ts'
import { SYNC_TIMING, type SyncTiming } from './timing.ts'

export interface TriggerOptions {
  readonly engine: SyncEngine
  readonly db: LocalDb
  readonly app: AppLifecycle
  readonly network: NetworkMonitor
  /** Bu cihazın kimliği: kendi değişikliğimizin dürtmesi yok sayılır. */
  readonly clientId?: string
  /** Anlık bildirim akışına bağlanır; bağlantıyı kapatan işlevi döndürür. Verilmezse yalnız aralıkla eşitlenir. */
  readonly connectPokes?: (onPoke: (poke: PokeEvent) => void) => () => void
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
  const { engine, db, app, network } = options
  const timing = { ...SYNC_TIMING, ...options.timing }
  const now = options.now ?? Date.now

  const push = debounce(() => engine.requestSync('push'), timing.pushDebounceMs)
  const pull = debounce(() => engine.requestSync('pull'), 250)

  const offWrite = db.onLocalWrite(push.call)
  const offNetwork = network.onChange((online) => {
    if (online) void engine.syncNow()
  })
  const offApp = app.onChange((active) => {
    if (active && now() - engine.lastAttemptAt > timing.resumeMinGapMs) engine.requestSync('pull')
  })
  const interval = setInterval(() => {
    if (app.isActive()) engine.requestSync('pull')
  }, timing.pollMs)
  const disconnect = options.connectPokes?.((poke) => {
    if (poke.clientId === null || poke.clientId !== options.clientId) pull.call()
  })

  engine.requestSync('pull')
  return () => {
    offWrite()
    offNetwork()
    offApp()
    push.cancel()
    pull.cancel()
    clearInterval(interval)
    disconnect?.()
  }
}
