/**
 * Cihaz arayüzünün ortak parçaları: tür simgesi, cihaz satırı, oynatma özeti, saniyelik saat, seçici yuvası.
 */
import { useEffect, useState, type ReactElement, type ReactNode } from 'react'
import type { DeviceInfo, DeviceKind, NowPlaying } from '../../../shared/devices'
import { detectFormFactor } from '../lib/formFactor'
import { cx, Icon, LiveTag, Modal, Sheet, type IconName } from '../ui'
import { closeCastPicker, choosePickerDevice, navigateTo, registerPickerHost, usePicker } from './runtime'
import { useDeviceState } from './state'
import { formatClockSec, pickerDevices, positionAt, progressAt } from './progress'
import './devices.css'

export const kindIcon = (kind: DeviceKind): IconName => (kind === 'TV' ? 'tv' : kind === 'MOBILE' ? 'phone' : 'laptop')

export const kindLabel = (kind: DeviceKind): string =>
  kind === 'TV' ? 'TV' : kind === 'MOBILE' ? 'Telefon' : 'Tarayıcı'

/** Etkinken saniyede bir yenilenen saat (yerel ilerleme için). */
export function useTicker(active: boolean, ms = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const t = window.setInterval(() => setNow(Date.now()), ms)
    return () => window.clearInterval(t)
  }, [active, ms])
  return now
}

/** "Sintel" · "Dizi · S1:B3" alt satırı ve canlı etiketi. */
export function NowPlayingText({ np, prefix }: { np: NowPlaying; prefix?: ReactNode }): ReactElement {
  return (
    <span className="dv-np-text">
      <span className="dv-np-text__title">{np.title}</span>
      <span className="dv-np-text__sub">
        {prefix}
        {np.live ? <LiveTag className="dv-live" /> : null}
        {np.subtitle ? <span>{np.subtitle}</span> : null}
      </span>
    </span>
  )
}

export function NowPlayingArt({ np, className }: { np: NowPlaying; className?: string }): ReactElement {
  return (
    <span className={cx('dv-art', className)} aria-hidden="true">
      {np.artUrl ? <img src={np.artUrl} alt="" loading="lazy" /> : <Icon name={np.live ? 'live' : 'play'} size={18} />}
    </span>
  )
}

/** İnce ilerleme çizgisi; canlıda gösterilmez. */
export function ThinProgress({
  np,
  now,
  className,
}: {
  np: NowPlaying
  now: number
  className?: string
}): ReactElement | null {
  const p = progressAt(np, now)
  if (p === null) return null
  return (
    <span
      className={cx('dv-thin', className)}
      role="progressbar"
      aria-label="TV'deki ilerleme"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(p * 100)}
    >
      <span style={{ transform: `scaleX(${p})` }} />
    </span>
  )
}

/** Cihazın durum satırı: "Çevrimiçi · Sintel oynatıyor" / "Çevrimdışı". */
export function deviceStatusText(d: DeviceInfo): string {
  if (!d.online) return 'Çevrimdışı'
  if (d.nowPlaying) return `${d.nowPlaying.paused ? 'Duraklatıldı' : 'Oynatıyor'}: ${d.nowPlaying.title}`
  return 'Çevrimiçi'
}

export function OnlineDot({ online }: { online: boolean }): ReactElement {
  return <span className={cx('dv-dot', online && 'is-on')} aria-hidden="true" />
}

/** Seçici / liste satırı (düğme). */
export function DeviceChoice({
  device,
  selected,
  onSelect,
  disabled,
}: {
  device: DeviceInfo
  selected?: boolean
  onSelect: () => void
  disabled?: boolean
}): ReactElement {
  return (
    <button
      type="button"
      className={cx('dv-choice', selected && 'is-selected', !device.online && 'is-offline')}
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
    >
      <span className="dv-choice__icon">
        <Icon name={kindIcon(device.kind)} size={26} />
        <OnlineDot online={device.online} />
      </span>
      <span className="dv-choice__text">
        <span className="dv-choice__name">{device.name}</span>
        <span className="dv-choice__status">{deviceStatusText(device)}</span>
      </span>
      {selected ? <Icon name="check" size={22} className="dv-choice__check" /> : null}
    </button>
  )
}

/* ───────────── Seçici ───────────── */

function PickerBody(): ReactElement {
  const { devices, targetDeviceId } = useDeviceState()
  const { req } = usePicker()
  const list = pickerDevices(devices)
  return (
    <div className="dv-picker">
      {req?.title ? <p className="dv-picker__lead">{req.title} hangi TV'de açılsın?</p> : null}
      {list.length === 0 ? (
        <p className="dv-picker__empty">Çevrimiçi TV yok. TV'de TV+'ı aç ve telefonunla giriş yap.</p>
      ) : (
        <div className="dv-picker__list">
          {list.map((d) => (
            <DeviceChoice
              key={d.deviceId}
              device={d}
              selected={d.deviceId === targetDeviceId}
              disabled={!d.online}
              onSelect={() => void choosePickerDevice(d)}
            />
          ))}
        </div>
      )}
      <button
        type="button"
        className="dv-picker__link"
        onClick={() => {
          closeCastPicker()
          navigateTo('/cihazlar')
        }}
      >
        <Icon name="qr" size={20} />
        TV'ye Bağlan
      </button>
    </div>
  )
}

/** Ayrı kökte çizilen seçici: telefonda alt sayfa, masaüstünde küçük pencere. */
function CastPickerHost(): ReactElement {
  const { open } = usePicker()
  const mobile = detectFormFactor() === 'mobile'
  if (mobile)
    return (
      <Sheet open={open} onClose={closeCastPicker} title="TV'de İzle">
        <PickerBody />
      </Sheet>
    )
  return (
    <Modal open={open} onClose={closeCastPicker} label="TV'de İzle" maxWidth={440} className="dv-picker-modal">
      <h2 className="dv-picker-modal__title">TV'de İzle</h2>
      <PickerBody />
    </Modal>
  )
}

registerPickerHost(CastPickerHost)

/** Konum metni "12:04 / 14:48" (canlıda null). */
export function timeLine(np: NowPlaying, now: number): string | null {
  if (np.live || np.durationSec === null) return null
  return `${formatClockSec(positionAt(np, now))} / ${formatClockSec(np.durationSec)}`
}
