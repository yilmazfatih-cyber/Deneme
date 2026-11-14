/**
 * TV'ye Bağlan sayfasının saf parçaları (birim testi: pair.test.ts): hata sınıflaması ve varsayılan profil seçimi.
 */
import type { ManagedProfile } from '../../../../shared/devices'

export type PairProblem = 'notFound' | 'expired' | 'throttled' | 'offline' | 'unknown'

/** deviceClient hatası (Error.message = sunucu kodu, status alanı) → sakin durum. */
export function classifyPairError(err: unknown): PairProblem {
  const status = (err as { status?: unknown })?.status
  const code = err instanceof Error ? err.message : ''
  if (status === 429 || code === 'RATE_LIMITED') return 'throttled'
  if (status === 404 || code === 'CODE_NOT_FOUND') return 'notFound'
  if (err instanceof TypeError) return 'offline'
  return 'unknown'
}

export const PROBLEM_TEXT: Record<PairProblem, { title: string; message: string }> = {
  notFound: {
    title: 'Bu kod bulunamadı',
    message: "Kod yanlış yazılmış ya da süresi dolmuş olabilir. TV'deki güncel kodu gir.",
  },
  expired: {
    title: 'Kodun süresi doldu',
    message: 'TV yeni bir kod gösteriyor. Yeni QR kodu okut ya da kodu buraya gir.',
  },
  throttled: {
    title: 'Biraz bekle',
    message: 'Kısa sürede çok fazla kod denendi. Birkaç dakika sonra tekrar dene.',
  },
  offline: {
    title: 'Bağlantı yok',
    message: 'İnternet bağlantını kontrol edip tekrar dene.',
  },
  unknown: {
    title: 'Şu an bağlanamadık',
    message: 'Birazdan tekrar dene.',
  },
}

/** "TV'de seçerim" seçeneği */
export const CHOOSE_ON_TV = ''

/**
 * Varsayılan profil: etkin profil kilitli değilse o; değilse kilitsiz ilk profil; hepsi kilitliyse TV'de seçilir.
 * Kilitli profil hiçbir zaman önceden seçilmez (PIN TV'de sorulur).
 */
export function defaultProfile(profiles: readonly ManagedProfile[], activeGuid: string | null): string {
  const active = profiles.find((p) => p.guid === activeGuid)
  if (active && !active.isLocked) return active.guid
  return profiles.find((p) => !p.isLocked)?.guid ?? CHOOSE_ON_TV
}

/** Onaylanırken sunucuya giden profil: kilitli profil ya da "TV'de seçerim" → yok (TV profil kapısını gösterir). */
export function profileForApprove(profiles: readonly ManagedProfile[], chosen: string): string | undefined {
  const p = profiles.find((x) => x.guid === chosen)
  return p && !p.isLocked ? p.guid : undefined
}

/** Kalan süre metni "9:41" */
export function countdownText(expiresAt: string, now: number): string | null {
  const t = Date.parse(expiresAt)
  if (!Number.isFinite(t)) return null
  const s = Math.max(0, Math.ceil((t - now) / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
