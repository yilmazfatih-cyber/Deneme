/**
 * Yönetici kipi (istemci tarafı): açılış bağlamındaki `isAdmin` ve aç / kapat eylemleri.
 *
 * Kip cihaza bağlıdır: yönetici kodu bir kez girilir, sunucu bunu imzalı bir çerezle hatırlar. Arayüz Yönetici
 * Paneli, Stüdyo ve "Kaputun altı" girişlerini yalnız yöneticiye gösterir; kip kapalıyken bunların hiçbiri görünmez.
 * Buradaki gizleme tek başına koruma değildir: sunucu aynı kuralı kendi uçlarında uygular.
 *
 *   useIsAdmin()        React: bu cihazda yönetici kipi açık mı
 *   isAdminNow()        React dışı anlık değer
 *   unlockAdmin(kod)    kodu sunucuya doğrulatır; başarılıysa açılış bağlamını yeniler
 *   lockAdmin()         kipi kapatır
 */
import { ROUTES } from '../../../shared/constants'
import type { AdminState } from '../../../shared/types'
import { peekBoot } from '../api/session'
import { ApiRequestError, requestJson } from './deviceApi'
import { useSession } from './sessionStore'

export const useIsAdmin = (): boolean => useSession((s) => s.boot?.isAdmin === true)
export const isAdminNow = (): boolean => peekBoot()?.isAdmin === true

export type AdminUnlockResult =
  | { ok: true }
  | { ok: false; code: 'INVALID' | 'LOCKED' | 'DISABLED' | 'ERROR'; message: string; retryAfterSec?: number }

/** Sunucu iletisindeki bekleme süresi ("… 41 sn sonra …"); okunamazsa 60 sn. */
export function retryAfterOf(message: string): number {
  const m = /(\d+)\s*sn/.exec(message)
  return m ? Number(m[1]) : 60
}

/** Sunucu hata kodunu arayüzün sonucuna çevirir (saf). */
export function unlockFailure(code: string | null, message: string): Exclude<AdminUnlockResult, { ok: true }> {
  if (code === 'ADMIN_CODE_INVALID') return { ok: false, code: 'INVALID', message: 'Yönetici kodu yanlış.' }
  if (code === 'ADMIN_LOCKED' || code === 'HTTP_429') {
    const sec = retryAfterOf(message)
    return {
      ok: false,
      code: 'LOCKED',
      message: `Çok fazla yanlış deneme. ${sec} sn sonra yeniden dene.`,
      retryAfterSec: sec,
    }
  }
  if (code === 'ADMIN_DISABLED') return { ok: false, code: 'DISABLED', message: 'Yönetici kipi bu kurulumda kapalı.' }
  return { ok: false, code: 'ERROR', message: 'Yönetici kipi açılamadı. Tekrar dene.' }
}

export async function unlockAdmin(code: string): Promise<AdminUnlockResult> {
  try {
    const res = await requestJson<AdminState | null>('POST', ROUTES.ADMIN_UNLOCK, { code })
    await useSession.getState().reloadBoot()
    return res?.isAdmin || isAdminNow() ? { ok: true } : unlockFailure(null, '')
  } catch (err) {
    if (err instanceof ApiRequestError) return unlockFailure(err.code, err.message)
    return unlockFailure(null, '')
  }
}

export async function lockAdmin(): Promise<boolean> {
  try {
    await requestJson<AdminState | null>('POST', ROUTES.ADMIN_LOCK, {})
    await useSession.getState().reloadBoot()
    return !isAdminNow()
  } catch {
    return false
  }
}
