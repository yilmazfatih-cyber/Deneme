/**
 * ESN — cihaz seri numarası (Netflix `NFCDCH-MC-MU713AQA0KQ6…`).
 * Biçim: `TVPW<BR>-<OS>-<30 karakter büyük harf base32 cihaz özeti>`
 *   TVP = ürün, W = web oynatıcı, BR = tarayıcı (CH|FF|SF|ED|OT), OS = platform (MC|WN|LX|AN|IO|OT).
 * Cihaz özeti tvpvdid çerezinin HMAC'idir; aynı tarayıcı aynı ESN'yi alır, istemci uyduramaz.
 */
import { createHmac } from 'node:crypto'
import { base32 } from './crypto'

export type EsnBrowser = 'CH' | 'FF' | 'SF' | 'ED' | 'OT'
export type EsnOs = 'MC' | 'WN' | 'LX' | 'AN' | 'IO' | 'OT'

export interface EsnParts {
  product: 'TVP'
  player: 'W'
  browser: EsnBrowser
  os: EsnOs
  deviceHash: string
}

const BROWSERS: readonly EsnBrowser[] = ['CH', 'FF', 'SF', 'ED', 'OT']
const OSES: readonly EsnOs[] = ['MC', 'WN', 'LX', 'AN', 'IO', 'OT']
const ESN_RE = /^TVPW(CH|FF|SF|ED|OT)-(MC|WN|LX|AN|IO|OT)-([A-Z2-7]{30})$/

export function browserFromUserAgent(ua: string | null | undefined): EsnBrowser {
  const s = ua ?? ''
  if (/Edg(e|A|iOS)?\//.test(s)) return 'ED'
  if (/Firefox\/|FxiOS\//.test(s)) return 'FF'
  if (/Chrome\/|CriOS\/|Chromium\//.test(s)) return 'CH'
  if (/Safari\//.test(s) && /Version\//.test(s)) return 'SF'
  return 'OT'
}

export function osFromUserAgent(ua: string | null | undefined): EsnOs {
  const s = ua ?? ''
  if (/iPhone|iPad|iPod/.test(s)) return 'IO'
  if (/Android/.test(s)) return 'AN'
  if (/Macintosh|Mac OS X/.test(s)) return 'MC'
  if (/Windows/.test(s)) return 'WN'
  if (/Linux|X11|CrOS/.test(s)) return 'LX'
  return 'OT'
}

/** Cihaz kimliğinden 30 karakterlik özet. */
export function deviceHash(key: Buffer, deviceId: string): string {
  return base32(createHmac('sha256', key).update(`esn|${deviceId}`).digest()).slice(0, 30)
}

export function formatEsn(parts: Pick<EsnParts, 'browser' | 'os' | 'deviceHash'>): string {
  if (!BROWSERS.includes(parts.browser) || !OSES.includes(parts.os) || !/^[A-Z2-7]{30}$/.test(parts.deviceHash)) {
    throw new Error('Geçersiz ESN parçaları')
  }
  return `TVPW${parts.browser}-${parts.os}-${parts.deviceHash}`
}

export function parseEsn(esn: string): EsnParts | null {
  const m = ESN_RE.exec(esn)
  if (!m) return null
  return { product: 'TVP', player: 'W', browser: m[1] as EsnBrowser, os: m[2] as EsnOs, deviceHash: m[3]! }
}

/** Sunucunun bu istek için türettiği ESN. */
export function deriveEsn(key: Buffer, deviceId: string, userAgent: string | null | undefined): string {
  return formatEsn({ browser: browserFromUserAgent(userAgent), os: osFromUserAgent(userAgent), deviceHash: deviceHash(key, deviceId) })
}
