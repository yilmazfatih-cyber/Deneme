/**
 * Cihazlara varsayılan ad verme: tür, tarayıcı (User-Agent) ve biliniyorsa profil adından Türkçe bir ad kurar
 * ("TV · Chrome", "Deniz'in telefonu", "Web · Chrome · Mac"). Aynı hesapta aynı ad varsa sonuna sıra eklenir ("TV 2").
 */
import type { DeviceKind } from '../../../../shared/devices'

export function browserName(ua: string | null | undefined): string {
  const s = ua ?? ''
  if (/Tizen/i.test(s)) return 'Tizen'
  if (/Web0S|webOS/i.test(s)) return 'webOS'
  if (/SamsungBrowser/i.test(s)) return 'Samsung Internet'
  if (/Edg(e|A|iOS)?\//.test(s)) return 'Edge'
  if (/OPR\/|Opera/.test(s)) return 'Opera'
  if (/Firefox\/|FxiOS\//.test(s)) return 'Firefox'
  if (/Chrome\/|CriOS\//.test(s)) return 'Chrome'
  if (/Safari\//.test(s) && /Version\//.test(s)) return 'Safari'
  return 'Tarayıcı'
}

export function osName(ua: string | null | undefined): string | null {
  const s = ua ?? ''
  if (/iPhone/.test(s)) return 'iPhone'
  if (/iPad/.test(s)) return 'iPad'
  if (/Android/.test(s)) return 'Android'
  if (/CrOS/.test(s)) return 'Chrome OS'
  if (/Mac OS X|Macintosh/.test(s)) return 'Mac'
  if (/Windows/.test(s)) return 'Windows'
  if (/Linux/.test(s)) return 'Linux'
  return null
}

const VOWELS = 'aeıioöuü'

/** Türkçe tamlayan eki: "Deniz" → "Deniz'in", "Ayşe" → "Ayşe'nin", "Çocuk" → "Çocuk'un". */
export function possessive(name: string): string {
  const lower = name.toLocaleLowerCase('tr-TR')
  let last: string | null = null
  for (let i = lower.length - 1; i >= 0; i--) {
    const ch = lower[i]!
    if (VOWELS.includes(ch)) {
      last = ch
      break
    }
  }
  const vowel =
    last === null ? 'i' : 'aı'.includes(last) ? 'ı' : 'ei'.includes(last) ? 'i' : 'ou'.includes(last) ? 'u' : 'ü'
  const endsWithVowel = VOWELS.includes(lower.at(-1) ?? '')
  return `${name}'${endsWithVowel ? 'n' : ''}${vowel}n`
}

export function defaultDeviceName(kind: DeviceKind, ua: string | null | undefined, profileName: string | null): string {
  const browser = browserName(ua)
  if (kind === 'TV') return `TV · ${browser}`
  if (kind === 'MOBILE') return profileName ? `${possessive(profileName)} telefonu` : `Telefon · ${browser}`
  const os = osName(ua)
  return os ? `Web · ${browser} · ${os}` : `Web · ${browser}`
}

/** Aynı hesapta çakışan adlara sıra ekler: "TV · Chrome" → "TV · Chrome 2". Karşılaştırma büyük/küçük harf duyarsızdır. */
export function uniqueName(base: string, taken: Iterable<string>): string {
  const set = new Set<string>()
  for (const t of taken) set.add(t.toLocaleLowerCase('tr-TR'))
  if (!set.has(base.toLocaleLowerCase('tr-TR'))) return base
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base} ${n}`
    if (!set.has(candidate.toLocaleLowerCase('tr-TR'))) return candidate
  }
  return base
}
