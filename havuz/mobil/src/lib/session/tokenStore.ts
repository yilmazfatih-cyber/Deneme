/**
 * Oturum belirteci: telefonun güvenli deposunda (iOS Keychain / Android Keystore, expo-secure-store) durur; uygulama
 * belleğinde yalnız bir kopyası tutulur ki her API isteği diske gitmesin. Web derlemesinde: tokenStorage.web.ts.
 *
 *   await loadToken()        açılışta bir kez (güvenli depodan belleğe)
 *   getToken()               API istemcisi her istekte çağırır
 *   await saveToken(token)   girişte · await clearToken()  çıkışta / oturum düşünce
 *
 * Genişletme: belirteç dışında gizli bir değer saklanacaksa tokenStorage.ts'e yeni anahtarla aynı kalıbı ekleyin.
 */
import { tokenStorage, type TokenStorage } from './tokenStorage'

let storage: TokenStorage = tokenStorage
let current: string | null = null

/** Depoyu değiştirir (yalnız testler). */
export function configureTokenStorage(next: TokenStorage): void {
  storage = next
  current = null
}

export function getToken(): string | null {
  return current
}

export async function loadToken(): Promise<string | null> {
  try {
    current = await storage.get()
  } catch (error) {
    console.warn('Güvenli depo okunamadı; oturum yeniden giriş isteyecek.', error)
    current = null
  }
  return current
}

export async function saveToken(token: string): Promise<void> {
  current = token
  await storage.set(token)
}

export async function clearToken(): Promise<void> {
  current = null
  await storage.remove().catch((error: unknown) => console.warn('Belirteç silinemedi:', error))
}
