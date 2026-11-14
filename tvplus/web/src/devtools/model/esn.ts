/**
 * ESN (cihaz seri numarası) ayrıştırıcı. Netflix `NFCDCH-MC-<özet>` → TV+ `TVPWCH-MC-<özet>`:
 *   TVP (marka) · W (web istemcisi) · CH (tarayıcı) · MC (platform) · <özet> (cihaz özeti)
 */
export interface EsnPart {
  code: string
  label: string
  meaning: string
}

const BROWSERS: Record<string, string> = {
  CH: 'Chrome',
  FF: 'Firefox',
  SF: 'Safari',
  ED: 'Edge',
  OP: 'Opera',
  SA: 'Samsung Internet',
  XX: 'bilinmeyen tarayıcı',
}
const PLATFORMS: Record<string, string> = {
  MC: 'macOS',
  WI: 'Windows',
  WN: 'Windows',
  LX: 'Linux',
  LI: 'Linux',
  AN: 'Android',
  AD: 'Android',
  IO: 'iOS',
  IP: 'iOS',
  CR: 'ChromeOS',
  XX: 'bilinmeyen platform',
}

/** Ayrıştırılamazsa null döner; çağıran ham dizgeyi gösterir. */
export function splitEsn(esn: string | null | undefined): EsnPart[] | null {
  if (!esn) return null
  const m = /^([A-Z]{3})([A-Z])([A-Z0-9]{2})-([A-Z0-9]{2})-(.+)$/.exec(esn.trim())
  if (!m) return null
  const [, brand, client, browser, platform, hash] = m as unknown as [string, string, string, string, string, string]
  return [
    { code: brand, label: 'Marka', meaning: brand === 'TVP' ? 'TV+' : brand === 'NFC' ? 'Netflix' : brand },
    { code: client, label: 'İstemci', meaning: client === 'W' ? 'web' : client },
    { code: browser, label: 'Tarayıcı', meaning: BROWSERS[browser] ?? browser },
    { code: platform, label: 'Platform', meaning: PLATFORMS[platform] ?? platform },
    { code: hash, label: 'Cihaz özeti', meaning: 'bu tarayıcıya özgü kimlik' },
  ]
}
