// Küçük yardımcılar: base64, onaltılık, tuzlu özet, bayt karşılaştırma.

const BASE64_DESENI = /^[A-Za-z0-9+/]*={0,2}$/
const BASE64URL_DESENI = /^[A-Za-z0-9_-]+$/

/** Standart base64 metnini çözer; biçim bozuksa `null` döner. */
export function base64Coz(metin: string): Uint8Array | null {
  if (metin.length % 4 !== 0 || !BASE64_DESENI.test(metin)) return null
  try {
    const ikili = atob(metin)
    const baytlar = new Uint8Array(ikili.length)
    for (let i = 0; i < ikili.length; i++) baytlar[i] = ikili.charCodeAt(i)
    return baytlar
  } catch {
    return null
  }
}

/** Dolgusuz base64url metnini çözer; biçim bozuksa `null` döner. */
export function base64UrlCoz(metin: string): Uint8Array | null {
  if (!BASE64URL_DESENI.test(metin) || metin.length % 4 === 1) return null
  const dolgu = '='.repeat((4 - (metin.length % 4)) % 4)
  return base64Coz(metin.replace(/-/g, '+').replace(/_/g, '/') + dolgu)
}

export function onaltilik(baytlar: ArrayBuffer | Uint8Array): string {
  const dizi = baytlar instanceof Uint8Array ? baytlar : new Uint8Array(baytlar)
  let sonuc = ''
  for (const bayt of dizi) sonuc += bayt.toString(16).padStart(2, '0')
  return sonuc
}

export function baytlarEsit(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let fark = 0
  for (let i = 0; i < a.length; i++) fark |= a[i]! ^ b[i]!
  return fark === 0
}

export async function sha256Onaltilik(baytlar: Uint8Array): Promise<string> {
  return onaltilik(await crypto.subtle.digest('SHA-256', baytlar))
}

/**
 * Tuzlu SHA-256 özeti (HMAC-SHA-256, anahtar = tuz), onaltılık 64 karakter.
 * Kimliklerin (abonelik kimliği, IP) kendisi yerine bu özet kullanılır; tuz bilinmeden geri çevrilemez.
 */
export async function tuzluOzet(tuz: string, deger: string): Promise<string> {
  const kodlayici = new TextEncoder()
  const anahtar = await crypto.subtle.importKey('raw', kodlayici.encode(tuz), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ])
  return onaltilik(await crypto.subtle.sign('HMAC', anahtar, kodlayici.encode(deger)))
}

/** UTC günü, `YYYY-AA-GG`. */
export function utcGun(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/** Bir sonraki UTC gece yarısına kalan saniye (en az 1). */
export function geceYarisinaSaniye(ms: number): number {
  const GUN_MS = 86_400_000
  return Math.max(1, Math.ceil((GUN_MS - (ms % GUN_MS)) / 1000))
}

/** Baytları JSON olarak çözer; UTF-8 ya da JSON bozuksa hata fırlatır. */
export function jsonCoz(baytlar: Uint8Array): unknown {
  return JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(baytlar))
}
