/**
 * Güvenlik başlıkları: her yanıta eklenir.
 *  - /api yanıtları: hiçbir şey yüklemeyen sıkı CSP + `Cache-Control: no-store` (kişisel veri önbelleğe düşmesin).
 *  - Web uygulaması (WEB_DIST): yalnız kendi kökeninden betik/stil/resim yükleyen CSP. Satır içi <script> ve
 *    <style> YOKTUR; vite-plugin-pwa kaydı ayrı dosyayla (registerSW.js) yapılmalıdır (bkz. api/HAZIR.md).
 *  - Hepsinde: nosniff, Referrer-Policy, çerçeveye konmayı yasaklama, Permissions-Policy; üretimde HSTS.
 *
 * Genişletme: web uygulaması dış bir kaynağa (ör. yazı tipi sunucusu) erişecekse WEB_CSP'deki ilgili yönergeye
 * o kökeni ekleyin; kamera/mikrofon gerekiyorsa PERMISSIONS_POLICY'de `camera=(self)` yazın.
 */
import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from './types.ts'

export const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"

export const WEB_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

export const PERMISSIONS_POLICY =
  'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=()'

export function securityHeaders(options: { production: boolean }): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    await next()
    const headers = c.res.headers
    const isApi = c.req.path === '/api' || c.req.path.startsWith('/api/')
    const set = (name: string, value: string) => {
      if (!headers.has(name)) headers.set(name, value)
    }
    set('Content-Security-Policy', isApi ? API_CSP : WEB_CSP)
    set('X-Content-Type-Options', 'nosniff')
    set('Referrer-Policy', 'no-referrer')
    set('X-Frame-Options', 'DENY')
    set('Permissions-Policy', PERMISSIONS_POLICY)
    set('Cross-Origin-Opener-Policy', 'same-origin')
    if (isApi) set('Cache-Control', 'no-store')
    if (options.production) set('Strict-Transport-Security', 'max-age=31536000')
  }
}
