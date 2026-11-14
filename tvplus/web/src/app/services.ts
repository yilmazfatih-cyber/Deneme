/**
 * Profil kapısından sonra çalışan arka plan hizmetleri (ekran biçiminden bağımsız; TV dahil):
 *   - FTL ağ yoklaması (oynatıcının ağ katmanı; oynatıcı parçası tembel kalsın diye dinamik içe aktarma)
 *   - çıkışta olay günlüğünü boşaltma (sendBeacon)
 *   - cihaz kaydı + komut akışı: deviceClient.start({ kind }) — profil değişince yeniden (cihaz listesinde profil adı
 *     güncellensin), çıkışta stop().
 */
import { useEffect } from 'react'
import type { DeviceKind } from '../../../shared/devices'
import { deviceClient } from '../devices/client'
import { devbus } from '../lib/devbus'
import type { FormFactor } from '../lib/formFactor'
import { installEventFlushOnExit } from '../telemetry/logger'
import { useSession } from './sessionStore'

export function deviceKindOf(ff: FormFactor): DeviceKind {
  return ff === 'tv' ? 'TV' : ff === 'mobile' ? 'MOBILE' : 'WEB'
}

let onceStarted = false
let deviceFor: string | null = null

function startOnce(): void {
  if (onceStarted) return
  onceStarted = true
  installEventFlushOnExit()
  void import('../player')
    .then((m) => m.startNetworkProbing())
    .catch((err: unknown) =>
      devbus.emit('session', 'ağ yoklaması başlatılamadı', { error: String(err) }, { ok: false }),
    )
}

/**
 * Kök bileşende bir kez çağrılır. Cihaz türü ilk açılıştaki ekran biçimidir (pencere daralınca masaüstü
 * tarayıcı telefon olmaz).
 */
export function useProfileServices(formFactor: FormFactor): void {
  const member = useSession((s) => s.boot?.membershipStatus === 'CURRENT_MEMBER')
  const profileGuid = useSession((s) => s.boot?.activeProfile?.guid ?? null)

  useEffect(() => {
    if (member && profileGuid) {
      startOnce()
      if (deviceFor !== profileGuid) {
        deviceFor = profileGuid
        try {
          deviceClient.start({ kind: deviceKindOf(formFactor) })
          // Yansıtma seçicisi ve gelen yansıtmalar hangi sayfadan girilirse girilsin hazır olsun (ör. doğrudan /izle).
          // Seçicinin yuvası devices/ui'de kaydolur; o yüklenmeden "TV'de İzle" birden çok TV varken hiçbir şey çizemez.
          if (formFactor !== 'tv')
            void Promise.all([import('../devices/runtime'), import('../devices/ui')])
              .then(([m]) => m.installDeviceUi())
              .catch(() => {})
        } catch (err) {
          devbus.emit('device', 'kayıt başlatılamadı', { error: String(err) }, { ok: false })
        }
      }
    } else if (!member && deviceFor !== null) {
      deviceFor = null
      try {
        deviceClient.stop()
      } catch {
        /* akış zaten kapalı */
      }
    }
  }, [member, profileGuid]) // ekran biçimi bilerek bağımlılık değil (bkz. işlev açıklaması)
}
