/**
 * "Cihazlar" sekmesi: bu cihaz, komut akışının bağlantı durumu, hesaptaki cihazlar ve devbus `device` olaylarının
 * canlı günlüğü (giden / gelen komutlar ve teslim sonucu, durum bildirimleri, TV girişi).
 */
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { RemoteCommand } from '../../../../shared/devices'
import { deviceClient } from '../../devices/client'
import { devbus, type DevEvent } from '../../lib/devbus'
import { fmtClock, fmtMs } from '../model/format'
import { ErrMark, Explainer, KV } from '../ui'

const MAX_ROWS = 120

function useDeviceEvents(): DevEvent[] {
  const [rows, setRows] = useState<DevEvent[]>(() =>
    devbus
      .snapshot()
      .filter((e) => e.cat === 'device')
      .reverse()
      .slice(0, MAX_ROWS),
  )
  useEffect(
    () =>
      devbus.subscribe((e) => {
        if (e.cat === 'device') setRows((prev) => [e, ...prev].slice(0, MAX_ROWS))
      }),
    [],
  )
  return rows
}

const CONNECTION_TEXT = {
  idle: 'kapalı (profil seçilmedi)',
  connecting: 'bağlanıyor',
  online: 'açık (SSE)',
  offline: 'koptu, yeniden deniyor',
} as const

/** Komutu tek satırda özetler: "KEY RIGHT", "CAST Video:80010001 @120", "SEEK 300". */
export function describeCommand(c: unknown): string | null {
  if (!c || typeof c !== 'object') return null
  const cmd = c as RemoteCommand
  switch (cmd.type) {
    case 'KEY':
      return `KEY ${cmd.key}`
    case 'TEXT':
      return `TEXT “${cmd.text}”${cmd.submit ? ' ↵' : ''}`
    case 'CAST':
      return `CAST ${cmd.viewableId}${cmd.positionSec ? ` @${cmd.positionSec}` : ''}`
    case 'SEEK':
      return `SEEK ${cmd.positionSec}`
    case 'VOLUME':
      return `VOLUME ${cmd.volume}`
    case 'NAVIGATE':
      return `NAVIGATE ${cmd.route}`
    case 'TRANSFER':
      return `TRANSFER → ${cmd.toDeviceId.slice(0, 8)}`
    case 'STOP':
      return 'STOP'
    default:
      return null
  }
}

function summary(e: DevEvent): string | null {
  const d = e.detail ?? {}
  const cmd = describeCommand(d.command)
  if (cmd) {
    const delivered = d.delivered
    return `${cmd}${delivered === true ? ' · teslim edildi' : delivered === false ? ' · teslim edilmedi' : ''}${
      typeof d.error === 'string' ? ` · ${d.error}` : ''
    }`
  }
  if (e.label === 'durum') {
    const np = d.nowPlaying as { title?: string; positionSec?: number; paused?: boolean } | null | undefined
    return `${String(d.screen ?? '')}${np ? ` · ${np.title ?? ''} ${np.positionSec ?? 0} sn${np.paused ? ' (duraklatıldı)' : ''}` : ''}`
  }
  if (typeof d.userCode === 'string') return d.userCode
  if (typeof d.error === 'string') return d.error
  return null
}

export function DevicesTab(): ReactNode {
  const state = useSyncExternalStore(
    (fn) => deviceClient.subscribe(fn),
    () => deviceClient.getState(),
  )
  const rows = useDeviceEvents()
  const me = state.thisDevice

  return (
    <div className="kp-tab">
      <Explainer netflix="MDX / Netflix Cast: ikinci ekran keşfi, eşleştirme ve komut kanalı">
        Her cihaz sunucuya kayıt olur ve açık bir olay akışıyla (SSE) komut bekler. Telefon bir tuşa basınca komut
        sunucu üzerinden TV'nin akışına iletilir; TV ekranını ve oynatma durumunu saniyede en çok bir kez bildirir.
      </Explainer>

      <h3 className="kp-h">Bu cihaz</h3>
      <KV
        rows={[
          ['ad', me ? me.name : '—'],
          ['tür', me ? me.kind : '—'],
          ['kimlik', <span className="kp-mono kp-break">{me ? me.deviceId : '—'}</span>],
          ['akış', CONNECTION_TEXT[state.connection]],
          [
            'hedef',
            state.targetDeviceId
              ? (state.devices.find((d) => d.deviceId === state.targetDeviceId)?.name ?? state.targetDeviceId)
              : '—',
          ],
        ]}
      />

      <h3 className="kp-h">Hesaptaki cihazlar ({state.devices.length})</h3>
      {state.devices.length === 0 ? (
        <p className="kp-empty">Liste boş. Profil seçilince cihaz kaydolur.</p>
      ) : (
        <ul className="kp-feed">
          {state.devices.map((d) => (
            <li key={d.deviceId} className="kp-feed-item">
              <div className="kp-feed-row" style={{ cursor: 'default' }}>
                <span className="kp-cat">{d.kind}</span>
                <span className="kp-label">
                  {d.name}
                  {d.isThisDevice ? ' (bu cihaz)' : ''}
                  <span className="kp-dim">
                    {' '}
                    · {d.online ? 'çevrimiçi' : 'çevrimdışı'}
                    {d.screen ? ` · ${d.screen}` : ''}
                    {d.nowPlaying ? ` · ${d.nowPlaying.title} ${d.nowPlaying.positionSec} sn` : ''}
                  </span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <h3 className="kp-h">Olaylar</h3>
      {rows.length === 0 ? (
        <p className="kp-empty">Henüz olay yok. Kumandada bir tuşa bas ya da TV'de İzle'yi dene.</p>
      ) : (
        <ol className="kp-feed">
          {rows.map((e) => {
            const s = summary(e)
            return (
              <li key={e.id} className="kp-feed-item">
                <div className="kp-feed-row" style={{ cursor: 'default' }}>
                  <span className="kp-time">{fmtClock(e.at)}</span>
                  <span className="kp-label">
                    {e.label}
                    {s ? <span className="kp-dim kp-mono"> {s}</span> : null}
                  </span>
                  {e.ms !== undefined ? <span className="kp-ms">{fmtMs(e.ms)}</span> : null}
                  {!e.ok ? <ErrMark label="başarısız" /> : null}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
