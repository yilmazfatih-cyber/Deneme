/**
 * Cihazlar (#/cihazlar): hesaptaki cihazlar canlı listesi — tür simgesi, ad (yerinde yeniden adlandırma),
 * "Bu cihaz", çevrimiçi durumu, ne oynattığı, "Oturumu Kapat" (onaylı; bu cihaz hariç) ve "TV'ye Bağlan"
 * (TV'deki QR'ı okut ya da kodu buraya gir).
 */
import { useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import type { DeviceInfo } from '../../../../shared/devices'
import { useDocumentTitle, useShellOptions } from '../../app'
import { deviceClient } from '../../devices/client'
import { checkCode } from '../../devices/code'
import { CodeField } from '../../devices/CodeField'
import { useDeviceState } from '../../devices/state'
import { kindIcon, kindLabel, OnlineDot } from '../../devices/ui'
import { Badge, Button, formatDayTime, Icon, Modal, Spinner, TextField, toast } from '../../ui'
import './remote.css'

export default function DevicesPage(): ReactElement {
  useShellOptions({ mobileTitle: 'Cihazlar' })
  useDocumentTitle('Cihazlar')
  const { devices, connection } = useDeviceState()
  const [removing, setRemoving] = useState<DeviceInfo | null>(null)

  return (
    <div className="dvp-page">
      <header>
        <h1 className="dvp-title ui-desktop-only">Cihazlar</h1>
        <p className="dvp-lead">
          Bu hesapla oturum açılan cihazlar. Adlarını değiştirebilir, oturumlarını kapatabilirsin.
        </p>
      </header>

      <section aria-labelledby="dvp-list">
        <h2 className="dvp-section-title" id="dvp-list">
          Cihazların
        </h2>
        {devices.length === 0 ? (
          connection === 'online' ? (
            <p className="dvp-meta">Henüz cihaz yok.</p>
          ) : (
            <Spinner label="Cihazlar yükleniyor" />
          )
        ) : (
          <ul className="dvp-list">
            {devices.map((d) => (
              <DeviceItem key={d.deviceId} device={d} onRemove={() => setRemoving(d)} />
            ))}
          </ul>
        )}
      </section>

      <ConnectTv />

      <Modal open={!!removing} onClose={() => setRemoving(null)} label="Oturumu kapat" maxWidth={440}>
        {removing ? <ConfirmRemove device={removing} onDone={() => setRemoving(null)} /> : <span />}
      </Modal>
    </div>
  )
}

function DeviceItem({ device, onRemove }: { device: DeviceInfo; onRemove: () => void }): ReactElement {
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(device.name)
  const [busy, setBusy] = useState(false)
  const np = device.online ? device.nowPlaying : null

  const save = async () => {
    const next = name.trim()
    if (!next || next === device.name) {
      setEditing(false)
      return
    }
    setBusy(true)
    try {
      await deviceClient.rename(device.deviceId, next.slice(0, 40))
      setEditing(false)
    } catch {
      toast('Ad kaydedilemedi. Tekrar dene.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="dvp-item">
      <span className="dvp-item__icon" title={kindLabel(device.kind)}>
        <Icon name={kindIcon(device.kind)} size={28} />
        <OnlineDot online={device.online} />
      </span>
      <div className="dvp-item__main">
        {editing ? (
          <form
            className="dvp-edit"
            onSubmit={(e) => {
              e.preventDefault()
              void save()
            }}
          >
            <TextField
              label="Cihaz adı"
              hideLabel
              value={name}
              onChange={setName}
              maxLength={40}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setName(device.name)
                  setEditing(false)
                }
              }}
            />
            <Button type="submit" variant="play" size="sm" busy={busy}>
              Kaydet
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setName(device.name)
                setEditing(false)
              }}
            >
              Vazgeç
            </Button>
          </form>
        ) : (
          <div className="dvp-item__name-row">
            <h3 className="dvp-item__name">{device.name}</h3>
            <button
              type="button"
              className="dvp-rename"
              aria-label={`${device.name} adını değiştir`}
              title="Adını değiştir"
              onClick={() => {
                setName(device.name)
                setEditing(true)
              }}
            >
              <Icon name="edit" size={18} />
            </button>
            {device.isThisDevice ? <Badge tone="neutral">Bu cihaz</Badge> : null}
          </div>
        )}
        <p className="dvp-meta">
          {kindLabel(device.kind)} ·{' '}
          {device.online ? <strong>Çevrimiçi</strong> : `Son görülme ${formatDayTime(device.lastSeenAt)}`}
          {device.profileName ? ` · ${device.profileName}` : ''}
        </p>
        {np ? (
          <p className="dvp-meta">
            {np.paused ? 'Duraklatıldı' : 'Oynatıyor'}: <strong>{np.title}</strong>
            {np.subtitle ? ` · ${np.subtitle}` : ''}
          </p>
        ) : null}
        <div className="dvp-actions">
          {device.kind === 'TV' && device.online && !device.isThisDevice ? (
            <Button
              size="sm"
              variant="play"
              icon="remote"
              onClick={() => {
                deviceClient.setTarget(device.deviceId)
                navigate('/kumanda')
              }}
            >
              Kumanda
            </Button>
          ) : null}
          {!device.isThisDevice ? (
            <Button size="sm" variant="secondary" icon="logout" onClick={onRemove}>
              Oturumu Kapat
            </Button>
          ) : null}
        </div>
      </div>
    </li>
  )
}

function ConfirmRemove({ device, onDone }: { device: DeviceInfo; onDone: () => void }): ReactElement {
  const [busy, setBusy] = useState(false)
  const confirm = async () => {
    setBusy(true)
    try {
      await deviceClient.remove(device.deviceId)
      toast(`${device.name} oturumu kapatıldı`, { kind: 'success' })
      onDone()
    } catch {
      toast('Oturum kapatılamadı. Tekrar dene.')
      setBusy(false)
    }
  }
  return (
    <div className="dvp-confirm">
      <h2>Oturum kapatılsın mı?</h2>
      <p>{device.name} bu hesaptan çıkar. Yeniden kullanmak için o cihazda tekrar giriş yapman gerekir.</p>
      <div className="dvp-confirm__actions">
        <Button variant="play" busy={busy} onClick={() => void confirm()}>
          Oturumu Kapat
        </Button>
        <Button variant="secondary" onClick={onDone} disabled={busy}>
          Vazgeç
        </Button>
      </div>
    </div>
  )
}

function ConnectTv(): ReactElement {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const go = (clean: string) => {
    if (checkCode(clean).kind !== 'complete') return
    navigate(`/bagla?kod=${clean}`)
  }
  return (
    <section aria-labelledby="dvp-connect" id="baglan">
      <h2 className="dvp-section-title" id="dvp-connect">
        TV'ye Bağlan
      </h2>
      <div className="dvp-connect">
        <div className="dvp-way">
          <h3>
            <Icon name="qr" size={22} />
            QR kodu okut
          </h3>
          <p>TV'de TV+'ı aç. Ekrandaki QR kodu telefonunun kamerasıyla okut, girişi onayla.</p>
        </div>
        <form
          className="dvp-way"
          onSubmit={(e) => {
            e.preventDefault()
            go(code)
          }}
        >
          <h3>
            <Icon name="keyboard" size={22} />
            Kodu gir
          </h3>
          <p>TV'deki 8 karakterlik kodu buraya yaz.</p>
          <CodeField value={code} onChange={setCode} onSubmit={go} label="TV'deki kod" />
          <Button type="submit" variant="play" disabled={checkCode(code).kind !== 'complete'}>
            Devam
          </Button>
        </form>
      </div>
    </section>
  )
}
