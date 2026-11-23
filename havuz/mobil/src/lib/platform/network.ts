/**
 * Ağ durumu (expo-network): bağlantı var mı, değişince haber ver. Eşitleme motoru çevrimdışıyken istek
 * göndermez; bağlantı gelince tetikleyiciler hemen eşitler.
 *
 * Not: "bağlı" olmak internete ulaşmayı garanti etmez (ör. otel ağı); o durumda istek ağ hatası verir ve motor
 * geri çekilmeyle yeniden dener. Bu yüzden ilk değer iyimserdir (`true`).
 * Genişletme: başka bir ağ kaynağı → `NetworkMonitor` arayüzünü gerçekleyen yeni bir işlev.
 */
import * as Network from 'expo-network'

export interface NetworkMonitor {
  isOnline(): boolean
  /** Bağlantı durumu değişince çağrılır. Dönen işlev dinlemeyi bırakır. */
  onChange(listener: (online: boolean) => void): () => void
}

export function createNetworkMonitor(): NetworkMonitor & { dispose(): void } {
  let online = true
  const listeners = new Set<(online: boolean) => void>()
  const update = (state: Network.NetworkState) => {
    const next = state.isConnected !== false
    if (next === online) return
    online = next
    for (const listener of listeners) listener(next)
  }
  Network.getNetworkStateAsync().then(update, () => undefined)
  const subscription = Network.addNetworkStateListener(update)
  return {
    isOnline: () => online,
    onChange: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    dispose: () => {
      subscription.remove()
      listeners.clear()
    },
  }
}
