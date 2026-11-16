/**
 * Kimlikler. Her kayıt kimliğini istemci üretir (çevrimdışıyken de kayıt açılabilsin diye).
 * UUIDv7 kullanılır: ilk 48 bit zaman olduğu için kimlikler kabaca oluşturulma sırasına göre sıralanır.
 *
 * Genişletme: başka bir kimlik biçimi gerekirse `ID_PATTERN`'e uyması yeterlidir (harf, rakam, `_`, `-`; en çok 64).
 */
import { z } from 'zod'

/** Sunucunun kabul ettiği kimlik biçimi. UUID zorunlu değildir; `local` gibi sabit adlar da geçerlidir. */
export const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

export const idSchema = z.string().regex(ID_PATTERN, 'Geçersiz kimlik')

export function isId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value)
}

/** Verilen diziyi yerinde rastgele baytlarla dolduran işlev (test için değiştirilebilir). */
type RandomFill = (bytes: Uint8Array<ArrayBuffer>) => void

const cryptoFill: RandomFill = (bytes) => {
  globalThis.crypto.getRandomValues(bytes)
}

/**
 * UUIDv7 üretir (RFC 9562). `now` ve `fill` test için dışarıdan verilebilir.
 *
 * @example uuidv7() // '0193a5c8-4f2e-7b1a-9c3d-5e6f7a8b9c0d'
 */
export function uuidv7(now: number = Date.now(), fill: RandomFill = cryptoFill): string {
  const bytes = new Uint8Array(16)
  fill(bytes)
  const ms = Math.max(0, Math.floor(now))
  // 48 bit zaman damgası (büyük uçlu). 2^32'den büyük olduğu için bölerek ayırıyoruz.
  const high = Math.floor(ms / 2 ** 32)
  const low = ms >>> 0
  bytes[0] = (high >>> 8) & 0xff
  bytes[1] = high & 0xff
  bytes[2] = (low >>> 24) & 0xff
  bytes[3] = (low >>> 16) & 0xff
  bytes[4] = (low >>> 8) & 0xff
  bytes[5] = low & 0xff
  bytes[6] = 0x70 | ((bytes[6] ?? 0) & 0x0f) // sürüm 7
  bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f) // RFC varyantı
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** UUIDv7'nin içindeki zaman damgasını (ms) geri verir; biçim uymuyorsa `null`. */
export function uuidv7Time(id: string): number | null {
  const hex = id.replaceAll('-', '')
  if (hex.length !== 32 || hex[12] !== '7' || !/^[0-9a-f]+$/i.test(hex)) return null
  return Number.parseInt(hex.slice(0, 12), 16)
}
