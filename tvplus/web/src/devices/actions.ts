/**
 * Hedef cihaza giden kumanda eylemleri: tek sıralı kuyruk (sender.ts), iyimser oynatma durumu (progress.ts) ve
 * sakin hata geri bildirimi. Kumanda sayfası, "Şu an TV'de" çubuğu ve yansıtma paneli bunları paylaşır.
 */
import { useSyncExternalStore } from 'react'
import type { DeviceInfo, NowPlaying, RemoteCommand, RemoteKey } from '../../../shared/devices'
import { deviceClient } from './client'
import { applyOptimistic, positionAt, type Optimistic } from './progress'
import { CommandQueue, type SendResult } from './sender'

/* ───────────── bağlantı geri bildirimi ───────────── */

export interface SendStatus {
  /** Son komut teslim edilemediyse cihaz adı ve zamanı */
  failedAt: number | null
  failedTo: string | null
  /** Son başarılı teslim (ms) */
  okAt: number | null
}

let status: SendStatus = { failedAt: null, failedTo: null, okAt: null }
const statusListeners = new Set<() => void>()
const setStatus = (s: SendStatus) => {
  status = s
  for (const l of statusListeners) l()
}
export function useSendStatus(): SendStatus {
  return useSyncExternalStore(
    (fn) => {
      statusListeners.add(fn)
      return () => statusListeners.delete(fn)
    },
    () => status,
  )
}

let lastTarget: string | null = null
const queue = new CommandQueue({
  send: (id, cmd) => deviceClient.sendCommand(id, cmd),
  onResult: (_cmd, result: SendResult) => {
    const name = deviceClient.getState().devices.find((d) => d.deviceId === lastTarget)?.name ?? null
    if (result === 'delivered') {
      if (status.failedAt !== null || status.okAt === null || Date.now() - status.okAt > 1000)
        setStatus({ failedAt: null, failedTo: null, okAt: Date.now() })
    } else setStatus({ ...status, failedAt: Date.now(), failedTo: name })
  },
})

/** Kısa titreşim (destekleyen telefonlarda). */
export function buzz(ms = 12): void {
  try {
    navigator.vibrate?.(ms)
  } catch {
    /* desteklenmiyor */
  }
}

export function send(deviceId: string, cmd: RemoteCommand): Promise<SendResult> {
  if (lastTarget !== deviceId) {
    queue.clear()
    lastTarget = deviceId
  }
  return queue.enqueue(deviceId, cmd)
}

export function sendKey(deviceId: string, key: RemoteKey): Promise<SendResult> {
  return send(deviceId, { type: 'KEY', key })
}

/* ───────────── iyimser oynatma durumu ───────────── */

const optimistic = new Map<string, Optimistic>()
let optVersion = 0
const optListeners = new Set<() => void>()
const bumpOptimistic = () => {
  optVersion++
  for (const l of optListeners) l()
}
function patchOptimistic(device: DeviceInfo, patch: Omit<Optimistic, 'basedOn' | 'at'>): void {
  const np = device.nowPlaying
  if (!np) return
  const prev = optimistic.get(device.deviceId)
  const base = prev && prev.basedOn === np.updatedAt ? prev : null
  optimistic.set(device.deviceId, { ...(base ?? {}), ...patch, basedOn: np.updatedAt, at: Date.now() })
  bumpOptimistic()
}

/** İyimser katmanı uygulanmış oynatma durumu (TV bildirimi gelince katman kendiliğinden düşer). */
export function useEffectiveNowPlaying(device: DeviceInfo | null, now: number): NowPlaying | null {
  useSyncExternalStore(
    (fn) => {
      optListeners.add(fn)
      return () => optListeners.delete(fn)
    },
    () => optVersion,
  )
  const np = device?.nowPlaying ?? null
  if (!device || !np) return null
  return applyOptimistic(np, optimistic.get(device.deviceId) ?? null, now)
}

/* ───────────── oynatma eylemleri ───────────── */

function effective(device: DeviceInfo): NowPlaying | null {
  const np = device.nowPlaying
  return np ? applyOptimistic(np, optimistic.get(device.deviceId) ?? null, Date.now()) : null
}

export function togglePlay(device: DeviceInfo): void {
  const np = effective(device)
  if (np) patchOptimistic(device, { paused: !np.paused, positionSec: positionAt(np, Date.now()) })
  void sendKey(device.deviceId, 'PLAY_PAUSE')
}

export function seekTo(device: DeviceInfo, sec: number): void {
  const np = effective(device)
  if (!np || np.live) return
  const max = np.durationSec ?? Number.POSITIVE_INFINITY
  const target = Math.max(0, Math.min(max - 1, Math.round(sec)))
  patchOptimistic(device, { positionSec: target })
  void send(device.deviceId, { type: 'SEEK', positionSec: target })
}

export function seekBy(device: DeviceInfo, delta: number): void {
  const np = effective(device)
  if (!np || np.live) return
  seekTo(device, positionAt(np, Date.now()) + delta)
}

export function volumeBy(device: DeviceInfo, delta: number): void {
  const np = effective(device)
  if (!np) {
    void sendKey(device.deviceId, delta > 0 ? 'VOLUME_UP' : 'VOLUME_DOWN')
    return
  }
  const base = np.muted ? 0 : np.volume
  const volume = Math.max(0, Math.min(100, base + delta))
  patchOptimistic(device, { volume, muted: volume === 0 })
  void send(device.deviceId, { type: 'VOLUME', volume })
}

export function toggleMute(device: DeviceInfo): void {
  const np = effective(device)
  if (np) patchOptimistic(device, { muted: !np.muted })
  void sendKey(device.deviceId, 'MUTE')
}

export function stopPlayback(device: DeviceInfo): Promise<SendResult> {
  return send(device.deviceId, { type: 'STOP' })
}
