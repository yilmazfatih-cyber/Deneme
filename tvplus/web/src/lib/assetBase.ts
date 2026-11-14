/**
 * Durağan barındırma (GitHub Pages, alt yol ör. https://…github.io/Deneme/) için adres yardımcıları.
 *
 * `assetUrl(path)`: uygulamanın kendi dosyalarına (logo, önceden üretilmiş görseller, çekim ana kareleri) giden adresi
 * sitenin taban yoluna göre çözer. Taban Vite'ın `import.meta.env.BASE_URL` değeridir:
 *   · '/' (sunucu kipi, bugünkü davranış) → adres AYNEN döner.
 *   · '/Deneme/' gibi mutlak taban → '/brand/logo.png' → '/Deneme/brand/logo.png'; 'img/x.webp' → '/Deneme/img/x.webp'.
 *   · './' gibi göreli taban → belge konumuna göre (HashRouter'da belge yolu hep sitenin köküdür) mutlak adrese çevrilir.
 * Tam adresler (https:, data:, blob:, //…) hiç değiştirilmez.
 *
 * `isStaticHost()`: istemcinin durağan kipte olup olmadığı. Derlemede `VITE_TVP_STATIC_HOST=1` ile ya da çalışma anında
 * sunucunun açılış bağlamındaki `featureFlags.staticHost` ile açılır. Bu kipte vekil/CDN uçları (/oca, FTL yoklaması)
 * hiç çağrılmaz.
 */
import { peekBoot } from '../api/session'

const ABSOLUTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i

function baseUrl(): string {
  const b = import.meta.env.BASE_URL
  return typeof b === 'string' && b !== '' ? b : '/'
}

export function assetUrl(path: string): string
export function assetUrl(path: string | null | undefined): string | null | undefined
export function assetUrl(path: string | null | undefined): string | null | undefined {
  if (!path || ABSOLUTE.test(path)) return path
  const base = baseUrl()
  if (base === '/') return path
  const rel = path.replace(/^\/+/, '')
  if (base.startsWith('/')) {
    const b = base.endsWith('/') ? base : `${base}/`
    return path.startsWith(b) ? path : b + rel
  }
  // Göreli taban ('./'): belge konumuna göre çöz (karma kısmı adres çözümünde zaten yok sayılır)
  if (typeof document === 'undefined') return rel
  try {
    return new URL(base.replace(/\/?$/, '/') + rel, document.baseURI).href
  } catch {
    return rel
  }
}

export function isStaticHost(): boolean {
  if (import.meta.env.VITE_TVP_STATIC_HOST === '1') return true
  return peekBoot()?.featureFlags.staticHost === true
}
