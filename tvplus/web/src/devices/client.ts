/**
 * Cihaz istemcisi (tekil örnek). Dışa aktarılan adlar ve imzalar SABİTTİR; TV uygulaması, kumanda ve yansıtma
 * arayüzleri bunlara göre yazılır. Tel sözleşmesi: shared/devices.ts. Asıl mantık `client-core.ts` içindedir
 * (bağımlılıkları dışarıdan alır, birim testleri onu sınar); burada tarayıcı bağımlılıkları bağlanır.
 */
import { applyBoot, apiUrl, refreshBoot, sessionHeaders, virtualDevice } from '../api/session'
import { devbus } from '../lib/devbus'
import { createDeviceClient, type KeyValueStorage } from './client-core'

export type { DeviceClientState } from './client-core'

const sessionStore = ((): KeyValueStorage | null => {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
})()

export const deviceClient = createDeviceClient({
  fetch: (input, init) => fetch(input, init),
  // Aynı kökten açıldığı için çerezler kendiliğinden gider (withCredentials gerekmez).
  openEventSource: (url) => new EventSource(url),
  headers: sessionHeaders,
  apiUrl,
  applyBoot,
  refreshBoot,
  storage: sessionStore,
  storageKey: `tvp.cihaz.hedef.${virtualDevice ?? 'varsayilan'}`,
  emit: (label, detail, opts) => devbus.emit('device', label, detail, opts),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
})

/** React için: `useSyncExternalStore(deviceClient.subscribe, deviceClient.getState)` ile kullanılır. */
export type DeviceClient = typeof deviceClient
