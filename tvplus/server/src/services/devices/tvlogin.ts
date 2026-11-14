/**
 * TV'de kodla giriş kayıtları (OAuth "device authorization grant"): TV gizli `deviceCode` ile yoklar, kullanıcı
 * telefonda kısa `userCode`'u onaylar. Kayıtlar bellektedir (10 dk ömürlü); sunucu yeniden başlarsa TV yeni kod ister.
 */
import { randomBytes, randomInt } from 'node:crypto'
import type { DeviceKind, TvLoginStatus } from '../../../../shared/devices'

/** Karışan karakterler yok: 0/O, 1/I/L. */
export const USER_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export interface TvLoginEntry {
  deviceCode: string
  /** Tiresiz 8 karakter */
  userCode: string
  deviceId: string
  deviceName: string
  deviceKind: DeviceKind
  /** Telefonun açacağı adres (QR bunu kodlar) */
  verificationUrl: string
  requestedAt: number
  expiresAt: number
  status: Exclude<TvLoginStatus, 'EXPIRED'>
  accountId: string | null
  profileGuid: string | null
  lastPollAt: number | null
  /** Onaylı kayıt için loginDevice çağrısı sürüyor (ikinci yoklama beklemesin, ikinci kez çağırmasın) */
  consuming: boolean
}

export const formatUserCode = (code: string): string => `${code.slice(0, 4)}-${code.slice(4)}`
/** Kullanıcının yazdığı kodu sadeleştirir: büyük harf, tire ve boşluk yok. */
export const normalizeUserCode = (raw: string): string => raw.toUpperCase().replace(/[\s-]/g, '')

export interface TvLoginStore {
  create(input: {
    deviceId: string
    deviceName: string
    deviceKind: DeviceKind
    ttlMs: number
    /** Tiresiz kullanıcı kodundan doğrulama adresini kurar */
    verificationUrl: (userCode: string) => string
  }): TvLoginEntry
  byUserCode(code: string): TvLoginEntry | null
  byDeviceCode(code: string): TvLoginEntry | null
  remove(entry: TvLoginEntry): void
}

export function createTvLoginStore(now: () => number): TvLoginStore {
  const byDevice = new Map<string, TvLoginEntry>()
  const byUser = new Map<string, TvLoginEntry>()

  const sweep = () => {
    const t = now()
    for (const e of byDevice.values()) if (e.expiresAt <= t) remove(e)
  }
  const remove = (e: TvLoginEntry) => {
    byDevice.delete(e.deviceCode)
    if (byUser.get(e.userCode) === e) byUser.delete(e.userCode)
  }
  const newUserCode = (): string => {
    for (;;) {
      let s = ''
      for (let i = 0; i < 8; i++) s += USER_CODE_ALPHABET[randomInt(USER_CODE_ALPHABET.length)]
      if (!byUser.has(s)) return s
    }
  }
  const live = (e: TvLoginEntry | undefined): TvLoginEntry | null => {
    if (!e) return null
    if (e.expiresAt <= now()) {
      remove(e)
      return null
    }
    return e
  }

  return {
    create(input) {
      sweep()
      const t = now()
      const userCode = newUserCode()
      const entry: TvLoginEntry = {
        deviceCode: randomBytes(32).toString('base64url'),
        userCode,
        verificationUrl: input.verificationUrl(userCode),
        deviceId: input.deviceId,
        deviceName: input.deviceName,
        deviceKind: input.deviceKind,
        requestedAt: t,
        expiresAt: t + input.ttlMs,
        status: 'PENDING',
        accountId: null,
        profileGuid: null,
        lastPollAt: null,
        consuming: false,
      }
      byDevice.set(entry.deviceCode, entry)
      byUser.set(entry.userCode, entry)
      return entry
    },
    byUserCode: (code) => live(byUser.get(normalizeUserCode(code))),
    byDeviceCode: (code) => live(byDevice.get(code)),
    remove,
  }
}
