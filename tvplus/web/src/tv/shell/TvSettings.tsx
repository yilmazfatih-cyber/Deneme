/**
 * Ayarlar (/tv/ayarlar): bu TV'nin adı, hesaptaki cihazlar, "Profil Değiştir", "Çıkış Yap".
 */
import { useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import type { DeviceInfo } from '../../../../shared/devices'
import { useFocusable } from '../focus'
import { TvActionList, TvButton, TvDialog, TvIcon, TvList, TvScreen, tvToast, type TvIconName } from '../ui'
import { stopTvDevice, useDeviceState } from './device'
import { TV_PATHS } from './routes'
import { logout, useTvBoot } from './session'

const KIND_ICON: Record<DeviceInfo['kind'], TvIconName> = { TV: 'tv', MOBILE: 'phone', WEB: 'laptop' }
const KIND_TEXT: Record<DeviceInfo['kind'], string> = { TV: 'TV', MOBILE: 'Telefon', WEB: 'Tarayıcı' }
const CONNECTION_TEXT = {
  idle: 'Bağlanmadı',
  connecting: 'Bağlanıyor…',
  online: 'Bağlı',
  offline: 'Bağlantı yok, yeniden deneniyor',
} as const

function statusOf(d: DeviceInfo): string {
  if (!d.online) return 'Çevrimdışı'
  if (d.nowPlaying) return `${d.profileName ? `${d.profileName} · ` : ''}${d.nowPlaying.title} oynatıyor`
  return d.profileName ? `Çevrimiçi · ${d.profileName}` : 'Çevrimiçi'
}

function DeviceRow({ device }: { device: DeviceInfo }): ReactElement {
  const { ref, focused } = useFocusable<HTMLDivElement>({ id: `ayarlar:cihaz:${device.deviceId}` })
  return (
    <div ref={ref} role="listitem" className={`tv-device${focused ? ' is-focused' : ''}`}>
      <TvIcon name={KIND_ICON[device.kind]} size={2.2} />
      <div className="tv-device__text">
        <div className="tv-device__name">
          {device.name}
          {device.isThisDevice && <span className="tv-device__this">Bu TV</span>}
        </div>
        <div className="tv-device__status">
          <span className={`tv-device__dot${device.online ? ' is-online' : ''}`} aria-hidden="true" />
          {KIND_TEXT[device.kind]} · {statusOf(device)}
        </div>
      </div>
    </div>
  )
}

export function TvSettings(): ReactElement {
  const navigate = useNavigate()
  const boot = useTvBoot()
  const state = useDeviceState()
  const [confirm, setConfirm] = useState(false)
  const others = state.devices.filter((d) => !d.isThisDevice)

  const signOut = (): void => {
    setConfirm(false)
    logout().then(
      () => {
        stopTvDevice()
        navigate(TV_PATHS.login, { replace: true })
      },
      () => tvToast('Çıkış yapılamadı. Tekrar dene.'),
    )
  }

  return (
    <TvScreen id="ayarlar" title="Ayarlar" defaultFocus="ayarlar:profil">
      <div className="tv-settings">
        <h1 className="tv-heading">Ayarlar</h1>
        <div className="tv-settings__cols">
          <TvActionList
            id="ayarlar-eylemler"
            actions={[
              {
                id: 'ayarlar:profil',
                label: 'Profil Değiştir',
                icon: 'user',
                onPress: () => navigate(TV_PATHS.profiles),
              },
              {
                id: 'ayarlar:kumanda',
                label: 'Telefonla Kontrol Et',
                icon: 'remote',
                onPress: () => navigate(TV_PATHS.remote),
              },
              { id: 'ayarlar:cikis', label: 'Çıkış Yap', icon: 'signOut', onPress: () => setConfirm(true) },
            ]}
          />
          <div className="tv-settings__panel">
            <section className="tv-settings__section" aria-labelledby="ayarlar-bu-tv">
              <h2 className="tv-settings__label" id="ayarlar-bu-tv">
                Bu TV
              </h2>
              <p className="tv-settings__value">{state.thisDevice?.name ?? 'Bu TV'}</p>
              <p className="tv-subtle">
                {boot?.activeProfile ? `${boot.activeProfile.name} izliyor · ` : ''}
                {CONNECTION_TEXT[state.connection]}
              </p>
            </section>
            <section className="tv-settings__section tv-settings__devices" aria-labelledby="ayarlar-cihazlar">
              <h2 className="tv-settings__label" id="ayarlar-cihazlar">
                Hesaptaki cihazlar
              </h2>
              {others.length ? (
                <TvList id="ayarlar-cihaz-listesi" gap={0.6} label="Hesaptaki cihazlar" className="tv-settings__list">
                  {others.map((d) => (
                    <DeviceRow key={d.deviceId} device={d} />
                  ))}
                </TvList>
              ) : (
                <p className="tv-subtle">
                  Başka cihaz yok. Telefonundan TV+'a girip "TV'ye Bağlan"ı seçerek bu TV'yi kumandayla yönetebilirsin.
                </p>
              )}
            </section>
          </div>
        </div>
      </div>
      {confirm && (
        <TvDialog
          id="cikis-onay"
          title="Çıkış yapılsın mı?"
          message="Bu TV'de yeniden girmek için QR kodunu okutman gerekir."
          onClose={() => setConfirm(false)}
          defaultFocus="cikis-onay:vazgec"
        >
          <div className="tv-dialog__actions">
            <TvButton id="cikis-onay:evet" label="Çıkış Yap" onPress={signOut} />
            <TvButton id="cikis-onay:vazgec" label="Vazgeç" onPress={() => setConfirm(false)} />
          </div>
        </TvDialog>
      )}
    </TvScreen>
  )
}
