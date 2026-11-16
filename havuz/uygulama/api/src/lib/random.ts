/**
 * Saat, rastgele kaynak, kimlik ve belirteç üretimi. Saat ve rastgele kaynak işlevlere DIŞARIDAN verilir ki
 * testler zamanı ileri sarabilsin ve sonuçlar yeniden üretilebilsin.
 *
 * Belirteçler (oturum, şifre sıfırlama, davet): 32 bayt rastgele → base64url (43 karakter). Veritabanına yalnız
 * SHA-256 özeti yazılır; kendisi yalnız kullanıcıya bir kez gösterilir/gönderilir.
 *
 * Genişletme: yeni bir gizli değer türü gerekiyorsa `newToken` + `hashToken` ikilisini kullanın; düz saklamayın.
 */
import { createHash, randomBytes } from 'node:crypto'
import { uuidv7 } from '@uygulama/shared'

export interface Clock {
  now(): Date
}

export interface RandomSource {
  bytes(size: number): Uint8Array
}

export const systemClock: Clock = { now: () => new Date() }

export const cryptoRandom: RandomSource = { bytes: (size) => randomBytes(size) }

/** Zaman sıralı yeni kimlik (UUIDv7). */
export function newId(clock: Clock, random: RandomSource): string {
  return uuidv7(clock.now().getTime(), (bytes) => bytes.set(random.bytes(bytes.length)))
}

export const TOKEN_BYTES = 32
/** base64url, dolgusuz: 32 bayt → 43 karakter. */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

export function newToken(random: RandomSource): string {
  return Buffer.from(random.bytes(TOKEN_BYTES)).toString('base64url')
}

/** Belirtecin veritabanında saklanan özeti (SHA-256, onaltılık). Belirteç yüksek entropili olduğu için tuz gerekmez. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function isTokenFormat(value: string): boolean {
  return TOKEN_PATTERN.test(value)
}

/** ISO zaman + gün/dakika ekleme yardımcıları (saat dilimi yok; hep UTC). */
export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000)
}

export function addDays(date: Date, days: number): Date {
  return addMinutes(date, days * 24 * 60)
}
