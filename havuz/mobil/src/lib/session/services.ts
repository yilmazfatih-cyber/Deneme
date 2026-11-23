/**
 * Oturumun dış bağımlılıkları tek yerde: API istemcisi, ağ durumu, uygulama yaşam döngüsü.
 * Uygulamada gerçekleri kullanılır; testler `configureSessionServices({ createApi: … })` ile sahtelerini verir.
 *
 * Genişletme: oturumun kullanacağı yeni bir dış kaynak (ör. bildirim izni) → `SessionServices`'e alan + varsayılan.
 */
import { API_CONFIG, APP_VERSION } from '../../config.ts'
import { ApiClient } from '../api/client.ts'
import { appLifecycle, type AppLifecycle } from '../platform/lifecycle.ts'
import { createNetworkMonitor, type NetworkMonitor } from '../platform/network.ts'

export interface SessionServices {
  /** API istemcisini kurar; `null` → API kapalı (yalnız hesapsız kip, hesap ekranları gizli). */
  readonly createApi: (getToken: () => string | null) => ApiClient | null
  readonly createNetwork: () => NetworkMonitor & { dispose(): void }
  readonly app: AppLifecycle
}

const defaults: SessionServices = {
  createApi: (getToken) =>
    API_CONFIG.enabled
      ? new ApiClient({ baseUrl: API_CONFIG.baseUrl, getToken, clientName: `mobil/${APP_VERSION}` })
      : null,
  createNetwork: createNetworkMonitor,
  app: appLifecycle,
}

let current: SessionServices = defaults

/** Bağımlılıkları değiştirir (yalnız testler). Verilmeyenler varsayılan kalır. */
export function configureSessionServices(next: Partial<SessionServices>): void {
  current = { ...defaults, ...next }
}

export function sessionServices(): SessionServices {
  return current
}
