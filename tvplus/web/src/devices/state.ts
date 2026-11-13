/**
 * Cihaz durumu (React): `deviceClient` üzerine useSyncExternalStore kancaları. `getState()` değişmedikçe aynı
 * nesneyi döndürür; türetilen listeler useMemo ile kararlı tutulur.
 */
import { useMemo, useSyncExternalStore } from 'react'
import type { DeviceInfo, NowPlaying } from '../../../shared/devices'
import { deviceClient, type DeviceClientState } from './client'
import { castTargets, playingOn } from './progress'

const subscribe = (fn: () => void): (() => void) => deviceClient.subscribe(fn)
const read = (): DeviceClientState => deviceClient.getState()

/** Tüm durum: bağlantı, bu cihaz, cihazlar, seçili hedef. */
export function useDeviceState(): DeviceClientState {
  return useSyncExternalStore(subscribe, read, read)
}

export function useDevices(): DeviceInfo[] {
  return useDeviceState().devices
}

export function useThisDevice(): DeviceInfo | null {
  return useDeviceState().thisDevice
}

/** Yansıtılabilecek çevrimiçi TV'ler (bu cihaz hariç). */
export function useOnlineTvs(): DeviceInfo[] {
  const devices = useDevices()
  return useMemo(() => castTargets(devices), [devices])
}

/** Kumanda / yansıtma hedefi (listede yoksa null) ve onun oynatma durumu. */
export function useTarget(): { target: DeviceInfo | null; nowPlaying: NowPlaying | null } {
  const s = useDeviceState()
  return useMemo(() => {
    const target = s.targetDeviceId ? (s.devices.find((d) => d.deviceId === s.targetDeviceId) ?? null) : null
    return { target, nowPlaying: playingOn(target) }
  }, [s.devices, s.targetDeviceId])
}

/** Hedef cihazı döndürür (React dışı). */
export function currentTarget(): DeviceInfo | null {
  const s = deviceClient.getState()
  return s.targetDeviceId ? (s.devices.find((d) => d.deviceId === s.targetDeviceId) ?? null) : null
}
