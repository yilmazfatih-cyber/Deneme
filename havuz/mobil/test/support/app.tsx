/**
 * Ekran testleri için uygulamayı GERÇEK rotalarıyla çizer (expo-router/testing-library → renderRouter('./src/app')).
 * Dış bağımlılıklar sahtedir: API (FakeBackend ya da yok), ağ, uygulama yaşam döngüsü, güvenli depo; veritabanı
 * node:sqlite (bellekte). Her test temiz başlar: `afterEach(resetApp)`.
 */
import { renderRouter, screen } from 'expo-router/testing-library'
import { openDeviceDb, setDeviceValue } from '../../src/lib/device/deviceStore.ts'
import type { AppLifecycle } from '../../src/lib/platform/lifecycle.ts'
import type { NetworkMonitor } from '../../src/lib/platform/network.ts'
import { configureSessionServices } from '../../src/lib/session/services.ts'
import type { TokenStorage } from '../../src/lib/session/tokenStorage.ts'
import { configureTokenStorage } from '../../src/lib/session/tokenStore.ts'
import { closeAllDbs } from '../../src/lib/store/databases.ts'
import type { FakeBackend } from './fakeApi.ts'

export function memoryTokenStorage(initial: string | null = null): TokenStorage & { value: string | null } {
  const storage = {
    value: initial,
    get: async () => storage.value,
    set: async (token: string) => {
      storage.value = token
    },
    remove: async () => {
      storage.value = null
    },
  }
  return storage
}

export const activeApp: AppLifecycle = { isActive: () => true, onChange: () => () => {} }

export function onlineNetwork(): NetworkMonitor & { dispose(): void } {
  return { isOnline: () => true, onChange: () => () => {}, dispose: () => {} }
}

export interface RenderAppOptions {
  readonly url: string
  /** Sahte sunucu; verilmezse API kapalı (yalnız hesapsız kip). */
  readonly backend?: FakeBackend
  readonly tokens?: TokenStorage
}

/** Uygulamayı verilen adresten açar ve ilk ekran yüklenene dek bekler. */
export async function renderApp(options: RenderAppOptions) {
  const backend = options.backend
  configureSessionServices({
    createApi: (getToken) => (backend ? backend.client(getToken) : null),
    createNetwork: onlineNetwork,
    app: activeApp,
  })
  configureTokenStorage(options.tokens ?? memoryTokenStorage())
  const result = await renderRouter('./src/app', { initialUrl: options.url })
  return { ...result, screen }
}

/** Testler arası temizlik: açık veritabanlarını kapatır (sonraki test boş veritabanıyla başlar). */
export async function resetApp(): Promise<void> {
  await closeAllDbs()
}

/** Karşılamayı geçilmiş say (hesapsız kipte doğrudan görevlerden başlamak için). */
export async function skipWelcome(): Promise<void> {
  await setDeviceValue(await openDeviceDb(), 'welcomeDone', true)
}

/** Sahte sunucuda hesap açar ve bu "telefonda" oturum açılmış gibi hazırlar. Güvenli depoyu döndürür. */
export async function signedIn(backend: FakeBackend, email = 'ayse@ornek.com', password = 'uzun-bir-sifre-42') {
  const account = backend.accounts.get(email) ?? backend.createAccount(email, password)
  const tokens = memoryTokenStorage(backend.issueToken(email))
  const device = await openDeviceDb()
  await setDeviceValue(device, 'session', {
    userId: account.user.id,
    user: account.user,
    expired: false,
    since: new Date().toISOString(),
  })
  await setDeviceValue(device, 'welcomeDone', true)
  return { account, tokens }
}
