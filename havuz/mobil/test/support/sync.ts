/**
 * Eşitleme testleri için yardımcılar: MemoryServer'a bağlanan sahte "ağ", elle zamanlayıcı.
 * Gerçek ağ yoktur; istek ve yanıt JSON'a çevrilip geri okunur ki gerçek ağdaki gibi kopya gelsin.
 * Kaynak: uygulama/web/test/helpers/sync.ts (Dexie yerine SQLite).
 */
import { AppError, isAppError, type SyncRequest, type SyncResponse } from '@uygulama/shared'
import type { MemoryServer } from '@uygulama/shared/testing'
import { NetworkError } from '../../src/lib/errors.ts'
import type { SyncSend, Timers } from '../../src/lib/sync/engine.ts'
import { viaJson } from './db.ts'

export interface FakeNetwork {
  readonly send: SyncSend
  /** Ağ kopuk mu (true iken her istek NetworkError fırlatır). */
  offline: boolean
  /** Sıradaki N yanıt yolda kaybolur: sunucu işler ama istemci NetworkError alır. */
  dropResponses: number
  /** Sunucuya giden bütün istekler (sırasıyla). */
  readonly requests: SyncRequest[]
  /** Aynı anda yolda olan en çok istek sayısı (tek uçuş denetimi için). */
  maxInFlight: number
  /** Sıradaki istekte fırlatılacak sunucu hatası (bir kez). */
  failNext: AppError | null
}

/** MemoryServer'a bağlanan sahte `POST /api/sync`. */
export function fakeNetwork(server: MemoryServer, userId: string, options: { delayMs?: number } = {}): FakeNetwork {
  let inFlight = 0
  const network: FakeNetwork = {
    offline: false,
    dropResponses: 0,
    requests: [],
    maxInFlight: 0,
    failNext: null,
    send: async (request: SyncRequest): Promise<SyncResponse> => {
      if (network.offline) throw new NetworkError()
      inFlight += 1
      network.maxInFlight = Math.max(network.maxInFlight, inFlight)
      try {
        if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs))
        network.requests.push(viaJson(request))
        if (network.failNext) {
          const error = network.failNext
          network.failNext = null
          throw error
        }
        let response: SyncResponse
        try {
          response = server.sync(userId, viaJson(request))
        } catch (error) {
          if (isAppError(error)) throw new AppError(error.code, error.message, error.details)
          throw error
        }
        if (network.dropResponses > 0) {
          network.dropResponses -= 1
          throw new NetworkError('yanıt yolda kayboldu')
        }
        return viaJson(response)
      } finally {
        inFlight -= 1
      }
    },
  }
  return network
}

/** Elle ilerletilen zamanlayıcı: planlanan geri çağrılar `fire` ile tetiklenir. */
export function manualTimers(): Timers & { readonly scheduled: { ms: number; fire: () => void }[] } {
  const scheduled: { ms: number; fire: () => void; cancelled: boolean }[] = []
  return {
    scheduled,
    set: (callback, ms) => {
      const entry = { ms, cancelled: false, fire: () => (entry.cancelled ? undefined : callback()) }
      scheduled.push(entry)
      return entry
    },
    clear: (handle) => {
      const entry = handle as { cancelled: boolean }
      entry.cancelled = true
      const index = scheduled.indexOf(entry as (typeof scheduled)[number])
      if (index >= 0) scheduled.splice(index, 1)
    },
  }
}
