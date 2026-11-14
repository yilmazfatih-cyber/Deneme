/**
 * Profil PIN'i deneme sınırı (istemci tarafı yavaşlatma): art arda 5 yanlış PIN → 60 sn bekleme.
 * Sunucu da kendi sınırını uygulayabilir ('PIN_LOCKED' / 429); bu yalnız gereksiz istekleri ve tahmini keser.
 * Saf durum makinesi — birim testi: pinLock.test.ts.
 */
export const PIN_MAX_ATTEMPTS = 5
export const PIN_LOCK_MS = 60_000

export interface PinAttemptState {
  failures: number
  /** epoch ms; bu ana dek deneme yapılamaz */
  lockedUntil: number
}

export const EMPTY_PIN_STATE: PinAttemptState = { failures: 0, lockedUntil: 0 }

/** Kalan bekleme (sn, yukarı yuvarlanır); kilitli değilse 0. */
export function pinLockRemainingSec(s: PinAttemptState, now: number): number {
  return s.lockedUntil > now ? Math.ceil((s.lockedUntil - now) / 1000) : 0
}

/** Yanlış PIN sonrası yeni durum: 5. yanlışta kilitlenir ve sayaç sıfırlanır. */
export function registerPinFailure(s: PinAttemptState, now: number): PinAttemptState {
  const failures = s.failures + 1
  if (failures >= PIN_MAX_ATTEMPTS) return { failures: 0, lockedUntil: now + PIN_LOCK_MS }
  return { failures, lockedUntil: s.lockedUntil }
}

/** "Çok fazla deneme. 1 dk sonra tekrar dene." */
export function pinLockMessage(remainingSec: number): string {
  const text = remainingSec >= 60 ? `${Math.ceil(remainingSec / 60)} dk` : `${remainingSec} sn`
  return `Çok fazla deneme. ${text} sonra tekrar dene.`
}
