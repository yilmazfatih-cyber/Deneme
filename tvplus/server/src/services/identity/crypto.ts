/** Kimlik katmanının küçük kripto yardımcıları: HMAC (base64url), sabit zamanlı karşılaştırma, base32. */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

export const hmacB64 = (key: Buffer, data: string): string => createHmac('sha256', key).update(data).digest('base64url')

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** RFC 4648 base32 (büyük harf, dolgusuz). */
export function base32(buf: Buffer): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]
  return out
}

export const BASE32_RE = /^[A-Z2-7]+$/

/** Kararlı profil GUID'i: 24 karakter büyük harf base32 (Netflix `pg=LAQPMOV7TNE6VC2US7RJZ6T2`). */
export function stableGuid(seed: string): string {
  return base32(createHash('sha256').update(`tvplus|profile|${seed}`).digest()).slice(0, 24)
}
