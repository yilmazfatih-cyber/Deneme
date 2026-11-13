/**
 * Profil kilidi: 4 haneli PIN yalnız tuzlu scrypt özeti olarak saklanır, hiçbir yanıtta dönmez.
 * Art arda 5 yanlış denemede profil 60 sn kilitlenir (429). Sayaçlar bellektedir (yeniden başlatmada sıfırlanır).
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'

export interface PinHash {
  salt: string
  hash: string
}

export const PIN_RE = /^\d{4}$/
export const PIN_MAX_FAILS = 5
export const PIN_LOCK_MS = 60_000
const KEY_LEN = 32
/** Düşük maliyet: 4 haneli PIN'in asıl koruması deneme sınırıdır; özet yalnız dosya sızıntısına karşı. */
const SCRYPT_OPTS = { N: 1 << 14, r: 8, p: 1 }

/** Testlerin saati ileri alabilmesi için değiştirilebilir saat */
export const pinClock = { now: (): number => Date.now() }

function scrypt(pin: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(pin, salt, KEY_LEN, SCRYPT_OPTS, (err, key) => (err ? reject(err) : resolve(key))),
  )
}

export async function hashPin(pin: string): Promise<PinHash> {
  const salt = randomBytes(16)
  const key = await scrypt(pin, salt)
  return { salt: salt.toString('base64url'), hash: key.toString('base64url') }
}

export async function verifyPin(pin: string, stored: PinHash): Promise<boolean> {
  if (!PIN_RE.test(pin)) return false
  const key = await scrypt(pin, Buffer.from(stored.salt, 'base64url'))
  const want = Buffer.from(stored.hash, 'base64url')
  return want.length === key.length && timingSafeEqual(want, key)
}

/** Profil başına yanlış deneme sayacı ve kilit */
export function createPinGuard() {
  const state = new Map<string, { fails: number; lockedUntil: number }>()
  return {
    /** Kilitliyse kalan süre (ms), değilse 0 */
    lockedFor(guid: string): number {
      const s = state.get(guid)
      if (!s || s.lockedUntil === 0) return 0
      const left = s.lockedUntil - pinClock.now()
      if (left > 0) return left
      state.delete(guid)
      return 0
    },
    /** Yanlış deneme; kilit başladıysa true */
    fail(guid: string): boolean {
      const s = state.get(guid) ?? { fails: 0, lockedUntil: 0 }
      s.fails++
      if (s.fails >= PIN_MAX_FAILS) {
        s.fails = 0
        s.lockedUntil = pinClock.now() + PIN_LOCK_MS
      }
      state.set(guid, s)
      return s.lockedUntil > 0
    },
    reset(guid: string): void {
      state.delete(guid)
    },
  }
}
export type PinGuard = ReturnType<typeof createPinGuard>
