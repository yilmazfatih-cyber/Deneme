/**
 * Açılış: cihaz veritabanını açar, belirteci güvenli depodan belleğe alır, oturum kaydını okur ve tutarlılığı sağlar.
 *   - Oturum var ama belirteç yok (ör. güvenli depo silinmiş)  → oturum "süresi dolmuş" sayılır (veri kalır).
 *   - Belirteç var ama oturum yok (iOS'ta uygulama silinip yeniden kurulunca Keychain kalır) → belirteç silinir.
 *   - API kapalı derleme → oturum yok sayılır (hesapsız kip).
 *
 * Genişletme: açılışta yapılacak yeni bir hazırlık (ör. eski ayar biçimini çevirme) → `bootSession` içine ekleyin.
 */
import { openDeviceDb, readDeviceState, setDeviceValue, type StoredSession } from '../device/deviceStore.ts'
import type { LocalDb } from '../store/localDb.ts'
import type { ThemeChoice } from '../../ui/theme.tsx'
import { clearToken, loadToken } from './tokenStore.ts'

export interface BootResult {
  readonly device: LocalDb
  readonly session: StoredSession | null
  readonly welcomeDone: boolean
  readonly theme: ThemeChoice
}

export async function bootSession(apiEnabled: boolean): Promise<BootResult> {
  const device = await openDeviceDb()
  const state = await readDeviceState(device)
  const token = await loadToken()
  let session = apiEnabled ? state.session : null
  if (session && !session.expired && token === null) {
    session = { ...session, expired: true }
    await setDeviceValue(device, 'session', session)
  }
  if (!state.session && token !== null) await clearToken()
  return { device, session, welcomeDone: state.welcomeDone, theme: state.theme }
}
