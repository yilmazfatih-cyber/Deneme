/**
 * Ortam ayarları: API nerede, kimlik nasıl taşınır. Derleme anında `VITE_API_URL` ile seçilir:
 *
 *   (boş)                     → API aynı kökende (`/api`); oturum çerezle taşınır. Geliştirmede Vite vekili kullanılır.
 *   none                      → hesapsız kip: sunucu yok, veriler yalnız bu cihazda (GitHub Pages gibi durağan yayın).
 *   https://api.ornek.com     → API başka kökende; oturum belirteçle (`Authorization: Bearer`) taşınır.
 *
 * Neden iki kimlik kipi? Çerez, sayfanın kendi kökeninde en güvenlisidir (JavaScript okuyamaz). API başka bir
 * kökendeyse üçüncü taraf çerezleri tarayıcılarda engellendiği için belirteç gerekir (ayrıntı: docs/KARARLAR.md).
 *
 * Genişletme: yeni ortam değişkeni → vite-env.d.ts'e tip, buraya okunuş.
 */

export type AuthMode = 'cookie' | 'token'

export type ApiConfig =
  | { readonly enabled: false; readonly reason: 'none' | 'invalid' }
  | { readonly enabled: true; readonly baseUrl: string; readonly authMode: AuthMode }

/** `VITE_API_URL` değerini çözümler. `origin`: sayfanın kökeni (ör. `https://ornek.app`). */
export function parseApiUrl(raw: string | undefined, origin: string): ApiConfig {
  const value = (raw ?? '').trim()
  if (value === '') return { enabled: true, baseUrl: '', authMode: 'cookie' }
  if (value === 'none') return { enabled: false, reason: 'none' }
  let url: URL
  try {
    url = new URL(value)
  } catch {
    console.error(`VITE_API_URL geçersiz: "${value}". Boş bırakın, "none" yazın ya da tam adres verin.`)
    return { enabled: false, reason: 'invalid' }
  }
  const baseUrl = url.href.replace(/\/+$/, '')
  return { enabled: true, baseUrl, authMode: url.origin === origin ? 'cookie' : 'token' }
}

const pageOrigin = typeof location === 'undefined' ? 'http://localhost' : location.origin

/** Uygulamanın kullandığı API ayarı (derleme anında sabitlenir). */
export const API_CONFIG: ApiConfig = parseApiUrl(import.meta.env.VITE_API_URL, pageOrigin)

/** Uygulama sürümü (package.json). */
export const APP_VERSION: string = __APP_VERSION__
