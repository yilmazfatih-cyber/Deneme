/**
 * kripto — platformun standart kriptosu (WebCrypto `crypto.subtle`) üstüne ince ve güvenli sarmalayıcılar: SHA-256,
 * HMAC-SHA256, sabit zamanlı karşılaştırma, rastgele belirteç, imzalı belirteç (HMAC; süreli), parola özeti
 * (PBKDF2-SHA256, Django biçimi). KENDİ ŞİFRELEME ALGORİTMASI YOKTUR.
 *
 * Kullanım:
 *   await sha256('metin')                                   // "…64 hane hex"
 *   await hmacSha256(gizli, govde)                          // webhook imzası
 *   const t = await signToken({ sub: '42' }, gizli, { expiresInSeconds: 3600 })
 *   const v = await verifyToken(t, gizli)                   // { ok: true, payload } | { ok: false, reason }
 *   const ozet = await hashPassword(parola)                 // "pbkdf2_sha256$600000$tuz$özet"
 *   await verifyPassword(parola, ozet)                      // true / false (sabit zamanlı)
 *
 * Kararlar: Parola özeti PBKDF2-SHA256, 600 000 tur (OWASP 2023 önerisi; WebCrypto'da Argon2/scrypt yok). Biçim
 * Django'nunkiyle aynıdır ("pbkdf2_sha256$tur$tuz$base64"); Django ile karşılıklı denenmedi. Parola, cihazlar arası
 * fark olmasın diye NFC'ye normalleştirilir (ayrışık yazılmış "ş" de aynı parola sayılır). İmzalı belirteç
 * "v1.<base64url(JSON)>.<base64url(HMAC)>" biçimindedir; yük ŞİFRELENMEZ, yalnız imzalanır (içine gizli bilgi
 * koymayın). Python eşi aynı belirteci üretir ve doğrular.
 *
 * Sınırlar: Gizli anahtar en az 32 bayt rastgele olmalı (randomToken). Belirteçte kesirli sayı kullanmayın (JS ve
 * Python farklı yazar). Belirteç iptal listesi yoktur (kısa süre verin). Tarayıcıda yalnız güvenli bağlamda (HTTPS)
 * `crypto.subtle` vardır.
 *
 * Genişletme: Yeni işlev yalnız `crypto.subtle`/`crypto.getRandomValues` kullanır; Python eşine (hashlib/hmac/secrets)
 * aynı çıktıyı verecek biçimde eklenir ve `vektorler/kripto.json`'a örnek yazılır.
 */

export const DEFAULT_PASSWORD_ITERATIONS = 600_000

export type VerifyResult = { ok: true; payload: Record<string, unknown> } | { ok: false; reason: 'format' | 'signature' | 'expired' }

const encoder = new TextEncoder()
const SALT_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const MAX_ITERATIONS = 100_000_000

function toBytes(data: string | Uint8Array): Uint8Array<ArrayBuffer> {
  return typeof data === 'string' ? encoder.encode(data) : new Uint8Array(data)
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function base64(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

function base64Url(bytes: Uint8Array): string {
  return base64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4))
  return Uint8Array.from(binary, (ch) => ch.charCodeAt(0))
}

function encode(bytes: Uint8Array, encoding: 'hex' | 'base64url'): string {
  return encoding === 'hex' ? hex(bytes) : base64Url(bytes)
}

/** SHA-256 özeti (metin UTF-8 olarak). */
export async function sha256(data: string | Uint8Array, encoding: 'hex' | 'base64url' = 'hex'): Promise<string> {
  return encode(new Uint8Array(await crypto.subtle.digest('SHA-256', toBytes(data))), encoding)
}

async function hmacBytes(key: string | Uint8Array, data: string | Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', toBytes(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, toBytes(data)))
}

/** HMAC-SHA256 (webhook imzası, belirteç imzası). */
export async function hmacSha256(
  key: string | Uint8Array,
  data: string | Uint8Array,
  encoding: 'hex' | 'base64url' = 'hex',
): Promise<string> {
  return encode(await hmacBytes(key, data), encoding)
}

/** Sabit zamanlı karşılaştırma: imza/belirteç karşılaştırırken `===` yerine bunu kullanın (zamanlama saldırısı). */
export function timingSafeEqual(a: string | Uint8Array, b: string | Uint8Array): boolean {
  const x = toBytes(a)
  const y = toBytes(b)
  let diff = x.length ^ y.length
  const length = Math.max(x.length, y.length)
  for (let i = 0; i < length; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0) // uzunluk farkı da `diff`e katıldı
  return diff === 0
}

/** Kriptografik rastgele belirteç (base64url). 32 bayt = 256 bit. */
export function randomToken(bytes = 32): string {
  if (!Number.isInteger(bytes) || bytes < 16) throw new RangeError('En az 16 bayt kullanın.')
  return base64Url(crypto.getRandomValues(new Uint8Array(bytes)))
}

/**
 * İmzalı belirteç üretir: "v1.<yük>.<imza>". Yüke `iat` (şimdi, sn) ve süre verildiyse `exp` eklenir.
 * `nowSeconds` test için verilir (varsayılan şimdiki Unix saniyesi).
 */
export async function signToken(
  payload: Record<string, unknown>,
  secret: string,
  options: { expiresInSeconds?: number; nowSeconds?: number } = {},
): Promise<string> {
  const iat = options.nowSeconds ?? Math.floor(Date.now() / 1000)
  const claims: Record<string, unknown> = { ...payload, iat }
  if (options.expiresInSeconds !== undefined) claims.exp = iat + options.expiresInSeconds
  const body = `v1.${base64Url(encoder.encode(JSON.stringify(claims)))}`
  return `${body}.${await hmacSha256(secret, body, 'base64url')}`
}

/** Belirteci doğrular: önce imza, sonra süre. Hata fırlatmaz; nedenini döndürür. */
export async function verifyToken(token: string, secret: string, options: { nowSeconds?: number } = {}): Promise<VerifyResult> {
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== 'v1') return { ok: false, reason: 'format' }
  const [, body = '', signature = ''] = parts
  const expected = await hmacSha256(secret, `v1.${body}`, 'base64url')
  if (!timingSafeEqual(expected, signature)) return { ok: false, reason: 'signature' }
  const bytes = fromBase64Url(body)
  let payload: unknown
  try {
    payload = bytes === null ? null : JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    return { ok: false, reason: 'format' }
  }
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return { ok: false, reason: 'format' }
  const claims = payload as Record<string, unknown>
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000)
  if (typeof claims.exp === 'number' && now >= claims.exp) return { ok: false, reason: 'expired' }
  return { ok: true, payload: claims }
}

async function pbkdf2(password: string, salt: string, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', toBytes(password.normalize('NFC')), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: toBytes(salt), iterations }, key, 256)
  return base64(new Uint8Array(bits))
}

function randomSalt(length = 22): string {
  let salt = ''
  while (salt.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (byte < 248 && salt.length < length) salt += SALT_ALPHABET[byte % 62] // 248 = 4·62: sapmasız
    }
  }
  return salt
}

/** Parola özeti: "pbkdf2_sha256$<tur>$<tuz>$<base64>". `salt` yalnız test için verilir. */
export async function hashPassword(password: string, options: { iterations?: number; salt?: string } = {}): Promise<string> {
  const iterations = options.iterations ?? DEFAULT_PASSWORD_ITERATIONS
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > MAX_ITERATIONS) {
    throw new RangeError('Tur sayısı 1 ile 100 milyon arasında tam sayı olmalı.')
  }
  const salt = options.salt ?? randomSalt()
  if (!/^[A-Za-z0-9./+]{1,128}$/.test(salt)) throw new RangeError('Tuz yalnız harf, rakam, . / + içerebilir.')
  return `pbkdf2_sha256$${iterations}$${salt}$${await pbkdf2(password, salt, iterations)}`
}

function parseStored(stored: string): { iterations: number; salt: string; hash: string } | null {
  const match = /^pbkdf2_sha256\$([0-9]{1,9})\$([A-Za-z0-9./+]{1,128})\$([A-Za-z0-9+/=]{1,128})$/.exec(stored)
  if (!match) return null
  const iterations = Number(match[1])
  if (iterations < 1 || iterations > MAX_ITERATIONS) return null
  return { iterations, salt: match[2] ?? '', hash: match[3] ?? '' }
}

/** Parolayı saklanan özetle sabit zamanlı karşılaştırır. Bozuk özet → false. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parseStored(stored)
  if (parsed === null) return false
  return timingSafeEqual(await pbkdf2(password, parsed.salt, parsed.iterations), parsed.hash)
}

/** Özet eski (daha az turlu) ya da bozuksa true: kullanıcı giriş yaptığında yeniden özetleyin. */
export function needsRehash(stored: string, iterations = DEFAULT_PASSWORD_ITERATIONS): boolean {
  const parsed = parseStored(stored)
  return parsed === null || parsed.iterations < iterations
}
