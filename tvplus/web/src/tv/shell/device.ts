/**
 * TV'nin cihaz istemcisine (web/src/devices/client.ts) bağlantısı ve oynatıcı köprüsü.
 */
import { useRef, useSyncExternalStore } from 'react'
import { deviceClient, type DeviceClientState } from '../../devices/client'
import type { NowPlaying } from '../../../../shared/devices'
import { playerRemote, type PlayerSnapshot } from '../../player'
import type { PlayerRemoteLike } from './commands'

/**
 * Cihaz durumu (React). `getState()` her çağrıda yeni nesne döndürse de (iskelet) içerik aynıysa aynı anlık görüntü
 * verilir — useSyncExternalStore sonsuz döngüye girmez.
 */
export function useDeviceState(): DeviceClientState {
  const cache = useRef<{ json: string; state: DeviceClientState } | null>(null)
  const read = (): DeviceClientState => {
    const s = deviceClient.getState()
    const json = JSON.stringify(s)
    if (cache.current?.json === json) return cache.current.state
    cache.current = { json, state: s }
    return s
  }
  return useSyncExternalStore((fn) => deviceClient.subscribe(fn), read, read)
}

let started = false

/** Profil seçildikten sonra: bu TV'yi cihaz olarak kaydet ve komut akışına bağlan (tekrar çağrılabilir). */
export function startTvDevice(): void {
  if (started) return
  started = true
  try {
    deviceClient.start({ kind: 'TV' })
  } catch {
    started = false
  }
}

/** Çıkışta akışı kapat. */
export function stopTvDevice(): void {
  if (!started) return
  started = false
  try {
    deviceClient.stop()
  } catch {
    /* iskelet */
  }
}

export const isTvDeviceStarted = (): boolean => started

/** Takılı oynatıcının kumanda yüzü (`playerRemote`, web/src/player); oynatma yoksa (getState() null) null. */
export function getPlayerRemote(): PlayerRemoteLike | null {
  return playerRemote.getState() ? playerRemote : null
}

/** TV oynatıcısı takılıyken fiziksel tuşları oynatıcı kendisi dinler: odak motoru geri çekilir. */
export const tvPlayerOwnsKeys = (): boolean => playerRemote.getState()?.chrome === 'tv'

/** Oynatıcı durumunu cihaz bildirimine çevirir (konum bu andan itibaren istemcide ilerletilir). */
export function nowPlayingOf(s: PlayerSnapshot | null, now = Date.now()): NowPlaying | null {
  if (!s) return null
  return {
    viewableId: s.viewableId,
    title: s.title,
    subtitle: s.subtitle,
    artUrl: s.artUrl,
    live: s.live,
    positionSec: s.positionSec,
    durationSec: s.durationSec,
    paused: s.paused,
    volume: s.volume,
    muted: s.muted,
    updatedAt: new Date(now).toISOString(),
  }
}
