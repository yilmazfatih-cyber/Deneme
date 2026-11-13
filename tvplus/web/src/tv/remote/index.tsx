/**
 * "Telefonla Kontrol Et" (/tv/kumanda) — Ayarlar'dan açılır.
 *
 *   solda   üç kısa adım + hesaptaki telefon ve tarayıcılar (çevrimiçi durumuyla, deviceClient)
 *   sağda   QR (tarayıcıda `qrcode` ile üretilir): bu sunucunun `/#/kumanda` adresi, altında yazılı adres;
 *           telefondan bir tuş geldikçe yanan "kumanda sinyali" göstergesi (gönderen ve tuş)
 *
 * Adres kökü: sayfa yerel ağ adresinden açıldıysa o kök; localhost'tan açıldıysa giriş QR'ıyla aynı yoldan
 * sunucuya sorulur (giriş kodu başlatma yanıtındaki doğrulama adresi makinenin yerel ağ adresini taşır).
 * Sunucu yerel ağ adresi veremezse ekran, telefonda hangi adresin yazılacağını açıklar.
 */
import QRCode from 'qrcode'
import { useEffect, useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import type { DeviceInfo } from '../../../../shared/devices'
import { deviceClient } from '../../devices/client'
import { devbus } from '../../lib/devbus'
import { useFocusable } from '../focus'
import { useDeviceState } from '../shell/device'
import { useTvBack } from '../shell/history'
import { displayAddress, TvButton, TvIcon, TvList, TvScreen, type TvIconName } from '../ui'
import { isLocalHostname, keyLabel, lanOriginOf, phoneRemoteUrl, remoteKeyOf, type RemoteKeyEvent } from './model'
import './remote.css'

const SCREEN = 'kumanda'
const MAX_DEVICES = 4

const cx = (...c: (string | false | null | undefined)[]): string => c.filter(Boolean).join(' ')

/* ───────────── Adres ───────────── */

interface PhoneAddress {
  url: string
  /** 'page' sayfanın kendi kökü · 'server' sunucunun bildirdiği yerel ağ kökü · 'local' yalnız bu makineden */
  source: 'page' | 'server' | 'local'
  /** Adres bu TV'den yoklanabildi mi (yerel ağ kökü dinlenmiyorsa telefon da açamaz); bilinmiyorsa null */
  reachable: boolean | null
}

/** Kökü yoklar: yanıt (opak da olsa) gelirse erişilebilir; bağlantı reddi / zaman aşımı → değil. */
async function probe(origin: string): Promise<boolean> {
  const ctrl = new AbortController()
  const t = window.setTimeout(() => ctrl.abort(), 3000)
  try {
    await fetch(`${origin}/`, { mode: 'no-cors', cache: 'no-store', signal: ctrl.signal })
    return true
  } catch {
    return false
  } finally {
    window.clearTimeout(t)
  }
}

let resolved: Promise<PhoneAddress> | null = null

function resolveAddress(): Promise<PhoneAddress> {
  if (resolved) return resolved
  const here = window.location.origin
  if (!isLocalHostname(window.location.hostname)) {
    resolved = Promise.resolve({ url: phoneRemoteUrl(here), source: 'page', reachable: true })
    return resolved
  }
  resolved = deviceClient
    .startTvLogin('Kumanda QR')
    .then(async (s): Promise<PhoneAddress> => {
      const lan = lanOriginOf(s.verificationUrl)
      if (!lan) return { url: phoneRemoteUrl(here), source: 'local', reachable: false }
      return { url: phoneRemoteUrl(lan), source: 'server', reachable: await probe(lan) }
    })
    .catch((): PhoneAddress => {
      resolved = null // sonra yeniden denensin
      return { url: phoneRemoteUrl(here), source: 'local', reachable: false }
    })
  return resolved
}

/* ───────────── Kumanda sinyali ───────────── */

let lastKey: RemoteKeyEvent | null = null
const keyListeners = new Set<() => void>()
devbus.subscribe((e) => {
  const k = remoteKeyOf(e)
  if (!k) return
  lastKey = k
  for (const l of keyListeners) l()
})

function useLastRemoteKey(): RemoteKeyEvent | null {
  const [k, setK] = useState<RemoteKeyEvent | null>(lastKey)
  useEffect(() => {
    const on = (): void => setK(lastKey)
    keyListeners.add(on)
    return () => {
      keyListeners.delete(on)
    }
  }, [])
  return k
}

function SignalLamp(): ReactElement {
  const key = useLastRemoteKey()
  const [lit, setLit] = useState(false)
  useEffect(() => {
    if (!key) return
    setLit(true)
    const t = window.setTimeout(() => setLit(false), 700)
    return () => window.clearTimeout(t)
  }, [key])
  return (
    <div className={cx('tvr-signal', lit && 'is-lit')} role="status" aria-live="polite" data-lit={lit || undefined}>
      <span className="tvr-signal__lamp" aria-hidden="true" />
      <span className="tvr-signal__text">
        {key ? (
          <>
            <strong>{keyLabel(key.key)}</strong> · {key.from}
          </>
        ) : (
          'Telefondan bir tuşa bas, burada yanar.'
        )}
      </span>
    </div>
  )
}

/* ───────────── Cihazlar ───────────── */

const KIND_ICON: Record<DeviceInfo['kind'], TvIconName> = { TV: 'tv', MOBILE: 'phone', WEB: 'laptop' }
const KIND_TEXT: Record<DeviceInfo['kind'], string> = { TV: 'TV', MOBILE: 'Telefon', WEB: 'Tarayıcı' }

function DeviceRow({ device }: { device: DeviceInfo }): ReactElement {
  const { ref, focused } = useFocusable<HTMLDivElement>({ id: `${SCREEN}:cihaz:${device.deviceId}` })
  return (
    <div
      ref={ref}
      role="listitem"
      aria-label={`${device.name}, ${KIND_TEXT[device.kind]}, ${device.online ? 'çevrimiçi' : 'çevrimdışı'}`}
      className={cx('tvr-device', focused && 'is-focused')}
    >
      <TvIcon name={KIND_ICON[device.kind]} size={2} />
      <span className="tvr-device__name">{device.name}</span>
      <span className={cx('tvr-device__state', device.online && 'is-online')}>
        <span className="tvr-device__dot" aria-hidden="true" />
        {device.online ? 'Çevrimiçi' : 'Çevrimdışı'}
      </span>
    </div>
  )
}

/* ───────────── Ekran ───────────── */

export function TvRemote(): ReactElement {
  const navigate = useNavigate()
  const back = useTvBack()
  const state = useDeviceState()
  const [address, setAddress] = useState<PhoneAddress | null>(null)
  const [qr, setQr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void resolveAddress().then((a) => {
      if (!alive) return
      setAddress(a)
      devbus.emit(
        'device',
        'kumanda QR',
        { url: a.url, source: a.source, reachable: a.reachable },
        { ok: a.reachable !== false },
      )
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!address) return
    let alive = true
    QRCode.toString(address.url, {
      type: 'svg',
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    }).then(
      (svg) => alive && setQr(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`),
      () => alive && setQr(null),
    )
    return () => {
      alive = false
    }
  }, [address])

  // Çevrimiçiler önce, sonra en son görülenler; ekrana sığan kadar (gizli satır odak adayı olmasın).
  const all = state.devices
    .filter((d) => d.kind !== 'TV')
    .sort((a, b) => Number(b.online) - Number(a.online) || b.lastSeenAt.localeCompare(a.lastSeenAt))
  const phones = all.slice(0, MAX_DEVICES)

  return (
    <TvScreen id={SCREEN} title="Telefonla Kontrol Et" defaultFocus={`${SCREEN}:tamam`} className="tvr">
      <div className="tvr-cols">
        <div className="tvr-main">
          <h1 className="tv-heading tvr-title">Telefonla Kontrol Et</h1>
          <ol className="tvr-steps">
            <li>
              <span className="tvr-steps__n">1</span>Telefonunun kamerasıyla QR kodu okut.
            </li>
            <li>
              <span className="tvr-steps__n">2</span>Açılan sayfada TV+ hesabınla gir.
            </li>
            <li>
              <span className="tvr-steps__n">3</span>Bu TV'yi seç, tuşlarla yönet.
            </li>
          </ol>

          <section className="tvr-devices" aria-labelledby="tvr-devices-title">
            <h2 className="tvr-label" id="tvr-devices-title">
              Hesaptaki telefon ve tarayıcılar
            </h2>
            {phones.length ? (
              <TvList id="kumanda-cihazlar" gap={0.5} label="Telefon ve tarayıcılar" className="tvr-devices__list">
                {phones.map((d) => (
                  <DeviceRow key={d.deviceId} device={d} />
                ))}
              </TvList>
            ) : (
              <p className="tv-subtle tvr-devices__empty">Henüz bağlı telefon yok.</p>
            )}
            {all.length > phones.length && (
              <p className="tv-subtle tvr-devices__more">ve {all.length - phones.length} cihaz daha (Ayarlar)</p>
            )}
          </section>

          <div className="tvr-actions">
            <TvButton id={`${SCREEN}:tamam`} label="Tamam" icon="check" onPress={back} />
            <TvButton
              id={`${SCREEN}:ayarlar`}
              label="Ayarlar"
              icon="settings"
              onPress={() => navigate('/tv/ayarlar')}
            />
          </div>
        </div>

        <aside className="tvr-side" aria-label="QR kod">
          <div className="tvr-qr" aria-busy={!qr}>
            {qr ? (
              <img src={qr} alt={`Kumanda adresinin QR kodu: ${address?.url ?? ''}`} data-url={address?.url} />
            ) : (
              <div className="tvr-qr__wait" />
            )}
          </div>
          <p className="tvr-address">{address ? displayAddress(address.url) : '…'}</p>
          {address?.source === 'local' && (
            <p className="tvr-note">
              Bu TV adresi yalnız bu bilgisayarda açılıyor. Telefonda localhost yerine bilgisayarın ağ adresini yaz.
            </p>
          )}
          {address?.source === 'server' && address.reachable === false && (
            <p className="tvr-note">
              Bu adres şu an yerel ağa açık değil. TV+ ağ adresinden yayınlanınca telefonun bağlanır.
            </p>
          )}
          <SignalLamp />
        </aside>
      </div>
    </TvScreen>
  )
}
