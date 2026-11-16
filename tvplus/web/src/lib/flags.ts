/**
 * Deney / özellik bayrakları (istemci): açılış bağlamındaki `flags` ve `experiments` (bkz. shared/flags.ts).
 *   getFlag(key)  anlık değer (bağlam yoksa ya da değer tanınmıyorsa varsayılan)
 *   useFlag(key)  React kancası; bağlam değişince (profil değişimi, giriş) yeniden çizer. İSTEMCİ bayrağı ilk
 *                 okunduğunda, o bayrağı yöneten deney ataması varsa oturum başına bir kez maruziyet olayı yollar.
 * Sunucu bayraklarının maruziyetini sunucu yazar (lolomo kurulunca); burada yalnız `side: 'client'` bayraklar sayılır.
 */
import { useEffect, useSyncExternalStore } from 'react'
import { DEFAULT_FLAGS, EXPOSURE_EVENT, FLAGS, isFlagValue, type FlagKey, type FlagValue } from '../../../shared/flags'
import { onBootChange, peekBoot } from '../api/session'
import { logEvent } from '../telemetry/logger'

export function getFlag<K extends FlagKey>(key: K): FlagValue<K> {
  const v: unknown = peekBoot()?.flags?.[key]
  return isFlagValue(key, v) ? (v as FlagValue<K>) : DEFAULT_FLAGS[key]
}

/** Bu oturumda maruziyeti yazılmış (profil|deney|kol) üçlüleri */
const exposed = new Set<string>()

/**
 * İstemci bayrağı okundu: bayrağı yöneten deney ataması varsa (profil + deney + kol için oturumda bir kez)
 * `experiment.exposure` olayı yollar. Sunucu bayrağında bir şey yapmaz.
 */
export function noteFlagRead(key: FlagKey): void {
  if (FLAGS[key].side !== 'client') return
  const boot = peekBoot()
  if (!boot) return
  for (const a of boot.experiments ?? []) {
    if (!a.flags.includes(key)) continue
    const k = `${boot.activeProfile?.guid ?? '-'}|${a.experiment}|${a.variant}`
    if (exposed.has(k)) continue
    exposed.add(k)
    logEvent(EXPOSURE_EVENT as 'experiment.exposure', { experiment: a.experiment, variant: a.variant })
  }
}

export function useFlag<K extends FlagKey>(key: K): FlagValue<K> {
  const value = useSyncExternalStore(
    (onChange) => onBootChange(() => onChange()),
    () => getFlag(key),
    () => getFlag(key),
  )
  useEffect(() => noteFlagRead(key), [key, value])
  return value
}

/** Yalnız testler: oturum içi maruziyet belleğini sıfırlar */
export function resetFlagExposures(): void {
  exposed.clear()
}
